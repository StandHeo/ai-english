import { useCallback, useRef, useState } from 'react'

export function usePressToTalk() {
  const [recording, setRecording] = useState(false)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    mediaRef.current = recorder
    recorder.start()
    setRecording(true)
  }, [])

  const stop = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRef.current
    if (!recorder) return null
    return new Promise((resolve) => {
      recorder.onstop = () => {
        recorder.stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        setRecording(false)
        mediaRef.current = null
        resolve(blob)
      }
      recorder.stop()
    })
  }, [])

  return { recording, start, stop }
}
