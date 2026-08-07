/** Diary Whisper model preference (App only; browser ignores). */

export type DiaryWhisperModelId = 'tiny' | 'base' | 'small'

export type DiaryWhisperModelOption = {
  id: DiaryWhisperModelId
  label: string
  hint: string
}

export const DIARY_WHISPER_MODELS: DiaryWhisperModelOption[] = [
  { id: 'tiny', label: 'Tiny', hint: '最快，体积小；识别可能不准' },
  { id: 'base', label: 'Base', hint: '更准一些，转写稍慢' },
  { id: 'small', label: 'Small', hint: '更准，体积大，转写更慢' },
]

const KEY = 'ai-english-diary-whisper-model-v1'
export const DEFAULT_DIARY_WHISPER_MODEL: DiaryWhisperModelId = 'tiny'

export function isDiaryWhisperModelId(value: string): value is DiaryWhisperModelId {
  return value === 'tiny' || value === 'base' || value === 'small'
}

export function getDiaryWhisperModelId(): DiaryWhisperModelId {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw && isDiaryWhisperModelId(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_DIARY_WHISPER_MODEL
}

export function setDiaryWhisperModelId(id: DiaryWhisperModelId): void {
  localStorage.setItem(KEY, id)
}

export function diaryWhisperModelLabel(id: DiaryWhisperModelId): string {
  return DIARY_WHISPER_MODELS.find((m) => m.id === id)?.label ?? id
}
