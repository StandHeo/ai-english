import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTodayPlaySeconds,
  loadProgress,
  updateSettings,
} from '../progress/store'
import type { ProgressState } from '../types'
import './parent.css'

type Props = {
  progress: ProgressState
  onProgress: (p: ProgressState) => void
}

export function ParentPage({ progress, onProgress }: Props) {
  const navigate = useNavigate()
  const [gated, setGated] = useState(false)
  const [a] = useState(() => 2 + Math.floor(Math.random() * 5))
  const [b] = useState(() => 2 + Math.floor(Math.random() * 5))
  const [answer, setAnswer] = useState('')
  const [limit, setLimit] = useState(
    progress.dailyLimitMinutes == null ? '' : String(progress.dailyLimitMinutes),
  )

  const todayMin = useMemo(
    () => Math.round(getTodayPlaySeconds(progress) / 60),
    [progress],
  )

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

  if (!gated) {
    return (
      <div className="parent-screen">
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
      <h1>家长中心</h1>
      <section>
        <h2>今日游玩</h2>
        <p>约 {todayMin} 分钟</p>
      </section>
      <section>
        <h2>已完成关卡</h2>
        <ul>
          {progress.completed.length === 0 && <li>暂无</li>}
          {progress.completed.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>贴纸</h2>
        <p>{progress.stickers.join('、') || '暂无'}</p>
        <p>星星：{progress.stars}</p>
      </section>
      <section>
        <h2>每日时长上限（分钟）</h2>
        <p>留空表示不限制</p>
        <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" />
        <button type="button" onClick={saveLimit}>
          保存
        </button>
      </section>
      <button type="button" onClick={() => navigate('/')}>
        返回地图
      </button>
    </div>
  )
}
