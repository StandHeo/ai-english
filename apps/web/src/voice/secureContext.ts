/** 手机用 http://局域网IP 打开时通常不是安全上下文，浏览器会禁止麦克风。 */
export function isMicAllowedByBrowser(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.isSecureContext) return false
  return Boolean(navigator.mediaDevices?.getUserMedia)
}

export type BrowserSpeechRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
}

export function getSpeechRecognitionCtor():
  | (new () => BrowserSpeechRecognition)
  | null {
  const w = window as Window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}
