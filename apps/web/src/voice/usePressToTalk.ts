import { useCallback, useRef, useState } from 'react'
import {
  getSpeechRecognitionCtor,
  isMicAllowedByBrowser,
  type BrowserSpeechRecognition,
} from './secureContext'

export type TalkCapture = {
  transcript?: string
  blob?: Blob
  error?: 'insecure' | 'denied' | 'unsupported' | 'empty' | 'unknown'
}

const LISTEN_MS = 3500

/**
 * 手机优先：点一下开始听（约 3.5 秒），再点可提前结束。
 * 先申请 getUserMedia 权限，再并行尝试浏览器语音识别 + 录音。
 */
export function usePressToTalk() {
  const [recording, setRecording] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const transcriptRef = useRef('')
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
      chunksRef.current = []
      recognitionRef.current = null
      mediaRef.current = null

      if (!isMicAllowedByBrowser()) {
        return { error: 'insecure' }
      }

      // 立刻给 UI 反馈，再异步要权限
      activeRef.current = true
      setRecording(true)

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
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
          return { error: 'denied' }
        }
        if (name === 'NotFoundError') return { error: 'unsupported' }
        return { error: 'unknown' }
      }

      // 录音兜底（mock / whisper 可用）
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
        // 部分机型 MediaRecorder 失败时仍可走语音识别
      }

      // 浏览器英语识别（安卓 Chrome 在 HTTPS + 已授权后通常可用）
      const SpeechRecognition = getSpeechRecognitionCtor()
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition()
          recognition.lang = 'en-US'
          recognition.continuous = true
          recognition.interimResults = true
          recognition.maxAlternatives = 3
          recognition.onresult = (ev) => {
            let text = ''
            for (let i = 0; i < ev.results.length; i += 1) {
              text += ev.results[i][0]?.transcript || ''
            }
            transcriptRef.current = text.trim()
          }
          recognition.onerror = () => {
            /* stop 时读取已有结果 */
          }
          recognitionRef.current = recognition
          recognition.start()
        } catch {
          recognitionRef.current = null
        }
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

    // 短按：等 start 完成再停
    if (startPromiseRef.current) {
      const early = await startPromiseRef.current
      if (early?.error) {
        activeRef.current = false
        setRecording(false)
        releaseStream()
        return early
      }
      // 给识别一点时间（点一下就松的情况）
      await new Promise((r) => window.setTimeout(r, 600))
    }

    if (!activeRef.current && !mediaRef.current && !recognitionRef.current) {
      setRecording(false)
      return { error: 'empty' }
    }

    activeRef.current = false

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
    if (transcript) return { transcript, blob }
    if (blob) return { blob }
    return { error: 'empty' }
  }, [])

  /** 点一下：开始听，超时自动结束；再点一次提前结束 */
  const toggleListen = useCallback(
    async (onAutoStop: (capture: TalkCapture) => void): Promise<'started' | 'stopped' | TalkCapture> => {
      if (recording || activeRef.current) {
        const capture = await stop()
        return capture
      }
      const early = await start()
      if (early?.error) return early

      cleanupTimer()
      autoTimerRef.current = window.setTimeout(() => {
        void stop().then(onAutoStop)
      }, LISTEN_MS)
      return 'started'
    },
    [recording, start, stop],
  )

  const cancelAutoStop = useCallback(() => {
    cleanupTimer()
  }, [])

  return { recording, start, stop, toggleListen, cancelAutoStop, listenMs: LISTEN_MS }
}
