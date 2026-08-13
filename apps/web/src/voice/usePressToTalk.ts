import { useCallback, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import {
  getSpeechRecognitionCtor,
  isMicAllowedByBrowser,
  type BrowserSpeechRecognition,
} from './secureContext'
import {
  isNativeVoskAvailable,
  startVoskPcmCapture,
  type VoskPcmSession,
} from './voskNative'

export type TalkCapture = {
  transcript?: string
  blob?: Blob
  /** 浏览器端是否挂上了 SpeechRecognition / App Vosk */
  recognitionUsed?: boolean
  error?: 'insecure' | 'denied' | 'unsupported' | 'empty' | 'unknown' | 'recognition'
  /** 给人看的补充说明（如 Web Speech 的 error code） */
  detail?: string
  source?: 'vosk' | 'browser-speech' | 'none'
}

const LISTEN_MS = 5000

export type ListenOptions = {
  /** 关卡期望词，传给 Vosk grammar 提高短词准确率 */
  grammarWords?: string[]
  /** 自动结束聆听毫秒数；默认 5000（4 岁开口更从容） */
  listenMs?: number
}

/**
 * 手机优先：点一下开始听（约 5 秒），再点可提前结束。
 * - App（Capacitor）：离线 Vosk
 * - 网页：浏览器 SpeechRecognition + 录音兜底
 */
export function usePressToTalk() {
  const [recording, setRecording] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const voskSessionRef = useRef<VoskPcmSession | null>(null)
  const grammarRef = useRef<string[] | undefined>(undefined)
  const transcriptRef = useRef('')
  const recognitionUsedRef = useRef(false)
  const recognitionErrorRef = useRef<string | null>(null)
  const recognitionSourceRef = useRef<'vosk' | 'browser-speech' | 'none'>('none')
  const startPromiseRef = useRef<Promise<TalkCapture | null> | null>(null)
  const activeRef = useRef(false)
  const autoTimerRef = useRef<number | null>(null)

  const cleanupTimer = () => {
    if (autoTimerRef.current != null) {
      window.clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
  }

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const start = useCallback(async (): Promise<TalkCapture | null> => {
    if (activeRef.current || startPromiseRef.current) {
      return null
    }

    const run = (async (): Promise<TalkCapture | null> => {
      transcriptRef.current = ''
      recognitionUsedRef.current = false
      recognitionErrorRef.current = null
      recognitionSourceRef.current = 'none'
      chunksRef.current = []
      recognitionRef.current = null
      voskSessionRef.current = null
      mediaRef.current = null

      if (!isMicAllowedByBrowser()) {
        return {
          error: 'insecure',
          detail: `当前协议 ${window.location.protocol}，非安全上下文无法使用麦克风`,
        }
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        return {
          error: Capacitor.isNativePlatform() ? 'denied' : 'insecure',
          detail: Capacitor.isNativePlatform()
            ? 'App 未暴露麦克风接口。请确认 Info.plist 已加 NSMicrophoneUsageDescription，执行 npm run patch:ios-plist 后重新 Run。'
            : `当前协议 ${window.location.protocol}，浏览器未提供 mediaDevices`,
        }
      }

      // App 内：若仍不是安全上下文，getUserMedia 可能失败；先尝试，失败再报 denied/unknown
      activeRef.current = true
      setRecording(true)

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        })
        streamRef.current = stream
      } catch (err) {
        activeRef.current = false
        setRecording(false)
        const name = err instanceof DOMException ? err.name : ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          return { error: 'denied', detail: name }
        }
        if (name === 'NotFoundError') {
          return { error: 'unsupported', detail: '未找到麦克风设备' }
        }
        // WKWebView 偶发把 capacitor: 当非安全 → 提示重建 https scheme
        const msg = err instanceof Error ? err.message : String(err)
        if (/secure|permission|denied|NotSupported/i.test(msg) && Capacitor.isNativePlatform()) {
          return {
            error: 'denied',
            detail: `App 开麦失败（${window.location.protocol}）。请确认 Info.plist 麦克风权限后重新 Run。${msg}`,
          }
        }
        return {
          error: 'unknown',
          detail: msg,
        }
      }

      // 录音兜底（仍可上传给服务端）
      try {
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : MediaRecorder.isTypeSupported('audio/mp4')
              ? 'audio/mp4'
              : undefined
        const recorder = mime
          ? new MediaRecorder(stream, { mimeType: mime })
          : new MediaRecorder(stream)
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        mediaRef.current = recorder
        recorder.start(100)
      } catch {
        // 部分机型 MediaRecorder 失败时仍可走识别
      }

      if (isNativeVoskAvailable()) {
        try {
          voskSessionRef.current = await startVoskPcmCapture(stream)
          recognitionUsedRef.current = true
          recognitionSourceRef.current = 'vosk'
        } catch (err) {
          voskSessionRef.current = null
          recognitionUsedRef.current = false
          recognitionErrorRef.current =
            err instanceof Error ? `Vosk 启动失败: ${err.message}` : 'Vosk 启动失败'
        }
        return null
      }

      // 网页：浏览器英语识别
      const SpeechRecognition = getSpeechRecognitionCtor()
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition()
          recognition.lang = 'en-US'
          recognition.continuous = false
          recognition.interimResults = true
          recognition.maxAlternatives = 3
          recognition.onresult = (ev) => {
            let finalText = ''
            let interimText = ''
            for (let i = 0; i < ev.results.length; i += 1) {
              const piece = ev.results[i][0]?.transcript || ''
              if (ev.results[i].isFinal) finalText += piece
              else interimText += piece
            }
            const next = (finalText || interimText).trim()
            if (next) transcriptRef.current = next
          }
          recognition.onerror = (ev) => {
            if (ev.error === 'aborted') return
            recognitionErrorRef.current = ev.error || 'recognition_error'
          }
          recognitionRef.current = recognition
          recognitionUsedRef.current = true
          recognitionSourceRef.current = 'browser-speech'
          recognition.start()
        } catch (err) {
          recognitionRef.current = null
          recognitionUsedRef.current = false
          recognitionErrorRef.current =
            err instanceof Error ? err.message : 'SpeechRecognition.start failed'
        }
      } else {
        recognitionErrorRef.current =
          '当前浏览器不支持 Web Speech API（SpeechRecognition）'
      }

      return null
    })()

    startPromiseRef.current = run
    try {
      return await run
    } finally {
      startPromiseRef.current = null
    }
  }, [])

  const stop = useCallback(async (): Promise<TalkCapture> => {
    cleanupTimer()

    if (startPromiseRef.current) {
      const early = await startPromiseRef.current
      if (early?.error) {
        activeRef.current = false
        setRecording(false)
        releaseStream()
        return early
      }
      await new Promise((r) => window.setTimeout(r, 600))
    }

    if (
      !activeRef.current &&
      !mediaRef.current &&
      !recognitionRef.current &&
      !voskSessionRef.current
    ) {
      setRecording(false)
      return {
        error: 'empty',
        recognitionUsed: recognitionUsedRef.current,
        detail: recognitionErrorRef.current || '录音尚未开始',
        source: recognitionSourceRef.current,
      }
    }

    activeRef.current = false

    const voskSession = voskSessionRef.current
    voskSessionRef.current = null
    if (voskSession) {
      const vosk = await voskSession.stop(grammarRef.current)
      if (vosk.text) transcriptRef.current = vosk.text
      if (vosk.detail) recognitionErrorRef.current = vosk.detail
    }

    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      await new Promise<void>((resolve) => {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          resolve()
        }
        recognition.onend = finish
        try {
          recognition.stop()
        } catch {
          finish()
        }
        window.setTimeout(finish, 900)
      })
    }

    const recorder = mediaRef.current
    mediaRef.current = null
    let blob: Blob | undefined
    if (recorder && recorder.state !== 'inactive') {
      blob =
        (await new Promise<Blob | null>((resolve) => {
          recorder.onstop = () => {
            const data = new Blob(chunksRef.current, {
              type: recorder.mimeType || 'audio/webm',
            })
            resolve(data.size > 0 ? data : null)
          }
          try {
            recorder.stop()
          } catch {
            resolve(null)
          }
        })) || undefined
    }

    releaseStream()
    setRecording(false)

    const transcript = transcriptRef.current.trim()
    const recognitionUsed = recognitionUsedRef.current
    const detail = recognitionErrorRef.current || undefined
    const source = recognitionSourceRef.current
    if (transcript) {
      return { transcript, blob, recognitionUsed, detail, source }
    }
    if (blob) {
      return {
        blob,
        recognitionUsed,
        source,
        detail:
          detail ||
          (source === 'vosk'
            ? '已录音，但 Vosk 没有给出文字'
            : recognitionUsed
              ? '已录音，但浏览器语音识别没有给出文字'
              : '已录音，但当前环境没有语音识别'),
      }
    }
    return {
      error: detail && !recognitionUsed ? 'unsupported' : 'empty',
      recognitionUsed,
      source,
      detail: detail || '没有听到有效语音，也没有录到音频',
    }
  }, [])

  const toggleListen = useCallback(
    async (
      onAutoStop: (capture: TalkCapture) => void,
      options?: ListenOptions,
    ): Promise<'started' | 'stopped' | TalkCapture> => {
      if (recording || activeRef.current) {
        const capture = await stop()
        return capture
      }
      grammarRef.current = options?.grammarWords
      const early = await start()
      if (early?.error) return early

      const listenMs =
        typeof options?.listenMs === 'number' && options.listenMs > 0
          ? options.listenMs
          : LISTEN_MS
      cleanupTimer()
      autoTimerRef.current = window.setTimeout(() => {
        void stop().then(onAutoStop)
      }, listenMs)
      return 'started'
    },
    [recording, start, stop],
  )

  const cancelAutoStop = useCallback(() => {
    cleanupTimer()
  }, [])

  return {
    recording,
    start,
    stop,
    toggleListen,
    cancelAutoStop,
    listenMs: LISTEN_MS,
    nativeVosk: isNativeVoskAvailable(),
  }
}
