import { Capacitor, registerPlugin } from '@capacitor/core'

export type DiaryAsrErrorCode =
  | 'unavailable'
  | 'model_not_ready'
  | 'transcribe_failed'
  | 'invalid_audio'
  | 'unknown'

export type DiaryAsrResult =
  | { ok: true; text: string }
  | { ok: false; code: DiaryAsrErrorCode; message: string }

export type DiaryAsrStatus = {
  available: boolean
  platform: 'web' | 'native'
  modelReady: boolean
  detail?: string
}

type DiaryWhisperPlugin = {
  isReady(): Promise<{ ready: boolean; detail?: string }>
  prepareModel(): Promise<{ ready: boolean; detail?: string }>
  transcribe(options: {
    wavBase64: string
    language?: string
  }): Promise<{ text: string }>
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
    case 'transcribe_failed':
      return detail || '转写失败，已保留录音，可手改文字后重试。'
    case 'invalid_audio':
      return '录音无效，请再说一段短一点的话。'
    default:
      return detail || '语音转写出错，请改用打字。'
  }
}

export async function getDiaryAsrStatus(): Promise<DiaryAsrStatus> {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      platform: 'web',
      modelReady: false,
      detail: friendly('unavailable'),
    }
  }
  try {
    const ready = await DiaryWhisper.isReady()
    return {
      available: true,
      platform: 'native',
      modelReady: Boolean(ready.ready),
      detail: ready.detail,
    }
  } catch {
    return {
      available: true,
      platform: 'native',
      modelReady: false,
      detail: friendly('model_not_ready', '原生 Whisper 插件未正确加载'),
    }
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
): Promise<DiaryAsrResult> {
  if (!wavBase64) {
    return { ok: false, code: 'invalid_audio', message: friendly('invalid_audio') }
  }
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, code: 'unavailable', message: friendly('unavailable') }
  }

  try {
    let ready = await DiaryWhisper.isReady()
    if (!ready.ready) {
      ready = await DiaryWhisper.prepareModel()
    }
    if (!ready.ready) {
      return {
        ok: false,
        code: 'model_not_ready',
        message: friendly('model_not_ready', ready.detail),
      }
    }
    const { text } = await DiaryWhisper.transcribe({ wavBase64, language })
    const trimmed = (text || '').trim()
    if (!trimmed) {
      return {
        ok: false,
        code: 'transcribe_failed',
        message: friendly('transcribe_failed', '没听清'),
      }
    }
    return { ok: true, text: trimmed }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/model|ready|asset|missing/i.test(msg)) {
      return { ok: false, code: 'model_not_ready', message: friendly('model_not_ready', msg) }
    }
    return { ok: false, code: 'transcribe_failed', message: friendly('transcribe_failed', msg) }
  }
}
