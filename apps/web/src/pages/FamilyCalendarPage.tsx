import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  dayHasPlayableContent,
  getDay,
  listDaysWithLevels,
  listDaysWithVoice,
  searchFamilyDays,
  todayKey,
} from '../family/store'
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
  const [query, setQuery] = useState('')
  const daysWith = useMemo(() => new Set(listDaysWithLevels().map((d) => d.date)), [])
  const daysVoice = useMemo(() => new Set(listDaysWithVoice()), [])
  const searchHits = useMemo(() => searchFamilyDays(query), [query])
  const searching = query.trim().length > 0

  const cells = monthMatrix(cursor.y, cursor.m)

  function dateOf(day: number) {
    const m = String(cursor.m + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${cursor.y}-${m}-${d}`
  }

  function onPick(day: number) {
    const key = dateOf(day)
    const rec = getDay(key)
    if (!dayHasPlayableContent(rec)) {
      const voiceNote = rec?.messages?.some((m) => m.audioId || m.audioDataUrl)
        ? '\n（这一天有日记语音，可让家长在制作台回听。）'
        : ''
      window.alert(`这一天还没有家庭关卡。请让家长在「家庭日记」里生成。${voiceNote}`)
      return
    }
    navigate(`/family/${key}`)
  }

  return (
    <div className="family-cal">
      <header>
        <button type="button" className="icon" onClick={() => navigate('/')} aria-label="home">
          ←
        </button>
        <h1>家庭日历</h1>
      </header>

      <input
        type="search"
        className="family-search-box"
        placeholder="搜索日记 / 关卡词 / 场景 / 提示词…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="搜索家庭日记与关卡"
      />

      {searching && (
        <div className="family-search-results">
          {searchHits.length === 0 ? (
            <p className="muted">没有匹配的日记或关卡</p>
          ) : (
            searchHits.map((hit) => (
              <div key={hit.date} className="family-search-hit">
                <div className="family-search-hit-head">
                  <strong>{hit.date}</strong>
                  <span className="muted">
                    {hit.title}
                    {hit.levelCount ? ` · ${hit.levelCount} 关` : ''}
                    {hit.completed ? ' · 已通关' : ''}
                  </span>
                </div>
                {hit.snippets.map((s, i) => (
                  <p key={i} className="family-search-snippet">
                    {s}
                  </p>
                ))}
                <div className="family-search-actions">
                  <button type="button" onClick={() => navigate(`/family/${hit.date}`)}>
                    打开关卡
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => navigate(`/family/studio?date=${hit.date}`)}
                  >
                    编辑
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div className="month-nav" style={searching ? { display: 'none' } : undefined}>
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

      <div className="dow" style={searching ? { display: 'none' } : undefined}>
        {['日', '一', '二', '三', '四', '五', '六'].map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <div className="grid" style={searching ? { display: 'none' } : undefined}>
        {cells.map((day, i) => {
          if (day == null) return <span key={`e-${i}`} className="cell empty" />
          const key = dateOf(day)
          const has = daysWith.has(key)
          const hasVoice = daysVoice.has(key)
          const isToday = key === today
          const done = getDay(key)?.completed
          return (
            <button
              key={key}
              type="button"
              className={`cell ${has ? 'has' : ''} ${hasVoice ? 'voice' : ''} ${isToday ? 'today' : ''} ${done ? 'done' : ''}`}
              onClick={() => onPick(day)}
              title={hasVoice ? '有日记语音' : undefined}
            >
              <span className="day-num">{day}</span>
              {hasVoice && <span className="voice-dot" aria-label="有语音" />}
            </button>
          )
        })}
      </div>

      <p className="legend" style={searching ? { display: 'none' } : undefined}>
        有颜色的日子表示已生成关卡 · 小圆点表示有日记语音
      </p>
      <button
        type="button"
        className="play-today"
        style={searching ? { display: 'none' } : undefined}
        onClick={() => {
          const day = getDay(today)
          if (!dayHasPlayableContent(day)) {
            window.alert('今天还没有家庭关卡。请让家长先做「家庭日记」并生成关卡。')
            return
          }
          // 迷你 pack → 当日关卡地图；旧单关也会由 DayPack 页转到 /play
          navigate(`/family/${today}`)
        }}
      >
        玩今天
      </button>
    </div>
  )
}
