/**
 * Alibaba Cloud Model Studio (DashScope) Paraformer-v2 file transcription.
 * Flow: getPolicy → upload WAV to temp OSS → submit async task → poll → fetch transcript JSON.
 */

import { PARAFORMER_MODEL } from './diaryAsrProvider'

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com'
const UPLOADS_URL = `${DASHSCOPE_BASE}/api/v1/uploads`
const TRANSCRIPTION_URL = `${DASHSCOPE_BASE}/api/v1/services/audio/asr/transcription`
const TASKS_URL = `${DASHSCOPE_BASE}/api/v1/tasks`

const POLL_INTERVAL_MS = 400
const POLL_MAX_MS = 90_000

export type ParaformerAsrResult =
  | { ok: true; text: string }
  | { ok: false; code: 'missing_api_key' | 'upload_failed' | 'transcribe_failed'; message: string }

type UploadPolicy = {
  policy: string
  signature: string
  upload_dir: string
  upload_host: string
  oss_access_key_id: string
  x_oss_object_acl: string
  x_oss_forbid_overwrite: string
}

function authHeaders(apiKey: string, extra?: Record<string, string>): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function getUploadPolicy(apiKey: string, model: string): Promise<UploadPolicy> {
  const url = `${UPLOADS_URL}?action=getPolicy&model=${encodeURIComponent(model)}`
  const res = await fetch(url, { headers: authHeaders(apiKey) })
  const body = (await res.json().catch(() => ({}))) as { data?: UploadPolicy; message?: string }
  if (!res.ok || !body.data?.upload_host || !body.data?.upload_dir) {
    throw new Error(body.message || `upload_policy_http_${res.status}`)
  }
  return body.data
}

async function uploadWavToOss(
  policy: UploadPolicy,
  wavBytes: Uint8Array,
  fileName: string,
): Promise<string> {
  const key = `${policy.upload_dir}/${fileName}`
  const form = new FormData()
  form.append('OSSAccessKeyId', policy.oss_access_key_id)
  form.append('Signature', policy.signature)
  form.append('policy', policy.policy)
  form.append('x-oss-object-acl', policy.x_oss_object_acl)
  form.append('x-oss-forbid-overwrite', policy.x_oss_forbid_overwrite)
  form.append('key', key)
  form.append('success_action_status', '200')
  const copy = new Uint8Array(wavBytes.byteLength)
  copy.set(wavBytes)
  form.append('file', new Blob([copy], { type: 'audio/wav' }), fileName)

  const res = await fetch(policy.upload_host, { method: 'POST', body: form })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text.slice(0, 160) || `oss_upload_http_${res.status}`)
  }
  return `oss://${key}`
}

async function submitTranscription(
  apiKey: string,
  fileUrl: string,
  languageHints: string[],
): Promise<string> {
  const res = await fetch(TRANSCRIPTION_URL, {
    method: 'POST',
    headers: authHeaders(apiKey, {
      'X-DashScope-Async': 'enable',
      'X-DashScope-OssResourceResolve': 'enable',
    }),
    body: JSON.stringify({
      model: PARAFORMER_MODEL,
      input: { file_urls: [fileUrl] },
      parameters: {
        channel_id: [0],
        language_hints: languageHints,
      },
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    output?: { task_id?: string }
    message?: string
    code?: string
  }
  const taskId = body.output?.task_id
  if (!res.ok || !taskId) {
    throw new Error(body.message || body.code || `submit_http_${res.status}`)
  }
  return taskId
}

type TaskResultRow = {
  transcription_url?: string
  subtask_status?: string
  code?: string
  message?: string
}

async function pollTask(apiKey: string, taskId: string): Promise<TaskResultRow[]> {
  const started = Date.now()
  while (Date.now() - started < POLL_MAX_MS) {
    const res = await fetch(`${TASKS_URL}/${encodeURIComponent(taskId)}`, {
      method: 'POST',
      headers: authHeaders(apiKey),
    })
    const body = (await res.json().catch(() => ({}))) as {
      output?: {
        task_status?: string
        results?: TaskResultRow[]
        message?: string
        code?: string
      }
      message?: string
    }
    if (!res.ok) {
      throw new Error(body.message || `task_http_${res.status}`)
    }
    const status = body.output?.task_status
    if (status === 'SUCCEEDED') {
      return Array.isArray(body.output?.results) ? body.output!.results! : []
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      throw new Error(body.output?.message || body.message || `task_${status || 'failed'}`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error('task_timeout')
}

export function extractTranscriptText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const root = payload as {
    transcripts?: Array<{ text?: string }>
    text?: string
  }
  if (Array.isArray(root.transcripts) && root.transcripts.length) {
    return root.transcripts
      .map((t) => (typeof t.text === 'string' ? t.text.trim() : ''))
      .filter(Boolean)
      .join('\n')
      .trim()
  }
  if (typeof root.text === 'string') return root.text.trim()
  return ''
}

async function fetchTranscriptText(transcriptionUrl: string): Promise<string> {
  const res = await fetch(transcriptionUrl)
  if (!res.ok) throw new Error(`result_http_${res.status}`)
  const json = await res.json()
  return extractTranscriptText(json)
}

/**
 * Transcribe 16 kHz mono WAV (base64, no data: prefix) via Paraformer-v2.
 */
export async function transcribeWithParaformer(
  wavBase64: string,
  apiKey: string,
  languageHints: string[] = ['zh', 'en'],
): Promise<ParaformerAsrResult> {
  const key = apiKey.trim()
  if (!key) {
    return {
      ok: false,
      code: 'missing_api_key',
      message: '请先在设置中填写百炼 API Key（Paraformer-v2）',
    }
  }
  if (!wavBase64) {
    return { ok: false, code: 'transcribe_failed', message: '录音无效' }
  }

  try {
    const wavBytes = base64ToUint8Array(wavBase64)
    const policy = await getUploadPolicy(key, PARAFORMER_MODEL)
    const fileName = `diary-${Date.now()}.wav`
    const ossUrl = await uploadWavToOss(policy, wavBytes, fileName)
    const taskId = await submitTranscription(key, ossUrl, languageHints)
    const results = await pollTask(key, taskId)
    const row = results.find((r) => r.subtask_status === 'SUCCEEDED' && r.transcription_url) || results[0]
    if (!row?.transcription_url) {
      const detail = row?.message || row?.code || '无转写结果'
      return { ok: false, code: 'transcribe_failed', message: detail }
    }
    const text = await fetchTranscriptText(row.transcription_url)
    if (!text) {
      return { ok: false, code: 'transcribe_failed', message: '没听清' }
    }
    return { ok: true, text }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/upload|policy|oss/i.test(msg)) {
      return { ok: false, code: 'upload_failed', message: `上传失败：${msg.slice(0, 120)}` }
    }
    return { ok: false, code: 'transcribe_failed', message: `云端转写失败：${msg.slice(0, 120)}` }
  }
}
