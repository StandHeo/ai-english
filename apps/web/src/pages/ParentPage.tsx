import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { assetUrl, listPackIds, loadPack } from '../content/loader'
import { listDaysWithLevels } from '../family/store'
import {
  getPackProgress,
  getTodayPlaySeconds,
  loadProgress,
  PACK_LABELS_ZH,
  updateSettings,
} from '../progress/store'
import {
  defaultVoicePrefs,
  loadVoicePrefs,
  saveVoicePrefs,
  VOICE_PERSONA_OPTIONS,
  type VoicePersona,
  type VoicePrefs,
} from '../voice/prefs'
import { Capacitor } from '@capacitor/core'
import { requestTts } from '../voice/client'
import { ensurePiperReady } from '../voice/piperTts'
import type { ContentPack, ProgressState } from '../types'
import './parent.css'

type Props = {
  progress: ProgressState
  onProgress: (p: ProgressState) => void
}

export function ParentPage({ progress, onProgress }: Props) {
  const navigate = useNavigate()
  const [gated, setGated] = useState(false)
  const [packs, setPacks] = useState<ContentPack[]>([])
  const [a] = useState(() => 2 + Math.floor(Math.random() * 5))
  const [b] = useState(() => 2 + Math.floor(Math.random() * 5))
  const [answer, setAnswer] = useState('')
  const [limit, setLimit] = useState(
    progress.dailyLimitMinutes == null ? '' : String(progress.dailyLimitMinutes),
  )
  const [voicePrefs, setVoicePrefs] = useState<VoicePrefs>(() => loadVoicePrefs())
  const [voiceSaved, setVoiceSaved] = useState('')

  useEffect(() => {
    listPackIds()
      .then((ids) => Promise.all(ids.map(loadPack)))
      .then(setPacks)
      .catch(() => setPacks([]))
  }, [])

  useEffect(() => {
    if (!gated || !Capacitor.isNativePlatform()) return
    void ensurePiperReady().catch(() => {
      // 试听前预热；失败则 requestTts 降级系统 TTS
    })
  }, [gated])

  const todayMin = useMemo(
    () => Math.round(getTodayPlaySeconds(progress) / 60),
    [progress],
  )

  const recentDays = useMemo(() => listDaysWithLevels().slice(0, 5), [gated])

  function onGate(e: FormEvent) {
    e.preventDefault()
    if (Number(answer) === a + b) setGated(true)
  }

  function saveLimit() {
    const minutes = limit.trim() === '' ? null : Number(limit)
    const next = updateSettings(loadProgress(), {
      dailyLimitMinutes: minutes != null && !Number.isNaN(minutes) ? minutes : null,
    })
    onProgress(next)
  }

  function patchVoice(partial: Partial<VoicePrefs>) {
    const next = { ...voicePrefs, ...partial }
    setVoicePrefs(next)
    saveVoicePrefs(next)
    setVoiceSaved('已保存，关卡里马上生效')
  }

  async function previewVoice() {
    saveVoicePrefs(voicePrefs)
    setVoiceSaved('试听中…')
    await requestTts("Hi! Let's play. Say apple!")
    setVoiceSaved('已保存，关卡里马上生效')
  }

  if (!gated) {
    return (
      <div className="parent-screen parent-gate">
        <img className="parent-hero-img" src={assetUrl('assets/characters/bunny.png')} alt="" />
        <h1>家长入口</h1>
        <p>请先完成简单验证</p>
        <form onSubmit={onGate}>
          <label>
            {a} + {b} = ?
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} inputMode="numeric" />
          </label>
          <button type="submit">进入</button>
        </form>
        <button type="button" className="linkish" onClick={() => navigate('/')}>
          返回
        </button>
      </div>
    )
  }

  return (
    <div className="parent-screen">
      <header className="parent-header">
        <img className="parent-avatar" src={assetUrl('assets/characters/bunny.png')} alt="" />
        <div>
          <h1>家长中心</h1>
          <p className="muted">今日已玩约 {todayMin} 分钟 · 星星 {progress.stars}</p>
        </div>
      </header>

      <div className="parent-card-grid">
        <button
          type="button"
          className="parent-feature-card"
          onClick={() => navigate('/family/studio')}
        >
          <img src={assetUrl('assets/scenes/friend-park.png')} alt="" />
          <span className="card-label">
            <strong>家庭日记</strong>
            <small>聊今天 · 生成英语小关</small>
          </span>
        </button>
        <button
          type="button"
          className="parent-feature-card"
          onClick={() => navigate('/family')}
        >
          <img src={assetUrl('assets/scenes/orchard.png')} alt="" />
          <span className="card-label">
            <strong>家庭日历</strong>
            <small>查看与玩每日关卡</small>
          </span>
        </button>
      </div>

      {recentDays.length > 0 && (
        <section className="parent-recent">
          <h2>最近日记关卡</h2>
          <ul className="family-day-cards">
            {recentDays.map((d) => (
              <li key={d.date}>
                <button type="button" onClick={() => navigate(`/family/${d.date}/play`)}>
                  <img
                    src={
                      d.images[0] ||
                      d.level?.scene?.image ||
                      assetUrl('assets/scenes/map.png')
                    }
                    alt=""
                  />
                  <span>
                    {d.date}
                    {d.completed ? ' · 已通关' : ' · 未通关'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="parent-voice">
        <div className="section-head">
          <img src={assetUrl('assets/scenes/beep-hall.png')} alt="" className="section-thumb" />
          <div>
            <h2>英语朗读声音</h2>
            <p className="muted">系统朗读 · 默认小女孩更活泼</p>
          </div>
        </div>
        <div className="voice-grid">
          {VOICE_PERSONA_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`voice-chip ${voicePrefs.persona === opt.id ? 'active' : ''}`}
              onClick={() => patchVoice({ persona: opt.id as VoicePersona })}
            >
              {opt.label}
              <small>{opt.hint}</small>
            </button>
          ))}
        </div>
        <div className="voice-sliders">
          <label>
            语速微调（{voicePrefs.rateBoost >= 0 ? '+' : ''}
            {voicePrefs.rateBoost.toFixed(2)}）
            <input
              type="range"
              min={-0.25}
              max={0.25}
              step={0.05}
              value={voicePrefs.rateBoost}
              onChange={(e) => patchVoice({ rateBoost: Number(e.target.value) })}
            />
          </label>
          <label>
            音调微调（{voicePrefs.pitchBoost >= 0 ? '+' : ''}
            {voicePrefs.pitchBoost.toFixed(2)}）
            <input
              type="range"
              min={-0.35}
              max={0.35}
              step={0.05}
              value={voicePrefs.pitchBoost}
              onChange={(e) => patchVoice({ pitchBoost: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="row-actions">
          <button type="button" onClick={() => void previewVoice()}>
            试听
          </button>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              const d = defaultVoicePrefs()
              setVoicePrefs(d)
              saveVoicePrefs(d)
              setVoiceSaved('已恢复默认（小女孩）')
            }}
          >
            恢复默认
          </button>
        </div>
        {voiceSaved && <p className="muted">{voiceSaved}</p>}
      </section>

      <section className="parent-packs">
        <h2>主题进度</h2>
        <div className="pack-progress-grid">
          {packs.map((pack) => {
            const pp = getPackProgress(progress, pack.id)
            return (
              <button
                key={pack.id}
                type="button"
                className="pack-progress-card"
                onClick={() => navigate(`/map/${pack.id}`)}
              >
                <img src={assetUrl(pack.homeImage || pack.mapImage)} alt="" />
                <span>
                  <strong>{PACK_LABELS_ZH[pack.id] || pack.title}</strong>
                  <small>
                    通关 {pp.completed.length} · 贴纸 {pp.stickers.length}
                  </small>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <h2>每日时长上限（分钟）</h2>
        <p className="muted">留空表示不限制</p>
        <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" />
        <button type="button" onClick={saveLimit}>
          保存
        </button>
      </section>

      <button type="button" className="home-back" onClick={() => navigate('/')}>
        返回首页
      </button>
    </div>
  )
}
