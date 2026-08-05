import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  assetUrl,
  findPackIdForLevel,
  loadApprovedLevels,
  loadLevel,
} from '../content/loader'
import { addPlaySeconds, completeLevel, loadProgress } from '../progress/store'
import { requestTts, submitSpeech } from '../voice/client'
import { usePressToTalk } from '../voice/usePressToTalk'
import type { LevelScript, ProgressState } from '../types'
import './level.css'

const MAX_RETRIES = 2
const DEFAULT_VIDEO_SECONDS = 5

type Props = {
  progress: ProgressState
  onProgress: (p: ProgressState) => void
}

export function LevelPage({ onProgress }: Props) {
  const { levelId = '' } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const [level, setLevel] = useState<LevelScript | null>(null)
  const [packId, setPackId] = useState(search.get('pack') || '')
  const [beatIndex, setBeatIndex] = useState(0)
  const [phase, setPhase] = useState<'speak' | 'listen' | 'fallback' | 'celebrate'>('speak')
  const [retries, setRetries] = useState(0)
  const [busy, setBusy] = useState(false)
  const [showDevType, setShowDevType] = useState(false)
  const [devText, setDevText] = useState('')
  const [sceneReady, setSceneReady] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const startedAt = useRef(Date.now())
  const beatIndexRef = useRef(0)
  const { recording, start, stop } = usePressToTalk()

  const goMap = useCallback(() => {
    navigate(packId ? `/map/${packId}` : '/')
  }, [navigate, packId])

  useEffect(() => {
    beatIndexRef.current = beatIndex
  }, [beatIndex])

  useEffect(() => {
    setBeatIndex(0)
    setRetries(0)
    setSceneReady(false)
    setVideoPlaying(false)
    startedAt.current = Date.now()
    const hinted = search.get('pack')
    Promise.all([
      loadLevel(levelId),
      hinted ? Promise.resolve(hinted) : findPackIdForLevel(levelId),
    ])
      .then(([script, pid]) => {
        setLevel(script)
        setPackId(pid)
        if (!script.scene.video) setSceneReady(true)
      })
      .catch(() => navigate('/'))
  }, [levelId, navigate, search])

  const freezeVideo = useCallback(() => {
    const el = videoRef.current
    if (el) {
      el.pause()
    }
    setVideoPlaying(false)
    setSceneReady(true)
  }, [])

  useEffect(() => {
    if (!level?.scene.video || sceneReady) return
    const el = videoRef.current
    if (!el) return

    let cancelled = false
    let timer: number | undefined
    const maxSec = level.scene.video_max_seconds ?? DEFAULT_VIDEO_SECONDS

    const startPlayback = async () => {
      setVideoPlaying(true)
      try {
        el.currentTime = 0
        await el.play()
      } catch {
        if (!cancelled) freezeVideo()
        return
      }
      timer = window.setTimeout(() => {
        if (!cancelled) freezeVideo()
      }, maxSec * 1000)
    }

    void startPlayback()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [freezeVideo, level, sceneReady])

  const persistPlayTime = useCallback(() => {
    const seconds = (Date.now() - startedAt.current) / 1000
    onProgress(addPlaySeconds(loadProgress(), seconds))
    startedAt.current = Date.now()
  }, [onProgress])

  const finishLevel = useCallback(
    async (current: LevelScript) => {
      if (!packId) return
      setPhase('celebrate')
      const all = await loadApprovedLevels(packId)
      const idx = all.findIndex((l) => l.id === current.id)
      const nextId = all[idx + 1]?.id
      const next = completeLevel(
        loadProgress(),
        packId,
        current.id,
        nextId,
        current.reward.sticker,
        current.reward.stars,
      )
      onProgress(next)
      persistPlayTime()
      await requestTts('Yay!')
      window.setTimeout(() => navigate(`/map/${packId}`), 1200)
    },
    [navigate, onProgress, packId, persistPlayTime],
  )

  const advance = useCallback(async () => {
    if (!level) return
    if (beatIndexRef.current >= level.beats.length - 1) {
      await finishLevel(level)
      return
    }
    setRetries(0)
    setBeatIndex((i) => i + 1)
  }, [finishLevel, level])

  const beat = level?.beats[beatIndex]

  useEffect(() => {
    if (!beat || !level || !sceneReady) return
    let cancelled = false
    let timer: number | undefined
    ;(async () => {
      setBusy(true)
      setPhase('speak')
      await requestTts(beat.npc_say)
      if (cancelled) return
      if (beat.type === 'introduce') {
        timer = window.setTimeout(() => {
          if (cancelled) return
          void advance()
        }, 700)
      } else {
        setPhase('listen')
      }
      setBusy(false)
    })()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      window.speechSynthesis?.cancel()
    }
  }, [advance, beat, level, sceneReady])

  async function onOralResult(matched: boolean) {
    if (matched) {
      setPhase('celebrate')
      await requestTts('Yay!')
      await advance()
      return
    }
    const nextRetry = retries + 1
    if (nextRetry < MAX_RETRIES) {
      setRetries(nextRetry)
      setBusy(true)
      await requestTts(beat?.hint_say || beat?.npc_say || '')
      setBusy(false)
      setPhase('listen')
      return
    }
    setPhase('fallback')
  }

  async function handlePointerUp() {
    if (busy || phase !== 'listen' || !beat?.expect) return
    setBusy(true)
    try {
      const blob = await stop()
      const result = await submitSpeech({ blob: blob || undefined, expect: beat.expect })
      await onOralResult(result.matched)
    } catch {
      setPhase('fallback')
    } finally {
      setBusy(false)
    }
  }

  async function handleDevSubmit() {
    if (!beat?.expect) return
    setBusy(true)
    try {
      const result = await submitSpeech({ text: devText, expect: beat.expect })
      await onOralResult(result.matched)
    } finally {
      setBusy(false)
    }
  }

  async function onPick(correct: boolean) {
    if (!correct) {
      await requestTts(beat?.hint_say || beat?.expect?.[0] || '')
    }
    await advance()
  }

  if (!level) return <div className="screen loading-dot" />
  if (sceneReady && !beat) return <div className="screen loading-dot" />

  const hasVideo = Boolean(level.scene.video)

  return (
    <div
      className="level-screen"
      style={
        hasVideo
          ? undefined
          : { backgroundImage: `url(${assetUrl(level.scene.image)})` }
      }
    >
      {hasVideo && (
        <video
          ref={videoRef}
          className="scene-video"
          src={assetUrl(level.scene.video!)}
          playsInline
          muted
          preload="auto"
          poster={assetUrl(level.scene.image)}
          onEnded={freezeVideo}
        />
      )}

      <button
        className="exit-btn"
        onClick={() => {
          persistPlayTime()
          goMap()
        }}
        aria-label="exit"
      />

      {videoPlaying && (
        <button
          className="video-skip"
          type="button"
          aria-label="skip"
          onClick={freezeVideo}
        />
      )}

      {sceneReady && (
        <>
          <img className="npc" src={assetUrl('assets/characters/bunny.png')} alt="" />
          {beat?.show && <img className="focus-item" src={assetUrl(beat.show)} alt="" />}

          {phase === 'listen' && (
            <button
              className={`mic-btn ${recording ? 'hot' : ''}`}
              disabled={busy}
              onPointerDown={async (e) => {
                e.preventDefault()
                if (busy) return
                try {
                  await start()
                } catch {
                  setShowDevType(true)
                }
              }}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          )}

          {phase === 'fallback' && beat?.fallback?.type === 'picture_choice' && (
            <div className="choice-row">
              {beat.fallback.options.map((opt) => (
                <button key={opt.id} className="choice-tile" onClick={() => onPick(opt.correct)}>
                  <img src={assetUrl(opt.image)} alt="" />
                </button>
              ))}
            </div>
          )}

          {phase === 'celebrate' && <div className="burst" />}

          <button className="dev-toggle" onClick={() => setShowDevType((v) => !v)} type="button">
            ·
          </button>
          {showDevType && phase === 'listen' && (
            <div className="dev-type">
              <input value={devText} onChange={(e) => setDevText(e.target.value)} placeholder="bike" />
              <button type="button" onClick={handleDevSubmit}>
                OK
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
