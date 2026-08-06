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

export function usePressToTalk() {
  const [recording, setRecording] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const transcriptRef = useRef('')
  const modeRef = useRef<'speech' | 'media' | null>(null)

  const start = useCallback(async (): Promise<TalkCapture | null> => {
    transcriptRef.current = ''
    modeRef.current = null

    if (!isMicAllowedByBrowser()) {
      return { error: 'insecure' }
    }

    const SpeechRecognition = getSpeechRecognitionCtor()
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.lang = 'en-US'
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognition.onresult = (ev) => {
        let text = ''
        for (let i = 0; i < ev.results.length; i += 1) {
          text += ev.results[i][0]?.transcript || ''
        }
        transcriptRef.current = text.trim()
      }
      recognition.onerror = () => {
        /* stop() 会读最终结果；此处忽略临时错误 */
      }
      recognitionRef.current = recognition
      modeRef.current = 'speech'
      recognition.start()
      setRecording(true)
      return null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : undefined
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mediaRef.current = recorder
      modeRef.current = 'media'
      recorder.start(200)
      setRecording(true)
      return null
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return { error: 'denied' }
      }
      if (name === 'NotFoundError') return { error: 'unsupported' }
      return { error: 'unknown' }
    }
  }, [])

  const stop = useCallback(async (): Promise<TalkCapture> => {
    const mode = modeRef.current
    modeRef.current = null

    if (mode === 'speech') {
      const recognition = recognitionRef.current
      recognitionRef.current = null
      if (!recognition) {
        setRecording(false)
        return { error: 'empty' }
      }
      const transcript = await new Promise<string>((resolve) => {
        const finish = () => resolve(transcriptRef.current.trim())
        recognition.onend = finish
        try {
          recognition.stop()
        } catch {
          finish()
        }
        window.setTimeout(finish, 800)
      })
      setRecording(false)
      if (!transcript) return { error: 'empty' }
      return { transcript }
    }

    const recorder = mediaRef.current
    if (!recorder) {
      setRecording(false)
      return { error: 'empty' }
    }
    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop())
        const data = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        mediaRef.current = null
        resolve(data.size > 0 ? data : null)
      }
      recorder.stop()
    })
    setRecording(false)
    if (!blob) return { error: 'empty' }
    return { blob }
  }, [])

  return { recording, start, stop }
}
