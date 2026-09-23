import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  diaryWhisperModelLabel,
  getDiaryWhisperModelId,
  type DiaryWhisperModelId,
} from './diaryWhisperModel'

export type DiaryAsrErrorCode =
  | 'unavailable'
  | 'model_not_ready'
  | 'download_failed'
  | 'download_busy'
  | 'transcribe_failed'
  | 'invalid_audio'
  | 'unknown'

export type DiaryAsrResult =
  | { ok: true; text: string; modelId: DiaryWhisperModelId }
  | { ok: false; code: DiaryAsrErrorCode; message: string }

export type DiaryAsrStatus = {
  available: boolean
  platform: 'web' | 'native'
  modelReady: boolean
  modelId: DiaryWhisperModelId
  packaged?: boolean
  needsDownload?: boolean
  downloadBytes?: number
  detail?: string
}

export type DiaryWhisperDownloadProgress = {
  modelId: string
  received: number
  total: number
  fraction: number
  phase: 'start' | 'progress' | 'done' | 'error' | string
}

type DiaryWhisperPlugin = {
  listModels(): Promise<{
    models: Array<{
      id: string
      label: string
      ready: boolean
      packaged: boolean
      needsDownload?: boolean
      downloadBytes?: number
    }>
    defaultId: string
  }>
  isReady(options?: {
    modelId?: string
  }): Promise<{
    ready: boolean
    detail?: string
    modelId?: string
    packaged?: boolean
    needsDownload?: boolean
    downloadBytes?: number
  }>
  prepareModel(options?: {
    modelId?: string
  }): Promise<{
    ready: boolean
    detail?: string
    modelId?: string
    packaged?: boolean
    needsDownload?: boolean
    downloadBytes?: number
  }>
  downloadModel(options?: {
    modelId?: string
  }): Promise<{
    ready: boolean
    detail?: string
    modelId?: string
    packaged?: boolean
    needsDownload?: boolean
    downloadBytes?: number
  }>
  transcribe(options: {
    wavBase64: string
    language?: string
    modelId?: string
  }): Promise<{ text: string; modelId?: string }>
  addListener?(
    eventName: 'diaryWhisperDownload',
    listener: (event: DiaryWhisperDownloadProgress) => void,
  ): Promise<{ remove: () => void }>
}

const DiaryWhisper = registerPlugin<DiaryWhisperPlugin>('DiaryWhisper', {
  web: () => import('./diaryWhisperWeb').then((m) => new m.DiaryWhisperWeb()),
})

function friendly(code: DiaryAsrErrorCode, detail?: string): string {
  switch (code) {
    case 'unavailable':
      return '端侧 Whisper 仅在 App（APK）中可用，浏览器请用打字，或安装后使用语音日记。'
    case 'model_not_ready':
      return detail || '端侧 Whisper 模型尚未就绪，请稍后再试或先用手改文字。'
    case 'download_failed':
      return detail || '模型下载失败，请检查网络后重试。'
    case 'download_busy':
      return detail || '已有模型正在下载，请稍候。'
    case 'transcribe_failed':
      return detail || '转写失败，已保留录音，可手改文字后重试。'
    case 'invalid_audio':
      return '录音无效，请再说一段短一点的话。'
    default:
      return detail || '语音转写出错，请改用打字。'
  }
}

function mapStatus(
  modelId: DiaryWhisperModelId,
  ready: {
    ready: boolean
    detail?: string
    packaged?: boolean
    needsDownload?: boolean
    downloadBytes?: number
  },
): DiaryAsrStatus {
  return {
    available: true,
    platform: 'native',
    modelReady: Boolean(ready.ready),
    modelId,
    packaged: Boolean(ready.packaged),
    needsDownload: Boolean(ready.needsDownload),
    downloadBytes: typeof ready.downloadBytes === 'number' ? ready.downloadBytes : undefined,
    detail: ready.ready
      ? `端侧 Whisper ${diaryWhisperModelLabel(modelId)} 已就绪`
      : friendly('model_not_ready', ready.detail),
  }
}

