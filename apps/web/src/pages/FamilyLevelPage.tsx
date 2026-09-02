import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import {
  dayHasMiniPack,
  dayHasPlayableContent,
  getDay,
  hydrateFamilyDayImages,
  markDayCompleted,
  markMiniLevelCompleted,
  materializeLevelForPlay,
  materializeMiniLevelForPlay,
} from '../family/store'
import { addPlaySeconds, loadProgress, saveProgress } from '../progress/store'
import { markStickerEarnedTonight } from '../progress/stickerTonight'
import { requestTts, submitSpeech } from '../voice/client'
import { pickSuccessSpeakLine } from '../voice/cheers'
import { playFailSfx, playSuccessSfx } from '../voice/sfx'
import { isMicAllowedByBrowser, pageProtocolHint } from '../voice/secureContext'
import { usePressToTalk, type TalkCapture } from '../voice/usePressToTalk'
import type { LevelScript, ProgressState } from '../types'
import {
  celebrateTitleFor,
  pickCelebrateVariant,
  SuccessCelebrate,
  type CelebrateVariant,
} from './SuccessCelebrate'
import './level.css'

const MAX_RETRIES = 2

type Props = {
  onProgress: (p: ProgressState) => void
}

export function FamilyLevelPage({ onProgress }: Props) {
  const { date = '', levelId: levelIdParam } = useParams()
  const levelId = levelIdParam ? decodeURIComponent(levelIdParam) : ''
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
  const [celeb, setCeleb] = useState<{
    variant: CelebrateVariant
    title: string
    line: string
  } | null>(null)
  const startedAt = useRef(Date.now())
  const beatIndexRef = useRef(0)
  const finishingRef = useRef(false)
  const { recording, toggleListen, cancelAutoStop, nativeVosk, listenMs } = usePressToTalk()

  useEffect(() => {
    beatIndexRef.current = beatIndex
  }, [beatIndex])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const day = getDay(date)
      if (!dayHasPlayableContent(day)) {
        navigate('/family')
        return
      }
      try {
        const hydrated = dayHasMiniPack(day) ? await hydrateFamilyDayImages(day!) : day!
        if (cancelled) return
        if (levelId && dayHasMiniPack(hydrated)) {
          setLevel(materializeMiniLevelForPlay(hydrated, levelId))
        } else if (hydrated.level) {
          setLevel(materializeLevelForPlay(hydrated))
        } else if (dayHasMiniPack(hydrated)) {
          navigate(`/family/${date}`, { replace: true })
          return
        } else {
          navigate('/family')
          return
        }
      } catch {
        if (!cancelled) navigate(`/family/${date}`)
        return
      }
      if (cancelled) return
      setBeatIndex(0)
      setRetries(0)
      startedAt.current = Date.now()
      if (!Capacitor.isNativePlatform() && (!isMicAllowedByBrowser() || pageProtocolHint() === 'http')) {
        setMicTip('当前可能无法开麦克风，可用右下角打字。')
        setShowDevType(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [date, levelId, navigate])

  // 录音结束后清掉「正在听」，避免一直挂着
  useEffect(() => {
    if (!recording && micTip === 'listening') {
      setMicTip(null)
    }
  }, [recording, micTip])

  const persistPlayTime = useCallback(() => {
    const seconds = (Date.now() - startedAt.current) / 1000
    onProgress(addPlaySeconds(loadProgress(), seconds))
    startedAt.current = Date.now()
  }, [onProgress])

  const finishLevel = useCallback(async () => {
    setPhase('celebrate')
    if (levelId) {
      markMiniLevelCompleted(date, levelId)
    } else {
      markDayCompleted(date)
    }
    const p = loadProgress()
    const stickerId = level?.reward?.sticker
    if (stickerId) markStickerEarnedTonight(stickerId)
    const next = { ...p, stars: p.stars + (level?.reward.stars || 1) }
    saveProgress(next)
    onProgress(next)
    persistPlayTime()
    await requestTts('Yay!')
    window.setTimeout(() => navigate(levelId ? `/family/${date}` : '/family'), 1000)
  }, [date, level, levelId, navigate, onProgress, persistPlayTime])

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
      setMicTip(null)
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
    const line = pickSuccessSpeakLine({
      successSay: beat?.success_say,
      expect: beat?.expect,
    })
    const variant = pickCelebrateVariant()
    setPhase('celebrate')
    setCeleb({
      variant,
      title: celebrateTitleFor(variant),
      line,
    })
    await playSuccessSfx()
    await requestTts(line)
    setCeleb(null)
  }

  async function onOralResult(matched: boolean) {
    if (matched) {
      await playSuccess()
      await advance()
      return
    }
    const nextRetry = retries + 1
    setBusy(true)
    await playFailSfx()
    if (nextRetry < MAX_RETRIES) {
      setRetries(nextRetry)
      const demo = beat?.hint_say || beat?.expect?.[0] || beat?.npc_say || ''
      if (demo) await requestTts(demo)
      setBusy(false)
      setPhase('listen')
      setMicTip('再试一次，或点右下角打字')
      return
    }
    setBusy(false)
    setPhase('fallback')
    setMicTip(null)
  }

  async function handleCapture(capture: TalkCapture) {
    if (!beat?.expect || finishingRef.current) return
    finishingRef.current = true
    setMicTip(null)
    setBusy(true)
    try {
      if (capture.error === 'denied') {
        setMicTip('请允许麦克风权限')
        setShowDevType(true)
        setPhase('listen')
        return
      }
      if (capture.error === 'insecure') {
        setMicTip('当前环境无法开麦，请用打字')
        setShowDevType(true)
        setPhase('fallback')
        return
      }
      if (!capture.transcript && !capture.blob) {
        setShowDevType(true)
        setMicTip('没有听到，请再说或打字')
        setPhase('listen')
        return
      }
      const result = await submitSpeech({
        text: capture.transcript,
        blob: capture.blob,
        expect: beat.expect,
      })
      await onOralResult(result.matched)
    } catch {
      setMicTip('识别出错，可打字再试')
      setShowDevType(true)
      setPhase('listen')
    } finally {
      setBusy(false)
      finishingRef.current = false
    }
  }

  async function handleMicTap() {
    if (busy || phase !== 'listen' || !beat?.expect) return
    const result = await toggleListen(
      (capture) => {
        void handleCapture(capture)
      },
      { grammarWords: beat.expect },
    )
    if (result === 'started') {
      setMicTip('listening')
      setShowDevType(false)
      return
    }
    cancelAutoStop()
    if (typeof result === 'object') await handleCapture(result)
  }

  async function onPick(correct: boolean) {
    if (!correct) {
      setBusy(true)
      await playFailSfx()
      setBusy(false)
      await advance()
      return
    }
    await playSuccess()
    await advance()
  }

  const findOptions = beat?.options || beat?.fallback?.options
  if (!level) return <div className="screen loading-dot" />

  const tipText =
    micTip === 'listening'
      ? nativeVosk
        ? `正在听（离线）… 约 ${Math.round(listenMs / 1000)} 秒，或再点麦克风结束`
        : `正在听… 约 ${Math.round(listenMs / 1000)} 秒，或再点麦克风结束`
      : micTip

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
      {tipText && (phase === 'listen' || phase === 'fallback') && (
        <div className="mic-tip">{tipText}</div>
      )}
      {phase === 'listen' && (
        <button
          className={`mic-btn ${recording ? 'hot' : ''}`}
          type="button"
          disabled={busy && !recording}
          onClick={() => void handleMicTap()}
          aria-label={recording ? '结束聆听' : '开始说话'}
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
      {celeb ? (
        <SuccessCelebrate variant={celeb.variant} title={celeb.title} line={celeb.line} />
      ) : phase === 'celebrate' ? (
        <div className="burst" />
      ) : null}
      <button className="dev-toggle" type="button" onClick={() => setShowDevType((v) => !v)}>
        ·
      </button>
      {showDevType && (phase === 'listen' || phase === 'fallback') && (
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
