import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { assetUrl, loadApprovedLevels, loadLevel } from '../content/loader'
import { addPlaySeconds, completeLevel, loadProgress } from '../progress/store'
import { requestTts, submitSpeech } from '../voice/client'
import { usePressToTalk } from '../voice/usePressToTalk'
import type { LevelScript, ProgressState } from '../types'
import './level.css'

const MAX_RETRIES = 2

type Props = {
  progress: ProgressState
  onProgress: (p: ProgressState) => void
}

export function LevelPage({ onProgress }: Props) {
  const { levelId = '' } = useParams()
  const navigate = useNavigate()
  const [level, setLevel] = useState<LevelScript | null>(null)
  const [beatIndex, setBeatIndex] = useState(0)
  const [phase, setPhase] = useState<'speak' | 'listen' | 'fallback' | 'celebrate'>('speak')
  const [retries, setRetries] = useState(0)
  const [busy, setBusy] = useState(false)
  const [showDevType, setShowDevType] = useState(false)
  const [devText, setDevText] = useState('')
  const startedAt = useRef(Date.now())
  const beatIndexRef = useRef(0)
  const { recording, start, stop } = usePressToTalk()

  useEffect(() => {
    beatIndexRef.current = beatIndex
  }, [beatIndex])

  useEffect(() => {
    setBeatIndex(0)
    setRetries(0)
    loadLevel(levelId).then(setLevel).catch(() => navigate('/'))
  }, [levelId, navigate])

  const persistPlayTime = useCallback(() => {
    const seconds = (Date.now() - startedAt.current) / 1000
    onProgress(addPlaySeconds(loadProgress(), seconds))
    startedAt.current = Date.now()
  }, [onProgress])

  const finishLevel = useCallback(
    async (current: LevelScript) => {
      setPhase('celebrate')
      const all = await loadApprovedLevels()
      const idx = all.findIndex((l) => l.id === current.id)
      const nextId = all[idx + 1]?.id
      const next = completeLevel(
        loadProgress(),
        current.id,
        nextId,
        current.reward.sticker,
        current.reward.stars,
      )
      onProgress(next)
      persistPlayTime()
      await requestTts('Yay!')
      window.setTimeout(() => navigate('/'), 1200)
    },
    [navigate, onProgress, persistPlayTime],
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
    if (!beat || !level) return
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
  }, [advance, beat, level])

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

  if (!level || !beat) return <div className="screen loading-dot" />

  return (
    <div
      className="level-screen"
      style={{ backgroundImage: `url(${assetUrl(level.scene.image)})` }}
    >
      <button
        className="exit-btn"
        onClick={() => {
          persistPlayTime()
          navigate('/')
        }}
        aria-label="exit"
      />

      <img className="npc" src={assetUrl('assets/characters/bunny.png')} alt="" />
      {beat.show && <img className="focus-item" src={assetUrl(beat.show)} alt="" />}

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

      {phase === 'fallback' && beat.fallback?.type === 'picture_choice' && (
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
          <input value={devText} onChange={(e) => setDevText(e.target.value)} placeholder="apple" />
          <button type="button" onClick={handleDevSubmit}>
            OK
          </button>
        </div>
      )}
    </div>
  )
}
