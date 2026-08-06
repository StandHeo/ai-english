import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { listPackIds, loadPack } from '../content/loader'
import { listDaysWithLevels } from '../family/store'
import {
  getPackProgress,
  getTodayPlaySeconds,
  loadProgress,
  PACK_LABELS_ZH,
  updateSettings,
} from '../progress/store'
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

  useEffect(() => {
    listPackIds()
      .then((ids) => Promise.all(ids.map(loadPack)))
      .then(setPacks)
      .catch(() => setPacks([]))
  }, [])

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
        <h2>家庭日记关卡</h2>
        <p>和孩子聊今天，生成当晚可玩的英语小关</p>
        <button type="button" onClick={() => navigate('/family/studio')}>
          做今日关卡
        </button>
        <button type="button" className="linkish" onClick={() => navigate('/family')}>
          查看家庭日历
        </button>
        <ul className="family-day-list">
          {listDaysWithLevels()
            .slice(0, 7)
            .map((d) => (
              <li key={d.date}>
                {d.date}
                {d.completed ? ' · 已通关' : ' · 未通关'}
                {d.level ? ` · ${d.level.title}` : ''}
              </li>
            ))}
        </ul>
      </section>
      <section>
        <h2>今日游玩</h2>
        <p>约 {todayMin} 分钟</p>
      </section>
      {packs.map((pack) => {
        const pp = getPackProgress(progress, pack.id)
        return (
          <section key={pack.id}>
            <h2>{PACK_LABELS_ZH[pack.id] || pack.title}</h2>
            <p>已通关：{pp.completed.length ? pp.completed.join('、') : '暂无'}</p>
            <p>贴纸：{pp.stickers.length ? pp.stickers.join('、') : '暂无'}</p>
          </section>
        )
      })}
      <section>
        <h2>星星合计</h2>
        <p>{progress.stars}</p>
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
        返回首页
      </button>
    </div>
  )
}
