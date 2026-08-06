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
import { isMicAllowedByBrowser, pageProtocolHint } from '../voice/secureContext'
import { usePressToTalk, type TalkCapture } from '../voice/usePressToTalk'
import type { LevelScript, ProgressState } from '../types'
import './level.css'

const MAX_RETRIES = 2
const DEFAULT_VIDEO_SECONDS = 5
const CHEERS = ['Yay!', 'Wow!', 'Great!', 'Yum!', 'Super!']

type MicTip = 'insecure' | 'denied' | 'empty' | 'listening' | null

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
  const [phase, setPhase] = useState<
    'speak' | 'listen' | 'find' | 'fallback' | 'celebrate'
  >('speak')
  const [retries, setRetries] = useState(0)
  const [busy, setBusy] = useState(false)
  const [showDevType, setShowDevType] = useState(false)
  const [devText, setDevText] = useState('')
  const [micTip, setMicTip] = useState<MicTip>(null)
  const [sceneReady, setSceneReady] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const startedAt = useRef(Date.now())
  const beatIndexRef = useRef(0)
  const { recording, toggleListen, cancelAutoStop } = usePressToTalk()

  const goMap = useCallback(() => {
    navigate(packId ? `/map/${packId}` : '/')
  }, [navigate, packId])

  useEffect(() => {
    beatIndexRef.current = beatIndex
  }, [beatIndex])

  useEffect(() => {
    if (!isMicAllowedByBrowser() || pageProtocolHint() === 'http') {
      setMicTip('insecure')
      setShowDevType(true)
    }
  }, [])

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
  }, [advance, beat, level, sceneReady])

  async function playSuccess() {
    const line =
      beat?.success_say || CHEERS[beatIndex % CHEERS.length] || 'Yay!'
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

  function openTypeFallback(tip: MicTip = 'empty') {
    setMicTip(tip)
    setShowDevType(true)
  }

  const finishingRef = useRef(false)

  async function handleCapture(capture: TalkCapture) {
    if (!beat?.expect || finishingRef.current) return
    finishingRef.current = true
    setBusy(true)
    setMicTip(null)
    try {
      if (capture.error === 'insecure') {
        openTypeFallback('insecure')
        return
      }
      if (capture.error === 'denied') {
        openTypeFallback('denied')
        return
      }
      if (!capture.transcript && !capture.blob) {
        openTypeFallback('empty')
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
      setMicTip('listening')
      setShowDevType(false)
      return
    }
    if (result === 'stopped') return
    // 提前结束或启动失败
    cancelAutoStop()
    if (typeof result === 'object') {
      await handleCapture(result)
    }
  }

  async function handleDevSubmit() {
    if (!beat?.expect) return
    cancelAutoStop()
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
      const nextRetry = retries + 1
      setBusy(true)
      await requestTts(beat?.hint_say || beat?.expect?.[0] || beat?.npc_say || '')
      setBusy(false)
      if (phase === 'find' && nextRetry < MAX_RETRIES) {
        setRetries(nextRetry)
        return
      }
      await requestTts(beat?.expect?.[0] || beat?.hint_say || '')
      await advance()
      return
    }
    await playSuccess()
    await advance()
  }

  const findOptions = beat?.options || beat?.fallback?.options

  if (!level) return <div className="screen loading-dot" />
  if (sceneReady && !beat) return <div className="screen loading-dot" />

  const hasVideo = Boolean(level.scene.video)
  const tipText =
    micTip === 'insecure'
      ? `当前是 ${pageProtocolHint() === 'http' ? 'http' : '非安全'} 页面，手机不能开麦克风。请在电脑运行 npm run dev:phone，手机用 https://电脑IP:5173 打开（证书点继续访问）；或先在下方输入单词。`
      : micTip === 'denied'
        ? '未获得麦克风权限。请在浏览器弹窗点「允许」，或到网站设置里打开麦克风；也可在下方输入单词。'
        : micTip === 'listening'
          ? '正在听… 请大声说英语单词，约 3 秒后自动结束；再点一次麦克风可提前结束。'
          : micTip === 'empty'
            ? '没有听到声音。请再点麦克风说一次，或在下方输入单词（如 apple / bike）。'
            : phase === 'listen' && !recording
              ? '点一下红色麦克风，然后大声说英语～'
              : null

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
          {beat?.show && phase !== 'find' && (
            <img
              className={`focus-item ${phase === 'listen' ? 'bounce' : ''}`}
              src={assetUrl(beat.show)}
              alt=""
            />
          )}

          {tipText && (phase === 'listen' || micTip === 'insecure') && (
            <div className="mic-tip" role="status">
              {tipText}
            </div>
          )}

          {phase === 'listen' && (
            <button
              className={`mic-btn ${recording ? 'hot' : ''}`}
              disabled={busy && !recording}
              type="button"
              aria-label={recording ? 'stop listening' : 'start listening'}
              onClick={(e) => {
                e.preventDefault()
                void handleMicTap()
              }}
            />
          )}

          {(phase === 'find' || phase === 'fallback') && findOptions && (
            <div className="choice-row">
              {findOptions.map((opt) => (
                <button
                  key={opt.id}
                  className="choice-tile"
                  disabled={busy}
                  onClick={() => onPick(opt.correct)}
                >
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
              <input
                value={devText}
                onChange={(e) => setDevText(e.target.value)}
                placeholder="apple"
                aria-label="type word"
              />
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
