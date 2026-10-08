/** Diary ASR engine preference (on-device Whisper vs cloud Paraformer). */

export type DiaryAsrProvider = 'on-device' | 'paraformer-v2'

export type DiaryAsrProviderOption = {
  id: DiaryAsrProvider
  label: string
  hint: string
}

export const DIARY_ASR_PROVIDERS: DiaryAsrProviderOption[] = [
  {
    id: 'on-device',
    label: '端侧 Whisper',
    hint: '仅 App；不上传录音；可选手 Tiny / Base / Small',
  },
  {
    id: 'paraformer-v2',
    label: '云端 Paraformer 实时',
    hint: '阿里云百炼实时识别；边说边出字；需填 API Key 与联网',
  },
]

const KEY = 'ai-english-diary-asr-provider-v1'
export const DEFAULT_DIARY_ASR_PROVIDER: DiaryAsrProvider = 'on-device'
export const PARAFORMER_MODEL = 'paraformer-v2'

export function isDiaryAsrProvider(value: string): value is DiaryAsrProvider {
  return value === 'on-device' || value === 'paraformer-v2'
}

export function getDiaryAsrProvider(): DiaryAsrProvider {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw && isDiaryAsrProvider(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_DIARY_ASR_PROVIDER
}

export function setDiaryAsrProvider(id: DiaryAsrProvider): void {
  localStorage.setItem(KEY, id)
}

export function diaryAsrProviderLabel(id: DiaryAsrProvider): string {
  return DIARY_ASR_PROVIDERS.find((m) => m.id === id)?.label ?? id
}
