import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Capacitor } from '@capacitor/core'
import {
  assetUrl,
  findPackIdForLevel,
  loadApprovedLevels,
  loadLevel,
} from '../content/loader'
import { addPlaySeconds, completeLevel, isDailyLimitReached, loadProgress } from '../progress/store'
import { cancelSpeak, requestTts, submitSpeech } from '../voice/client'
import { isMicAllowedByBrowser, pageProtocolHint } from '../voice/secureContext'
import { usePressToTalk, type TalkCapture } from '../voice/usePressToTalk'
import { ensurePiperReady } from '../voice/piperTts'
import { loadVoicePrefs } from '../voice/prefs'
import { playFailSfx, playSuccessSfx } from '../voice/sfx'
import { ensureVoskModel, isNativeVoskAvailable } from '../voice/voskNative'
import type { LevelScript, ProgressState } from '../types'
import { BeepTalkPanel } from './BeepTalkPanel'
import { ClearCeremonyOverlay } from './ClearCeremonyOverlay'
import {
  clearCeremonyTtsLine,
  resolveCeremonyStickerSrc,
} from './clearCeremony'
import './level.css'

const MAX_RETRIES = 2
const DEFAULT_VIDEO_SECONDS = 5
const CHEERS = ['Yay!', 'Wow!', 'Great!', 'Yum!', 'Super!']
const CLEAR_PULSE_MS = 25_000
/** 通关语音播完后再停留一会儿，自动进下一关（仍可用 ▶ 提前跳） */
const CLEAR_AUTO_AFTER_TTS_MS = 2_400

type MicTip = 'insecure' | 'denied' | 'empty' | 'listening' | null

type VoiceStatus = {
  tone: 'info' | 'ok' | 'warn' | 'error'
  lines: string[]
}

