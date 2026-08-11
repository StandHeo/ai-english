import { Capacitor } from '@capacitor/core'

/**
 * 是否允许尝试打开麦克风。
 * - 浏览器：必须是安全上下文（https / localhost）
 * - Capacitor App：WKWebView 内允许尝试（需系统麦克风权限；勿因 capacitor: 误判拦死）
 */
export function isMicAllowedByBrowser(): boolean {
  if (typeof window === 'undefined') return false
  // App：即使暂时没有 mediaDevices（常见于缺 Info.plist 麦克风说明），也允许走到开麦逻辑给出明确错误
  if (Capacitor.isNativePlatform()) return true
  if (!window.isSecureContext) return false
  return Boolean(navigator.mediaDevices?.getUserMedia)
}

export function pageProtocolHint(): 'https' | 'http' | 'other' {
  if (typeof window === 'undefined') return 'other'
  if (window.location.protocol === 'https:') return 'https'
  if (window.location.protocol === 'http:') return 'http'
  return 'other'
}

/** 给用户看的简短协议说明 */
export function pageProtocolLabel(): string {
  if (typeof window === 'undefined') return 'unknown'
  return window.location.protocol.replace(/:$/, '') || 'unknown'
}

export type BrowserSpeechRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: {
    resultIndex: number
    results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean; length: number }>
  }) => void) | null
  onerror: ((ev: { error: string }) => void) | null
  onend: (() => void) | null
  onaudiostart: (() => void) | null
  onspeechstart: (() => void) | null
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
