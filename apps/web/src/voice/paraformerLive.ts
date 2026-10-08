/**
 * Live Paraformer ASR via our API WebSocket bridge (browser-safe BYOK).
 * Captures 16 kHz PCM from a MediaStream and streams while the user speaks.
 */
import { getApiBase, PRODUCTION_API_BASE } from '../api/base'
import { getParaformerApiKeyResolved } from '../family/store'

export type ParaformerLiveCallbacks = {
  onPartial?: (text: string) => void
  onDone?: (text: string) => void
  onError?: (message: string) => void
  onReady?: () => void
}

export type ParaformerLiveSession = {
  stop: () => Promise<string>
  getText: () => string
}

function wsApiBase(): string {
  const base = (getApiBase() || (typeof location !== 'undefined' ? location.origin : PRODUCTION_API_BASE)).replace(
    /\/$/,
    '',
  )
  if (base.startsWith('https://')) return `wss://${base.slice('https://'.length)}`
  if (base.startsWith('http://')) return `ws://${base.slice('http://'.length)}`
  if (typeof location !== 'undefined') {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.host}`
  }
  return 'ws://127.0.0.1:8787'
}

function floatTo16BitPcm(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}

/** Downsample/upsample linear to 16 kHz. */
export function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === 16000) return input
  const ratio = inputRate / 16000
  const outLen = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const i1 = Math.min(input.length - 1, i0 + 1)
    const t = src - i0
    out[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return out
}

export async function startParaformerLive(
  stream: MediaStream,
  callbacks: ParaformerLiveCallbacks = {},
  apiKey = getParaformerApiKeyResolved(),
): Promise<ParaformerLiveSession> {
  const key = apiKey.trim()
  if (!key) {
    throw new Error('请先在设置中填写百炼 API Key（Paraformer）')
  }

  let latestText = ''
  let doneText = ''
  let finished = false
  let readySettled = false
  let audioCtx: AudioContext | null = null
  let processor: ScriptProcessorNode | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let mute: GainNode | null = null
  let stopResolve: (() => void) | null = null

  const wsUrl = `${wsApiBase()}/api/asr/paraformer-stream`
  const ws = new WebSocket(wsUrl)
  ws.binaryType = 'arraybuffer'

  const ready = new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (!readySettled) {
        readySettled = true
        reject(new Error('实时转写连接超时'))
      }
    }, 12_000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'start', apiKey: key, languageHints: ['zh', 'en'] }))
    }

    ws.onerror = () => {
      if (readySettled) return
      readySettled = true
      window.clearTimeout(timer)
      reject(new Error('实时转写连接失败'))
    }

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      let msg: { type?: string; text?: string; message?: string }
      try {
        msg = JSON.parse(ev.data) as typeof msg
      } catch {
        return
      }
      if (msg.type === 'ready') {
        if (!readySettled) {
          readySettled = true
          window.clearTimeout(timer)
          callbacks.onReady?.()
          resolve()
        }
        return
      }
      if (msg.type === 'partial' && typeof msg.text === 'string') {
        latestText = msg.text
        callbacks.onPartial?.(msg.text)
        return
      }
      if (msg.type === 'done') {
        doneText = String(msg.text || latestText || '').trim()
        latestText = doneText
        finished = true
        callbacks.onDone?.(doneText)
        stopResolve?.()
        stopResolve = null
        return
      }
      if (msg.type === 'error') {
        const m = msg.message || 'realtime_error'
        callbacks.onError?.(m)
        if (!readySettled) {
          readySettled = true
          window.clearTimeout(timer)
          reject(new Error(m))
        }
        finished = true
        stopResolve?.()
        stopResolve = null
      }
    }
  })

  await ready

  audioCtx = new AudioContext()
  source = audioCtx.createMediaStreamSource(stream)
  processor = audioCtx.createScriptProcessor(4096, 1, 1)
  mute = audioCtx.createGain()
  mute.gain.value = 0
  processor.onaudioprocess = (ev) => {
    if (ws.readyState !== WebSocket.OPEN || finished) return
    const input = ev.inputBuffer.getChannelData(0)
    const resampled = resampleTo16k(input, audioCtx!.sampleRate)
    ws.send(floatTo16BitPcm(resampled))
  }
  source.connect(processor)
  processor.connect(mute)
  mute.connect(audioCtx.destination)

  const teardownAudio = async () => {
    try {
      processor?.disconnect()
      source?.disconnect()
      mute?.disconnect()
      await audioCtx?.close()
    } catch {
      /* ignore */
    }
    processor = null
    source = null
    mute = null
    audioCtx = null
  }

  return {
    getText: () => (doneText || latestText).trim(),
    stop: async () => {
      await teardownAudio()
      if (finished) return doneText || latestText
      if (ws.readyState === WebSocket.OPEN) {
        const waitDone = new Promise<void>((resolve) => {
          stopResolve = resolve
          window.setTimeout(() => resolve(), 8_000)
        })
        ws.send(JSON.stringify({ type: 'stop' }))
        await waitDone
      }
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      return (doneText || latestText).trim()
    },
  }
}
