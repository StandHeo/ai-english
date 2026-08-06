import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getDay, listDaysWithLevels, todayKey } from '../family/store'
import './family-calendar.css'

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function FamilyCalendarPage() {
  const navigate = useNavigate()
  const today = todayKey()
  const now = new Date()
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const daysWith = useMemo(() => new Set(listDaysWithLevels().map((d) => d.date)), [])

  const cells = monthMatrix(cursor.y, cursor.m)

  function dateOf(day: number) {
    const m = String(cursor.m + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${cursor.y}-${m}-${d}`
  }

  function onPick(day: number) {
    const key = dateOf(day)
    const rec = getDay(key)
    if (!rec?.level) {
      window.alert('这一天还没有家庭关卡。请让家长在「做今日关卡」里生成。')
      return
    }
    navigate(`/family/${key}/play`)
  }

  return (
    <div className="family-cal">
      <header>
        <button type="button" className="icon" onClick={() => navigate('/')} aria-label="home">
          ←
        </button>
        <h1>家庭日历</h1>
      </header>

      <div className="month-nav">
        <button
          type="button"
          onClick={() =>
            setCursor((c) => {
              const d = new Date(c.y, c.m - 1, 1)
              return { y: d.getFullYear(), m: d.getMonth() }
            })
          }
        >
          ‹
        </button>
        <span>
          {cursor.y}年{cursor.m + 1}月
        </span>
        <button
          type="button"
          onClick={() =>
            setCursor((c) => {
              const d = new Date(c.y, c.m + 1, 1)
              return { y: d.getFullYear(), m: d.getMonth() }
            })
          }
        >
          ›
        </button>
      </div>

      <div className="dow">
        {['日', '一', '二', '三', '四', '五', '六'].map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <div className="grid">
        {cells.map((day, i) => {
          if (day == null) return <span key={`e-${i}`} className="cell empty" />
          const key = dateOf(day)
          const has = daysWith.has(key)
          const isToday = key === today
          const done = getDay(key)?.completed
          return (
            <button
              key={key}
              type="button"
              className={`cell ${has ? 'has' : ''} ${isToday ? 'today' : ''} ${done ? 'done' : ''}`}
              onClick={() => onPick(day)}
            >
              {day}
            </button>
          )
        })}
      </div>

      <p className="legend">有颜色的日子表示已生成关卡 · 点进去玩</p>
      <button
        type="button"
        className="play-today"
        onClick={() => {
          const day = getDay(today)
          if (!day?.level) {
            window.alert('今天还没有家庭关卡。请让家长先「做今日关卡」。')
            return
          }
          navigate(`/family/${today}/play`)
        }}
      >
        玩今天
      </button>
    </div>
  )
}
