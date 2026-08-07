import { useCallback, useRef, useState } from 'react'
import { isMicAllowedByBrowser } from './secureContext'

export type DiaryRecordCapture = {
  blob?: Blob
  error?: 'insecure' | 'denied' | 'unsupported' | 'empty' | 'unknown' | 'too_long'
}

const MAX_MS = 45000

/**
 * Diary-only recorder (MediaRecorder). Does not use level ASR / browser SpeechRecognition.
 */
export function useDiaryRecorder() {
  const [recording, setRecording] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const activeRef = useRef(false)
  const startedAtRef = useRef(0)
  const timerRef = useRef<number | null>(null)

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

  const stop = useCallback(async (): Promise<DiaryRecordCapture> => {
    clearTimer()
    if (!activeRef.current && !mediaRef.current) {
      setRecording(false)
      return { error: 'empty' }
    }
    activeRef.current = false
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
    release()
    setRecording(false)
    if (!blob) return { error: 'empty' }
    return { blob }
  }, [])

  const start = useCallback(async (): Promise<DiaryRecordCapture | null> => {
    if (activeRef.current) return null
    if (!isMicAllowedByBrowser()) return { error: 'insecure' }

    activeRef.current = true
    setRecording(true)
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
      recorder.start(100)
      clearTimer()
      timerRef.current = window.setTimeout(() => {
        void stop()
      }, MAX_MS)
      return null
    } catch (err) {
      activeRef.current = false
      setRecording(false)
      release()
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return { error: 'denied' }
      }
      if (name === 'NotFoundError') return { error: 'unsupported' }
      return { error: 'unknown' }
    }
  }, [stop])

  const toggle = useCallback(async (): Promise<'started' | DiaryRecordCapture> => {
    if (recording || activeRef.current) {
      const elapsed = Date.now() - startedAtRef.current
      if (elapsed > MAX_MS) {
        const cap = await stop()
        return { ...cap, error: cap.blob ? 'too_long' : cap.error }
      }
      return stop()
    }
    const early = await start()
    if (early?.error) return early
    return 'started'
  }, [recording, start, stop])

  return { recording, start, stop, toggle, maxMs: MAX_MS }
}