export async function getDiaryAsrStatus(
  modelId: DiaryWhisperModelId = getDiaryWhisperModelId(),
): Promise<DiaryAsrStatus> {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      platform: 'web',
      modelReady: false,
      modelId,
      detail: friendly('unavailable'),
    }
  }
  try {
    let ready = await DiaryWhisper.isReady({ modelId })
    // Tiny 等已打包模型：prepare 解包到 files；首屏不要误报「缺少模型」
    if (!ready.ready && !ready.needsDownload) {
      ready = await DiaryWhisper.prepareModel({ modelId })
    }
    return mapStatus(modelId, ready)
  } catch {
    return {
      available: true,
      platform: 'native',
      modelReady: false,
      modelId,
      detail: friendly('model_not_ready', '原生 Whisper 插件未正确加载'),
    }
  }
}

export async function prepareDiaryWhisperModel(
  modelId: DiaryWhisperModelId = getDiaryWhisperModelId(),
): Promise<DiaryAsrStatus> {
  return getDiaryAsrStatus(modelId)
}

export async function listDiaryWhisperModels() {
  if (!Capacitor.isNativePlatform()) {
    return {
      models: [] as Array<{
        id: string
        label: string
        ready: boolean
        packaged: boolean
        needsDownload?: boolean
        downloadBytes?: number
      }>,
      defaultId: 'tiny',
    }
  }
  return DiaryWhisper.listModels()
}

/** Download Base/Small (or unpack packaged Tiny). Emits diaryWhisperDownload progress events. */
export async function downloadDiaryWhisperModel(
  modelId: DiaryWhisperModelId,
  onProgress?: (p: DiaryWhisperDownloadProgress) => void,
): Promise<DiaryAsrStatus> {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      platform: 'web',
      modelReady: false,
      modelId,
      detail: friendly('unavailable'),
    }
  }
  let handle: { remove: () => void } | undefined
  try {
    if (onProgress && typeof DiaryWhisper.addListener === 'function') {
      handle = await DiaryWhisper.addListener('diaryWhisperDownload', onProgress)
    }
    const ready = await DiaryWhisper.downloadModel({ modelId })
    if (!ready.ready) {
      // After download, prepare/load context (esp. iOS)
      const prepared = await DiaryWhisper.prepareModel({ modelId })
      return mapStatus(modelId, prepared)
    }
    const prepared = await DiaryWhisper.prepareModel({ modelId })
    return mapStatus(modelId, prepared.ready ? prepared : ready)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const code: DiaryAsrErrorCode = /busy/i.test(msg)
      ? 'download_busy'
      : /download/i.test(msg)
        ? 'download_failed'
        : 'model_not_ready'
    return {
      available: true,
      platform: 'native',
      modelReady: false,
      modelId,
      needsDownload: true,
      detail: friendly(code, msg),
    }
  } finally {
    handle?.remove()
  }
}

export async function isDiaryAsrAvailable(): Promise<boolean> {
  const s = await getDiaryAsrStatus()
  return s.available && s.modelReady
}

/**
 * Transcribe diary audio via on-device Whisper (Capacitor).
 * Never calls cloud OpenAI ASR.
 */
export async function transcribeDiaryAudio(
  wavBase64: string,
  language = 'zh',
  modelId: DiaryWhisperModelId = getDiaryWhisperModelId(),
): Promise<DiaryAsrResult> {
  if (!wavBase64) {
    return { ok: false, code: 'invalid_audio', message: friendly('invalid_audio') }
  }
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, code: 'unavailable', message: friendly('unavailable') }
  }

  try {
    let ready = await DiaryWhisper.isReady({ modelId })
    if (!ready.ready && !ready.needsDownload) {
      ready = await DiaryWhisper.prepareModel({ modelId })
    }
    if (!ready.ready) {
      return {
        ok: false,
        code: 'model_not_ready',
        message: ready.needsDownload
          ? `请先下载 ${diaryWhisperModelLabel(modelId)} 模型（设置 → 语音转写模型）`
          : friendly('model_not_ready', ready.detail),
      }
    }
    const { text } = await DiaryWhisper.transcribe({ wavBase64, language, modelId })
    const trimmed = (text || '').trim()
    if (!trimmed) {
      return {
        ok: false,
        code: 'transcribe_failed',
        message: friendly('transcribe_failed', '没听清'),
      }
    }
    return { ok: true, text: trimmed, modelId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/model|ready|asset|missing|download/i.test(msg)) {
      return { ok: false, code: 'model_not_ready', message: friendly('model_not_ready', msg) }
    }
    return { ok: false, code: 'transcribe_failed', message: friendly('transcribe_failed', msg) }
  }
}
