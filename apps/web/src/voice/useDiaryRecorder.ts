import { useCallback, useEffect, useRef, useState } from 'react'
import { isMicAllowedByBrowser } from './secureContext'

export type DiaryRecordCapture = {
  blob?: Blob
  error?: 'insecure' | 'denied' | 'unsupported' | 'empty' | 'unknown' | 'too_long'
  /** True when stopped by the max-duration timer (or at/over the cap). */
  hitLimit?: boolean
}

/** Diary clips live in IndexedDB; several minutes is fine for quota. */
export const DIARY_MAX_RECORD_MS = 300_000
/** Soft warning window before auto-stop. */
export const DIARY_WARN_REMAINING_MS = 20_000

type Options = {
  /** Fired when the max-duration timer ends the take (so UI can still save). */
  onAutoStop?: (capture: DiaryRecordCapture) => void
}

/**
 * Diary-only recorder (MediaRecorder). Does not use level ASR / browser SpeechRecognition.
 */
export function useDiaryRecorder(opts: Options = {}) {
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const activeRef = useRef(false)
  const startedAtRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const tickRef = useRef<number | null>(null)
  const onAutoStopRef = useRef(opts.onAutoStop)
  onAutoStopRef.current = opts.onAutoStop

  const release = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const clearTick = () => {
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  const stop = useCallback(async (): Promise<DiaryRecordCapture> => {
    clearTimer()
    clearTick()
    if (!activeRef.current && !mediaRef.current) {
      setRecording(false)
      setElapsedMs(0)
      return { error: 'empty' }
    }
    activeRef.current = false
    const recorder = mediaRef.current
    mediaRef.current = null
    const elapsed = Date.now() - startedAtRef.current
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
    release()
    setRecording(false)
    setElapsedMs(0)
    if (!blob) return { error: 'empty' }
    const hitLimit = elapsed >= DIARY_MAX_RECORD_MS - 50
    return {
      blob,
      ...(hitLimit ? { hitLimit: true, error: 'too_long' as const } : {}),
    }
  }, [])

  const start = useCallback(async (): Promise<DiaryRecordCapture | null> => {
    if (activeRef.current) return null
    if (!isMicAllowedByBrowser()) return { error: 'insecure' }

    activeRef.current = true
    setRecording(true)
    setElapsedMs(0)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream
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
      startedAtRef.current = Date.now()
      recorder.start(250)
      clearTimer()
      clearTick()
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Math.min(DIARY_MAX_RECORD_MS, Date.now() - startedAtRef.current))
      }, 200)
      timerRef.current = window.setTimeout(() => {
        void stop().then((cap) => {
          onAutoStopRef.current?.(cap.blob ? { ...cap, hitLimit: true, error: 'too_long' } : cap)
        })
      }, DIARY_MAX_RECORD_MS)
      return null
    } catch (err) {
      activeRef.current = false
      setRecording(false)
      setElapsedMs(0)
      release()
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return { error: 'denied' }
      }
      if (name === 'NotFoundError') return { error: 'unsupported' }
      return { error: 'unknown' }
    }
  }, [stop])

  useEffect(() => () => {
    clearTimer()
    clearTick()
  }, [])

  const toggle = useCallback(async (): Promise<'started' | DiaryRecordCapture> => {
    if (recording || activeRef.current) {
      return stop()
    }
    const early = await start()
    if (early?.error) return early
    return 'started'
  }, [recording, start, stop])

  const remainingMs = Math.max(0, DIARY_MAX_RECORD_MS - elapsedMs)
  const nearLimit = recording && remainingMs <= DIARY_WARN_REMAINING_MS

  return {
    recording,
    start,
    stop,
    toggle,
    maxMs: DIARY_MAX_RECORD_MS,
    elapsedMs,
    remainingMs,
    nearLimit,
  }
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
