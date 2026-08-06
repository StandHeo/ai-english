import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  getDay,
  markDayCompleted,
  materializeLevelForPlay,
} from '../family/store'
import { addPlaySeconds, loadProgress, saveProgress } from '../progress/store'
import { requestTts, submitSpeech } from '../voice/client'
import { isMicAllowedByBrowser, pageProtocolHint } from '../voice/secureContext'
import { usePressToTalk, type TalkCapture } from '../voice/usePressToTalk'
import type { LevelScript, ProgressState } from '../types'
import './level.css'

const MAX_RETRIES = 2
const CHEERS = ['Yay!', 'Wow!', 'Great!', 'Yum!', 'Super!']

type Props = {
  onProgress: (p: ProgressState) => void
}

export function FamilyLevelPage({ onProgress }: Props) {
  const { date = '' } = useParams()
  const navigate = useNavigate()
  const [level, setLevel] = useState<LevelScript | null>(null)
  const [beatIndex, setBeatIndex] = useState(0)
  const [phase, setPhase] = useState<'speak' | 'listen' | 'find' | 'fallback' | 'celebrate'>(
    'speak',
  )
  const [retries, setRetries] = useState(0)
  const [busy, setBusy] = useState(false)
  const [showDevType, setShowDevType] = useState(false)
  const [devText, setDevText] = useState('')
  const [micTip, setMicTip] = useState<string | null>(null)
  const startedAt = useRef(Date.now())
  const beatIndexRef = useRef(0)
  const finishingRef = useRef(false)
  const { recording, toggleListen, cancelAutoStop } = usePressToTalk()

  useEffect(() => {
    beatIndexRef.current = beatIndex
  }, [beatIndex])

  useEffect(() => {
    const day = getDay(date)
    if (!day?.level) {
      navigate('/family')
      return
    }
    setLevel(materializeLevelForPlay(day))
    setBeatIndex(0)
    setRetries(0)
    startedAt.current = Date.now()
    if (!isMicAllowedByBrowser() || pageProtocolHint() === 'http') {
      setMicTip('当前可能无法开麦克风，可用右下角打字。')
      setShowDevType(true)
    }
  }, [date, navigate])

  const persistPlayTime = useCallback(() => {
    const seconds = (Date.now() - startedAt.current) / 1000
    onProgress(addPlaySeconds(loadProgress(), seconds))
    startedAt.current = Date.now()
  }, [onProgress])

  const finishLevel = useCallback(async () => {
    setPhase('celebrate')
    markDayCompleted(date)
    const p = loadProgress()
    const next = { ...p, stars: p.stars + (level?.reward.stars || 1) }
    saveProgress(next)
    onProgress(next)
    persistPlayTime()
    await requestTts('Yay!')
    window.setTimeout(() => navigate('/family'), 1000)
  }, [date, level, navigate, onProgress, persistPlayTime])

  const advance = useCallback(async () => {
    if (!level) return
    if (beatIndexRef.current >= level.beats.length - 1) {
      await finishLevel()
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
          if (!cancelled) void advance()
        }, 700)
      } else if (beat.type === 'find') {
        setPhase('find')
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

  async function playSuccess() {
    const line = beat?.success_say || CHEERS[beatIndex % CHEERS.length] || 'Yay!'
    setPhase('celebrate')
    await requestTts(line)
  }

  async function onOralResult(matched: boolean) {
    if (matched) {
      await playSuccess()
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

  async function handleCapture(capture: TalkCapture) {
    if (!beat?.expect || finishingRef.current) return
    finishingRef.current = true
    setBusy(true)
    try {
      if (!capture.transcript && !capture.blob) {
        setShowDevType(true)
        setMicTip('没有听到，请再说或打字')
        setPhase('fallback')
        return
      }
      const result = await submitSpeech({
        text: capture.transcript,
        blob: capture.blob,
        expect: beat.expect,
      })
      await onOralResult(result.matched)
    } catch {
      setPhase('fallback')
    } finally {
      setBusy(false)
      finishingRef.current = false
    }
  }

  async function handleMicTap() {
    if (busy || phase !== 'listen' || !beat?.expect) return
    const result = await toggleListen((capture) => {
      void handleCapture(capture)
    })
    if (result === 'started') {
      setMicTip('正在听…')
      return
    }
    cancelAutoStop()
    if (typeof result === 'object') await handleCapture(result)
  }

  async function onPick(correct: boolean) {
    if (!correct) {
      setBusy(true)
      await requestTts(beat?.hint_say || beat?.expect?.[0] || '')
      setBusy(false)
      await advance()
      return
    }
    await playSuccess()
    await advance()
  }

  const findOptions = beat?.options || beat?.fallback?.options
  if (!level) return <div className="screen loading-dot" />

  return (
    <div className="level-screen" style={{ backgroundImage: `url(${level.scene.image})` }}>
      <button
        className="exit-btn"
        onClick={() => {
          persistPlayTime()
          navigate('/family')
        }}
        aria-label="exit"
      />
      {beat?.show && phase !== 'find' && (
        <img className={`focus-item ${phase === 'listen' ? 'bounce' : ''}`} src={beat.show} alt="" />
      )}
      {micTip && phase === 'listen' && <div className="mic-tip">{micTip}</div>}
      {phase === 'listen' && (
        <button
          className={`mic-btn ${recording ? 'hot' : ''}`}
          type="button"
          disabled={busy && !recording}
          onClick={() => void handleMicTap()}
        />
      )}
      {(phase === 'find' || phase === 'fallback') && findOptions && (
        <div className="choice-row">
          {findOptions.map((opt) => (
            <button
              key={opt.id}
              className="choice-tile"
              disabled={busy}
              onClick={() => void onPick(opt.correct)}
            >
              <img src={opt.image} alt="" />
            </button>
          ))}
        </div>
      )}
      {phase === 'celebrate' && <div className="burst" />}
      <button className="dev-toggle" type="button" onClick={() => setShowDevType((v) => !v)}>
        ·
      </button>
      {showDevType && phase === 'listen' && (
        <div className="dev-type">
          <input value={devText} onChange={(e) => setDevText(e.target.value)} placeholder="park" />
          <button
            type="button"
            onClick={() => {
              void submitSpeech({ text: devText, expect: beat?.expect || [] }).then((r) =>
                onOralResult(r.matched),
              )
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  )
}
