import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  dayHasMiniPack,
  dayHasPlayableContent,
  getDay,
} from '../family/store'
import './family-calendar.css'

export function FamilyDayPackPage() {
  const { date = '' } = useParams()
  const navigate = useNavigate()
  const day = useMemo(() => getDay(date), [date])

  useEffect(() => {
    if (day && !dayHasMiniPack(day) && day.level) {
      navigate(`/family/${date}/play`, { replace: true })
    }
  }, [date, day, navigate])

  if (!day || !dayHasPlayableContent(day)) {
    return (
      <div className="family-cal">
        <header>
          <button type="button" className="icon" onClick={() => navigate('/family')} aria-label="back">
            ←
          </button>
          <h1>今日关卡</h1>
        </header>
        <p className="muted">这一天还没有家庭关卡。</p>
      </div>
    )
  }

  if (!dayHasMiniPack(day) && day.level) {
    return (
      <div className="family-cal">
        <p className="muted">正在打开关卡…</p>
      </div>
    )
  }

  const levels = day.miniLevels || []
  const title = day.pack?.title || '今日迷你关卡'

  return (
    <div className="family-cal">
      <header>
        <button type="button" className="icon" onClick={() => navigate('/family')} aria-label="back">
          ←
        </button>
        <h1>{title}</h1>
      </header>
      <p className="muted" style={{ padding: '0 1rem' }}>
        {date} · 共 {levels.length} 关（每关一个词，像水果关一样）
        {day.completed ? ' · 今日已全部通关' : ''}
      </p>
      <ul className="pack-level-list" style={{ listStyle: 'none', padding: '0.5rem 1rem', margin: 0 }}>
        {levels.map((m, i) => {
          const word = m.level.target_words?.[0] || m.id
          const done = Boolean(m.completed)
          return (
            <li key={m.id} style={{ marginBottom: '0.75rem' }}>
              <button
                type="button"
                className="primary"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => navigate(`/family/${date}/play/${encodeURIComponent(m.id)}`)}
              >
                <strong>
                  {i + 1}. {m.level.title || word}
                </strong>
                <span style={{ display: 'block', opacity: 0.85, fontWeight: 400 }}>
                  {word}
                  {m.scenePrompt || m.level.scene?.setting
                    ? ` · ${m.scenePrompt || m.level.scene.setting}`
                    : ''}
                  {done ? ' · 已通关' : ''}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
