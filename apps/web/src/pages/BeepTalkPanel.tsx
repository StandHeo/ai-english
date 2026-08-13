import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { assetUrl } from '../content/loader'
import { cancelSpeak, requestTts, submitSpeech } from '../voice/client'
import { playFailSfx, playSuccessSfx } from '../voice/sfx'
import { usePressToTalk, type TalkCapture } from '../voice/usePressToTalk'
import type { BeepTalk, TalkNode } from '../types'

const MAX_RETRIES = 2
const BEEP_LISTEN_MS = 5000

type Props = {
  talk: BeepTalk
  onComplete: () => void
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function BeepTalkPanel({ talk, onComplete }: Props) {
  const [nodeId, setNodeId] = useState(talk.start)
  const [phase, setPhase] = useState<'speak' | 'listen' | 'fallback' | 'celebrate'>('speak')
  const [retries, setRetries] = useState(0)
  const [busy, setBusy] = useState(false)
  const [showDevType, setShowDevType] = useState(false)
  const [devText, setDevText] = useState('')
  const [statusLines, setStatusLines] = useState<string[]>([])
  const finishingRef = useRef(false)
  const { recording, toggleListen, cancelAutoStop, nativeVosk } = usePressToTalk()

  const node: TalkNode | undefined = talk.nodes[nodeId]

  useEffect(() => {
    if (!node) return
    let cancelled = false
    ;(async () => {
      setBusy(true)
      setPhase('speak')
      setRetries(0)
      setStatusLines([`Beep: ${node.robot_say}`])
      await requestTts(node.robot_say)
      if (cancelled) return
      setPhase('listen')
      setBusy(false)
    })()
    return () => {
      cancelled = true
      void cancelSpeak()
    }
  }, [nodeId, node])

  function goNext(fromFail: boolean) {
    if (!node) return
    const raw = fromFail
      ? (node.on_fail_next !== undefined ? node.on_fail_next : node.next)
      : node.next
    if (raw == null || raw === '') {
      onComplete()
      return
    }
    if (!talk.nodes[raw]) {
      onComplete()
      return
    }
    setNodeId(raw)
  }

  async function onOralResult(matched: boolean) {
    if (!node) return
    if (matched) {
      const line = node.success_say || 'Beep! Yes!'
      setPhase('celebrate')
      setStatusLines([line])
      // 对了：设计成功音效 + 短成功句；错了绝不用好玩的鼓励语
      await playSuccessSfx()
      await requestTts(line)
      await sleep(700)
      goNext(false)
      return
    }
    const nextRetry = retries + 1
    setBusy(true)
    await playFailSfx()
    if (nextRetry < MAX_RETRIES) {
      setRetries(nextRetry)
      await requestTts(node.hint_say || node.robot_say)
      setBusy(false)
      setPhase('listen')
      return
    }
    setBusy(false)
    if (node.fallback?.options?.length) {
      setPhase('fallback')
      return
    }
    // 无兜底时仍前进，避免卡死
    goNext(true)
  }

  async function handleCapture(capture: TalkCapture) {
    if (!node?.expect || finishingRef.current) return
    finishingRef.current = true
    setBusy(true)
    try {
      if (capture.error || (!capture.transcript && !capture.blob)) {
        setStatusLines(['没有听到，请再试或点图'])
        if (node.fallback?.options?.length) setPhase('fallback')
        else await onOralResult(false)
        return
      }
      if (Capacitor.isNativePlatform() && !capture.transcript?.trim()) {
        setStatusLines(['没听清，请再说一次'])
        await onOralResult(false)
        return
      }
      const result = await submitSpeech({
        text: capture.transcript,
        blob: capture.blob,
        expect: node.expect,
      })
      const heard = (result.transcript || capture.transcript || '').trim()
      setStatusLines(
        heard
          ? [`听到了：「${heard}」`, result.matched ? '匹配成功' : '再试试']
          : ['没有识别到文字'],
      )
      await onOralResult(Boolean(heard && result.matched))
    } catch (err) {
      setStatusLines([err instanceof Error ? err.message : String(err)])
      if (node.fallback?.options?.length) setPhase('fallback')
    } finally {
      setBusy(false)
      finishingRef.current = false
    }
  }

  async function handleMicTap() {
    if (busy || phase !== 'listen' || !node?.expect) return
    const result = await toggleListen(
      (capture) => {
        void handleCapture(capture)
      },
      { grammarWords: node.expect, listenMs: BEEP_LISTEN_MS },
    )
    if (result === 'started') {
      setShowDevType(false)
      setStatusLines([
        nativeVosk ? 'Beep 在听（离线）…' : 'Beep 在听…',
        `可以说：${node.expect.join(' / ')}`,
      ])
      return
    }
    if (result === 'stopped') return
    cancelAutoStop()
    if (typeof result === 'object') await handleCapture(result)
  }

  async function handleDevSubmit() {
    if (!node?.expect) return
    cancelAutoStop()
    setBusy(true)
    try {
      const result = await submitSpeech({ text: devText, expect: node.expect })
      await onOralResult(result.matched)
    } finally {
      setBusy(false)
    }
  }

  async function onPick(correct: boolean) {
    setBusy(true)
    if (!correct) {
      await playFailSfx()
      setBusy(false)
      return
    }
    const line = node?.success_say || 'Beep! Yes!'
    setPhase('celebrate')
    await playSuccessSfx()
    await requestTts(line)
    await sleep(600)
    setBusy(false)
    goNext(true)
  }

  if (!node) {
    return (
      <div className="beep-panel">
        <p className="mic-tip">Beep talk missing node</p>
        <button type="button" className="choice-tile" onClick={onComplete}>
          Continue
        </button>
      </div>
    )
  }

  return (
    <div className="beep-panel">
      <div className="beep-badge" aria-hidden>
        Beep
      </div>
      <img
        className="npc npc--beep"
        src={assetUrl('assets/items/robot.png')}
        alt="Beep"
      />
      {node.show && phase !== 'fallback' && (
        <img
          className={`focus-item ${phase === 'listen' ? 'bounce' : ''}`}
          src={assetUrl(node.show)}
          alt=""
        />
      )}

      {statusLines.length > 0 && (
        <div className="voice-status voice-status--info" role="status">
          {statusLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}

      {phase === 'listen' && !recording && (
        <div className="mic-tip" role="status">
          点麦克风和 Beep 说英语～
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

      {phase === 'fallback' && node.fallback?.options && (
        <div className="choice-row">
          {node.fallback.options.map((opt) => (
            <button
              key={opt.id}
              className="choice-tile"
              disabled={busy}
              onClick={() => void onPick(opt.correct)}
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
            placeholder={node.expect[0] || 'word'}
            aria-label="type word"
          />
          <button type="button" onClick={() => void handleDevSubmit()}>
            OK
          </button>
        </div>
      )}
    </div>
  )
}
