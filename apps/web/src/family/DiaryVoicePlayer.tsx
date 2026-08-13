import { useEffect, useState } from 'react'
import { getAudioClip } from '../family/audioDb'

type Props = {
  audioId?: string
  audioDataUrl?: string
  className?: string
}

/** Resolve IndexedDB clip or legacy data URL for diary playback. */
export function DiaryVoicePlayer({ audioId, audioDataUrl, className }: Props) {
  const [src, setSrc] = useState<string | null>(audioDataUrl || null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false

    async function load() {
      if (audioId) {
        try {
          const blob = await getAudioClip(audioId)
          if (cancelled) return
          if (blob) {
            objectUrl = URL.createObjectURL(blob)
            setSrc(objectUrl)
            return
          }
        } catch {
          /* fall through */
        }
      }
      if (!cancelled) setSrc(audioDataUrl || null)
    }

    void load()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [audioId, audioDataUrl])

  if (!src) return null
  return <audio controls preload="metadata" src={src} className={className} />
}
