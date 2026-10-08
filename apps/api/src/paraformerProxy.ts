/**
 * Browser-safe WebSocket bridge to DashScope Paraformer realtime ASR.
 * Client cannot set Authorization on WebSocket; we open upstream with the BYOK key.
 *
 * Client protocol:
 *   → { type: 'start', apiKey, languageHints? }
 *   ← { type: 'ready' }
 *   → binary Int16LE PCM mono 16 kHz
 *   ← { type: 'partial', text, committed }
 *   → { type: 'stop' }
 *   ← { type: 'done', text } | { type: 'error', message }
 */
import type { Server as HttpServer, IncomingMessage } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, WebSocket } from 'ws'

const UPSTREAM = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
const MODEL = 'paraformer-realtime-v2'
const PATH = '/api/asr/paraformer-stream'

type ClientStart = {
  type: 'start'
  apiKey?: string
  languageHints?: string[]
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload))
}

export function parseDashScopeText(msg: unknown): {
  event?: string
  text?: string
  sentenceEnd?: boolean
} {
  if (!msg || typeof msg !== 'object') return {}
  const root = msg as {
    header?: { event?: string }
    payload?: {
      output?: {
        sentence?: {
          text?: string
          sentence_end?: boolean
          end_time?: number | null
        }
      }
    }
  }
  const event = root.header?.event
  const sentence = root.payload?.output?.sentence
  const text = typeof sentence?.text === 'string' ? sentence.text : undefined
  const sentenceEnd =
    Boolean(sentence?.sentence_end) ||
    (sentence?.end_time != null && Number.isFinite(sentence.end_time))
  return { event, text, sentenceEnd }
}

export function attachParaformerProxy(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.pathname !== PATH) return
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (client: WebSocket, _req: IncomingMessage) => {
    let upstream: WebSocket | null = null
    let taskId = ''
    let started = false
    let closed = false
    let committed = ''
    let partial = ''
    const pendingAudio: Buffer[] = []

    const cleanup = () => {
      if (closed) return
      closed = true
      try {
        upstream?.close()
      } catch {
        /* ignore */
      }
      upstream = null
      try {
        if (client.readyState === WebSocket.OPEN) client.close()
      } catch {
        /* ignore */
      }
    }

    const emitPartial = () => {
      const text = `${committed}${partial}`.trim()
      sendJson(client, { type: 'partial', text, committed: committed.trim(), partial })
    }

    const openUpstream = (apiKey: string, languageHints: string[]) => {
      taskId = randomUUID()
      upstream = new WebSocket(UPSTREAM, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })

      upstream.on('open', () => {
        upstream?.send(
          JSON.stringify({
            header: {
              action: 'run-task',
              task_id: taskId,
              streaming: 'duplex',
            },
            payload: {
              task_group: 'audio',
              task: 'asr',
              function: 'recognition',
              model: MODEL,
              parameters: {
                format: 'pcm',
                sample_rate: 16000,
                language_hints: languageHints,
              },
              input: {},
            },
          }),
        )
      })

      upstream.on('message', (data, isBinary) => {
        if (isBinary) return
        let parsed: unknown
        try {
          parsed = JSON.parse(String(data))
        } catch {
          return
        }
        const { event, text, sentenceEnd } = parseDashScopeText(parsed)
        if (event === 'task-started') {
          started = true
          sendJson(client, { type: 'ready' })
          for (const chunk of pendingAudio) {
            if (upstream?.readyState === WebSocket.OPEN) upstream.send(chunk)
          }
          pendingAudio.length = 0
          return
        }
        if (event === 'result-generated' && text != null) {
          if (sentenceEnd) {
            committed = `${committed}${text}`
            partial = ''
          } else {
            partial = text
          }
          emitPartial()
          return
        }
        if (event === 'task-finished') {
          const finalText = `${committed}${partial}`.trim()
          sendJson(client, { type: 'done', text: finalText })
          cleanup()
          return
        }
        if (event === 'task-failed') {
          const msg =
            (parsed as { header?: { error_message?: string; error_code?: string } })?.header
              ?.error_message ||
            (parsed as { header?: { error_code?: string } })?.header?.error_code ||
            'task_failed'
          sendJson(client, { type: 'error', message: String(msg) })
          cleanup()
        }
      })

      upstream.on('error', (err) => {
        sendJson(client, {
          type: 'error',
          message: err instanceof Error ? err.message : 'upstream_error',
        })
        cleanup()
      })

      upstream.on('close', () => {
        if (!closed) {
          const finalText = `${committed}${partial}`.trim()
          if (finalText) sendJson(client, { type: 'done', text: finalText })
          else sendJson(client, { type: 'error', message: 'upstream_closed' })
        }
        cleanup()
      })
    }

    client.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
        if (!started) {
          pendingAudio.push(buf)
          return
        }
        if (upstream?.readyState === WebSocket.OPEN) upstream.send(buf)
        return
      }

      let msg: { type?: string; apiKey?: string; languageHints?: string[] }
      try {
        msg = JSON.parse(String(data)) as ClientStart
      } catch {
        sendJson(client, { type: 'error', message: 'invalid_json' })
        return
      }

      if (msg.type === 'start') {
        const apiKey = String(msg.apiKey || '').trim()
        if (!apiKey) {
          sendJson(client, { type: 'error', message: 'missing_api_key' })
          cleanup()
          return
        }
        if (upstream) return
        const hints = Array.isArray(msg.languageHints) && msg.languageHints.length
          ? msg.languageHints.map(String)
          : ['zh', 'en']
        openUpstream(apiKey, hints)
        return
      }

      if (msg.type === 'stop') {
        if (upstream?.readyState === WebSocket.OPEN && taskId) {
          upstream.send(
            JSON.stringify({
              header: {
                action: 'finish-task',
                task_id: taskId,
                streaming: 'duplex',
              },
              payload: { input: {} },
            }),
          )
        } else {
          sendJson(client, { type: 'done', text: `${committed}${partial}`.trim() })
          cleanup()
        }
      }
    })

    client.on('close', cleanup)
    client.on('error', cleanup)
  })

  return wss
}

export const PARAFORMER_STREAM_PATH = PATH
export const PARAFORMER_REALTIME_MODEL = MODEL