type ResultFlash = {
  kind: 'ok' | 'retry'
  title: string
  line: string
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

type Props = {
  progress: ProgressState
  onProgress: (p: ProgressState) => void
}

function captureErrorMessage(capture: TalkCapture): string {
  switch (capture.error) {
    case 'insecure':
      return '非安全页面，无法开麦克风'
    case 'denied':
      return '麦克风权限被拒绝'
    case 'unsupported':
      return '当前环境不支持录音/语音识别'
    case 'recognition':
      return '语音识别出错'
    case 'empty':
      return '没有识别到语音'
    case 'unknown':
      return '麦克风启动失败'
    default:
      return '语音输入失败'
  }
}

export function LevelPage({ onProgress }: Props) {
  const { levelId = '' } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const [level, setLevel] = useState<LevelScript | null>(null)
  const [packId, setPackId] = useState(search.get('pack') || '')
  const [beatIndex, setBeatIndex] = useState(0)
  const [phase, setPhase] = useState<
    'speak' | 'listen' | 'find' | 'fallback' | 'celebrate' | 'beepTalk' | 'clearCeremony'
  >('speak')
  const [retries, setRetries] = useState(0)
  const [busy, setBusy] = useState(false)
  const [showDevType, setShowDevType] = useState(false)
  const [devText, setDevText] = useState('')
  const [micTip, setMicTip] = useState<MicTip>(null)
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null)
  const [resultFlash, setResultFlash] = useState<ResultFlash | null>(null)
  const [sceneReady, setSceneReady] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [exitConfirm, setExitConfirm] = useState(false)
  const [pulseContinue, setPulseContinue] = useState(false)
  const [nextLevelId, setNextLevelId] = useState<string | undefined>()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const startedAt = useRef(Date.now())
  const beatIndexRef = useRef(0)
  const settledRef = useRef(false)
  const clearAutoTimerRef = useRef<number | null>(null)
  const nextLevelIdRef = useRef<string | undefined>(undefined)
  const cheerIndexRef = useRef(0)
  const { recording, toggleListen, cancelAutoStop, nativeVosk } = usePressToTalk()

  const goMap = useCallback(() => {
    navigate(packId ? `/map/${packId}` : '/')
  }, [navigate, packId])

  useEffect(() => {
    beatIndexRef.current = beatIndex
  }, [beatIndex])

  useEffect(() => {
    // App 内不因 capacitor: 误判；仅浏览器 http 提示不安全
    if (Capacitor.isNativePlatform()) return
    if (!isMicAllowedByBrowser() || pageProtocolHint() === 'http') {
      setMicTip('insecure')
      setShowDevType(true)
    }
  }, [])

  useEffect(() => {
    if (!isNativeVoskAvailable()) return
    setVoiceStatus({
      tone: 'info',
      lines: ['正在加载离线语音模型（Vosk）…'],
    })
    void ensureVoskModel()
      .then(() => {
        setVoiceStatus({
          tone: 'ok',
          lines: ['离线语音已就绪（App Vosk）', '点麦克风说英语单词即可'],
        })
      })
      .catch((err) => {
        setVoiceStatus({
          tone: 'error',
          lines: [
            '离线语音模型加载失败',
            err instanceof Error ? err.message : String(err),
            '请确认 APK 已包含 public/models/en-us-small.tar',
          ],
        })
      })
  }, [])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    if (loadVoicePrefs().ttsEngine !== 'piper') return
    void ensurePiperReady().catch(() => {
      // 预热失败则朗读时降级系统 TTS
    })
  }, [])

  useEffect(() => {
    setBeatIndex(0)
    setRetries(0)
    setPhase('speak')
    setSceneReady(false)
    setVideoPlaying(false)
    setExitConfirm(false)
    setPulseContinue(false)
    setNextLevelId(undefined)
    settledRef.current = false
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

  const requestExit = useCallback(() => {
    persistPlayTime()
    if (settledRef.current) {
      setExitConfirm(true)
      return
    }
    goMap()
  }, [goMap, persistPlayTime])

  const leaveAfterClear = useCallback(
    (nextId: string | undefined) => {
      if (clearAutoTimerRef.current != null) {
        window.clearTimeout(clearAutoTimerRef.current)
        clearAutoTimerRef.current = null
      }
      if (!packId) {
        goMap()
        return
      }
      const limited = isDailyLimitReached(loadProgress())
      if (nextId && !limited) {
        navigate(`/level/${nextId}?pack=${packId}`, { replace: true })
      } else {
        navigate(`/map/${packId}`)
      }
    },
    [goMap, navigate, packId],
  )

  const scheduleClearAutoLeave = useCallback(
    (nextId: string | undefined, delayMs = CLEAR_AUTO_AFTER_TTS_MS) => {
      if (clearAutoTimerRef.current != null) {
        window.clearTimeout(clearAutoTimerRef.current)
        clearAutoTimerRef.current = null
      }
      clearAutoTimerRef.current = window.setTimeout(() => {
        clearAutoTimerRef.current = null
        leaveAfterClear(nextId)
      }, delayMs)
    },
    [leaveAfterClear],
  )

  const enterClearCeremony = useCallback(
    async (current: LevelScript) => {
      if (!packId) return
      setVoiceStatus(null)
      setResultFlash(null)
      setRetries(0)
      setExitConfirm(false)
      setPulseContinue(false)
      setPhase('clearCeremony')

      const all = await loadApprovedLevels(packId)
      const idx = all.findIndex((l) => l.id === current.id)
      const nextId = all[idx + 1]?.id
      setNextLevelId(nextId)
      nextLevelIdRef.current = nextId

      if (!settledRef.current) {
        settledRef.current = true
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
      }

      const line = clearCeremonyTtsLine(current, cheerIndexRef.current++)
      await requestTts(line)
      // 语音播完后短停留，自动下一关；点 Beep 会取消；▶ 可提前跳
      scheduleClearAutoLeave(nextId)
    },
    [onProgress, packId, persistPlayTime, scheduleClearAutoLeave],
  )

  const advance = useCallback(async () => {
    if (!level) return
    if (beatIndexRef.current >= level.beats.length - 1) {
      await enterClearCeremony(level)
      return
    }
    setRetries(0)
    setVoiceStatus(null)
    setResultFlash(null)
    setBeatIndex((i) => i + 1)
  }, [enterClearCeremony, level])

  const beat = level?.beats[beatIndex]

  useEffect(() => {
    if (!beat || !level || !sceneReady) return
    // Beep / 通关仪式不跑 Bunny 拍逻辑
    if (phase === 'beepTalk' || phase === 'clearCeremony') return
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
      void cancelSpeak()
    }
    // phase 有意不进依赖：仅在拍切换时播报；beepTalk/clearCeremony 时提前 return
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [advance, beat, level, sceneReady])

  useEffect(() => {
    if (phase !== 'clearCeremony') {
      setPulseContinue(false)
      return
    }
    const t = window.setTimeout(() => setPulseContinue(true), CLEAR_PULSE_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  useEffect(() => {
    return () => {
      if (clearAutoTimerRef.current != null) {
        window.clearTimeout(clearAutoTimerRef.current)
        clearAutoTimerRef.current = null
      }
    }
  }, [])

  async function playSuccess() {
    const line =
      beat?.success_say || CHEERS[beatIndex % CHEERS.length] || 'Yay!'
    setPhase('celebrate')
    setResultFlash({ kind: 'ok', title: '太棒了！', line })
    // 加长成功音 + 短成功句，多停一会儿再进下一拍
    await playSuccessSfx()
    await requestTts(line)
    await sleep(700)
    setResultFlash(null)
  }

  /** 失败只播「嘟嘟嘟」，不再用有趣的鼓励 TTS（避免孩子故意选错刷音效） */
  async function playFailFeedback() {
    setResultFlash({ kind: 'retry', title: '再试一次～', line: '' })
    await playFailSfx()
    await sleep(200)
    setResultFlash(null)
  }

  async function onOralResult(matched: boolean) {
    if (matched) {
      await playSuccess()
      await advance()
      return
    }
    const nextRetry = retries + 1
    setBusy(true)
    await playFailFeedback()
    if (nextRetry < MAX_RETRIES) {
      setRetries(nextRetry)
      await requestTts(beat?.hint_say || beat?.npc_say || '')
      setBusy(false)
      setPhase('listen')
      return
    }
    setBusy(false)
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
      if (capture.error) {
        const lines = [captureErrorMessage(capture)]
        if (capture.detail) lines.push(capture.detail)
        if (capture.recognitionUsed === false) {
          lines.push('浏览器语音识别未启用')
        }
        setVoiceStatus({ tone: 'error', lines })
        if (capture.error === 'insecure') openTypeFallback('insecure')
        else if (capture.error === 'denied') openTypeFallback('denied')
        else {
          openTypeFallback('empty')
          setPhase('fallback')
        }
        return
      }

      if (!capture.transcript && !capture.blob) {
        const lines = ['没有听到声音，也没有录到音频']
        if (capture.detail) lines.push(capture.detail)
        setVoiceStatus({ tone: 'error', lines })
        openTypeFallback('empty')
        setPhase('fallback')
        return
      }

      const localHeard = capture.transcript?.trim() || ''
      if (localHeard) {
        setVoiceStatus({
          tone: 'info',
          lines: [`听到了：「${localHeard}」`, '正在核对…'],
        })
      } else {
        setVoiceStatus({
          tone: 'warn',
          lines: [
            '浏览器没有识别出文字',
            capture.detail || '将尝试把录音发给服务器',
            `期望：${beat.expect.join(' / ')}`,
          ],
        })
      }

      // App 只有录音、没有文字时：不能访问电脑 API，直接提示
      if (
        Capacitor.isNativePlatform() &&
        !localHeard
      ) {
        setVoiceStatus({
          tone: 'warn',
          lines: [
            '离线 Vosk 没有识别出文字',
            capture.detail || '请再说一次期望单词',
            `期望：${beat.expect.join(' / ')}`,
            'App 不连接电脑 API，无法用服务端转写',
          ],
        })
        await onOralResult(false)
        return
      }

      let result: {
        transcript: string
        matched: boolean
        source?: 'browser' | 'openai' | 'none' | 'local'
        hasAudio?: boolean
      }
      try {
        result = await submitSpeech({
          text: capture.transcript,
          blob: capture.blob,
          expect: beat.expect,
        })
      } catch (err) {
        setVoiceStatus({
          tone: 'error',
          lines: [
            '提交语音失败（/api/asr）',
            err instanceof Error ? err.message : String(err),
            '请确认电脑上的 API 服务在跑（端口 8787）',
          ],
        })
        setPhase('fallback')
        return
      }

      const heard = (result.transcript || localHeard || '').trim()
      if (!heard) {
        setVoiceStatus({
          tone: 'warn',
          lines: [
            '没有得到真实识别文字',
            localHeard
              ? `浏览器：「${localHeard}」`
              : '浏览器语音识别：空',
            result.hasAudio
              ? '已录到音频，但服务端 mock ASR 不会假装听懂（以前会直接返回 banana）'
              : '也没有录到音频',
            capture.detail || '请用 Chrome，并大声说期望单词',
            `期望：${beat.expect.join(' / ')}`,
          ],
        })
        await onOralResult(false)
        return
      }

      const sourceLabel =
        capture.source === 'vosk'
          ? '来源：App 离线 Vosk'
          : result.source === 'local' && capture.source === 'browser-speech'
            ? '来源：浏览器语音识别（本地匹配）'
            : result.source === 'local'
              ? '来源：本地匹配'
              : result.source === 'browser' || capture.source === 'browser-speech'
                ? '来源：浏览器语音识别'
                : result.source === 'openai'
                  ? '来源：云端 Whisper'
                  : capture.detail?.includes('Vosk')
                    ? '来源：App 离线 Vosk'
                    : '来源：未知'

      setVoiceStatus({
        tone: result.matched ? 'ok' : 'warn',
        lines: [
          `识别结果：「${heard}」`,
          sourceLabel,
          result.matched
            ? `匹配成功（期望：${beat.expect.join(' / ')}）`
            : `未匹配（期望：${beat.expect.join(' / ')}）`,
        ],
      })
      await onOralResult(result.matched)
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
      setVoiceStatus({
        tone: 'info',
        lines: [
          nativeVosk ? '正在听（离线 Vosk）…' : '正在听… 请说英语单词',
          `期望：${beat.expect.join(' / ')}`,
        ],
      })
      return
    }
    if (result === 'stopped') return
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
      setVoiceStatus({
        tone: 'info',
        lines: [`手动输入：「${devText}」`, '正在核对…'],
      })
      const result = await submitSpeech({ text: devText, expect: beat.expect })
      setVoiceStatus({
        tone: result.matched ? 'ok' : 'warn',
        lines: [
          `识别结果：「${result.transcript || devText}」`,
          result.matched
            ? `匹配成功（期望：${beat.expect.join(' / ')}）`
            : `未匹配（期望：${beat.expect.join(' / ')}）`,
        ],
      })
      await onOralResult(result.matched)
    } catch (err) {
      setVoiceStatus({
        tone: 'error',
        lines: [
          '提交失败',
          err instanceof Error ? err.message : String(err),
        ],
      })
    } finally {
      setBusy(false)
    }
  }

  async function onPick(correct: boolean) {
    if (!correct) {
      const nextRetry = retries + 1
      setBusy(true)
      await playFailFeedback()
      if (phase === 'find' && nextRetry < MAX_RETRIES) {
        setRetries(nextRetry)
        await requestTts(beat?.hint_say || beat?.expect?.[0] || beat?.npc_say || '')
        setBusy(false)
        return
      }
      await requestTts(beat?.expect?.[0] || beat?.hint_say || '')
      setBusy(false)
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
  const hasBeepTalk = Boolean(
    level.beep_talk?.start && level.beep_talk.nodes?.[level.beep_talk.start],
  )
  const inClearFlow = phase === 'clearCeremony' || phase === 'beepTalk'
  const tipText =
    micTip === 'insecure'
      ? Capacitor.isNativePlatform()
        ? `App 无法开麦克风。请确认 Info.plist 有「Privacy - Microphone Usage Description」，在本机执行 npm run patch:ios-plist 后重新 Xcode Run；也可先在下方输入单词。`
        : `当前是 ${pageProtocolHint() === 'http' ? 'http' : '非安全'} 页面，手机不能开麦克风。请在电脑运行 npm run dev:phone，手机用 https://电脑IP:5173 打开（证书点继续访问）；或先在下方输入单词。`
      : micTip === 'denied'
        ? Capacitor.isNativePlatform()
          ? '未获得麦克风权限。请到 iPhone「设置 → Fruit Forest」允许麦克风；也可在下方输入单词。'
          : '未获得麦克风权限。请在浏览器弹窗点「允许」，或到网站设置里打开麦克风；也可在下方输入单词。'
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
        onClick={requestExit}
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

      {sceneReady && phase === 'beepTalk' && level.beep_talk && (
        <BeepTalkPanel
          talk={level.beep_talk}
          onComplete={() => {
            setPhase('clearCeremony')
            setPulseContinue(false)
            // 聊完回仪式，再自动下一关（给一点时间点 ▶ / 再看贴纸）
            scheduleClearAutoLeave(nextLevelIdRef.current, CLEAR_AUTO_AFTER_TTS_MS)
          }}
        />
      )}

      {sceneReady && phase === 'clearCeremony' && (
        <ClearCeremonyOverlay
          stickerSrc={resolveCeremonyStickerSrc(level)}
          showBeepEntry={hasBeepTalk}
          pulseContinue={pulseContinue}
          onContinue={() => leaveAfterClear(nextLevelId)}
          onBeep={() => {
            if (clearAutoTimerRef.current != null) {
              window.clearTimeout(clearAutoTimerRef.current)
              clearAutoTimerRef.current = null
            }
            setPulseContinue(false)
            setPhase('beepTalk')
          }}
        />
      )}

      {exitConfirm && (
        <div className="clear-exit-confirm" role="dialog" aria-label="confirm exit">
          <div className="clear-exit-confirm__row">
            <button
              type="button"
              className="clear-exit-confirm__btn clear-exit-confirm__btn--yes"
              aria-label="confirm"
              onClick={() => {
                setExitConfirm(false)
                goMap()
              }}
            >
              ✓
            </button>
            <button
              type="button"
              className="clear-exit-confirm__btn clear-exit-confirm__btn--no"
              aria-label="cancel"
              onClick={() => setExitConfirm(false)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {sceneReady && !inClearFlow && (
        <>
          <img className="npc" src={assetUrl('assets/characters/bunny.png')} alt="" />
          {beat?.show && phase !== 'find' && (
            <img
              className={`focus-item ${phase === 'listen' ? 'bounce' : ''}`}
              src={assetUrl(beat.show)}
              alt=""
            />
          )}

          {voiceStatus && (
            <div className={`voice-status voice-status--${voiceStatus.tone}`} role="status">
              {voiceStatus.lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
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

          {resultFlash && (
            <div
              className={`result-flash result-flash--${resultFlash.kind}`}
              role="status"
              aria-live="polite"
            >
              <div className="result-flash__mark" aria-hidden>
                {resultFlash.kind === 'ok' ? '✓' : '✗'}
              </div>
              <div className="result-flash__title">{resultFlash.title}</div>
              <div className="result-flash__line">{resultFlash.line}</div>
            </div>
          )}

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
