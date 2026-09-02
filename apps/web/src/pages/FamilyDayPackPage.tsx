import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  dayHasMiniPack,
  dayHasPlayableContent,
  getDay,
  hydrateFamilyDayImages,
  type FamilyDayRecord,
  type FamilyMiniLevel,
} from '../family/store'
import './family-calendar.css'
import './map.css'
import './family-day-pack.css'

function thumbFor(m: FamilyMiniLevel): string {
  return (
    m.imageBg ||
    m.itemImages?.[0] ||
    `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#ffe2a8"/><stop offset="1" stop-color="#c8e8ff"/>
        </linearGradient></defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
        <circle cx="128" cy="110" r="48" fill="#fff6e8"/>
        <text x="50%" y="78%" text-anchor="middle" font-family="system-ui,sans-serif"
          font-size="28" font-weight="700" fill="#5a3d1b">${(m.level.target_words?.[0] || '?')
            .replace(/[<>&"']/g, '')
            .slice(0, 10)}</text>
      </svg>`,
    )}`
  )
}

export function FamilyDayPackPage() {
  const { date = '' } = useParams()
  const navigate = useNavigate()
  const [day, setDay] = useState<FamilyDayRecord | null>(() => getDay(date))

  useEffect(() => {
    const raw = getDay(date)
    setDay(raw)
    if (!raw) return
    let cancelled = false
    void hydrateFamilyDayImages(raw).then((hydrated) => {
      if (!cancelled) setDay(hydrated)
    })
    return () => {
      cancelled = true
    }
  }, [date])

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
  const firstBg = levels.find((m) => m.imageBg)?.imageBg

  return (
    <div
      className="family-day-map"
      style={
        firstBg
          ? {
              backgroundImage: `linear-gradient(180deg, rgba(255,246,232,0.72), rgba(232,244,255,0.88)), url(${firstBg})`,
            }
          : undefined
      }
    >
      <header className="family-day-map-top">
        <button type="button" className="exit-btn" onClick={() => navigate('/family')} aria-label="back" />
        <div className="family-day-map-title">
          <h1>{title}</h1>
          <p>
            {date} · {levels.length} 关
            {day.completed ? ' · 已全部通关' : ''}
          </p>
        </div>
      </header>

      <div className="map-nodes family-pack-nodes">
        {levels.map((m, i) => {
          const word = m.level.target_words?.[0] || m.id
          const done = Boolean(m.completed)
          return (
            <div key={m.id} className={`family-pack-node-wrap ${i % 2 === 0 ? 'odd' : 'even'}`}>
              <button
                type="button"
                className={`level-node open ${done ? 'done' : ''}`}
                aria-label={`${i + 1}. ${m.level.title || word}`}
                onClick={() => navigate(`/family/${date}/play/${encodeURIComponent(m.id)}`)}
              >
                <img src={thumbFor(m)} alt="" />
              </button>
              <span className="family-pack-node-label">
                <strong>
                  {i + 1}. {word}
                </strong>
                <small>{m.level.title || m.scenePrompt || m.level.scene?.setting || ''}</small>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
