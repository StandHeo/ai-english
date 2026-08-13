import { useMemo } from 'react'

export type SparkleStar = {
  id: string
  left: number
  top: number
  size: number
  delay: number
  duration: number
  spin: number
}

/** 避开画面中心（贴纸 / 香蕉苹果等焦点区）的安全落点 */
const SAFE_ZONES: Array<{ l: [number, number]; t: [number, number] }> = [
  { l: [3, 20], t: [4, 20] }, // 左上
  { l: [78, 95], t: [4, 20] }, // 右上
  { l: [2, 14], t: [24, 45] }, // 左中上
  { l: [86, 96], t: [24, 45] }, // 右中上
  { l: [28, 72], t: [2, 12] }, // 顶中（贴纸上方）
  { l: [6, 18], t: [52, 62] }, // 左下上沿（躲开底栏）
  { l: [82, 94], t: [52, 62] }, // 右下上沿
]

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function pickInZone(zone: { l: [number, number]; t: [number, number] }) {
  return {
    left: rand(zone.l[0], zone.l[1]),
    top: rand(zone.t[0], zone.t[1]),
  }
}

/** 生成若干闪闪发光的跳动星星位置（每次调用重新随机） */
export function makeSparkleStars(count: number, seedKey = ''): SparkleStar[] {
  const n = Math.max(1, Math.min(count, 5))
  const used = new Set<number>()
  const out: SparkleStar[] = []
  for (let i = 0; i < n; i++) {
    let zi = Math.floor(Math.random() * SAFE_ZONES.length)
    let guard = 0
    while (used.has(zi) && guard < 8) {
      zi = Math.floor(Math.random() * SAFE_ZONES.length)
      guard++
    }
    used.add(zi)
    const zone = SAFE_ZONES[zi]!
    const pos = pickInZone(zone)
    out.push({
      id: `${seedKey}-${i}-${Math.round(pos.left * 10)}-${Math.round(pos.top * 10)}`,
      left: pos.left,
      top: pos.top,
      size: rand(2.4, 4.2),
      delay: rand(0, 0.45),
      duration: rand(0.85, 1.25),
      spin: rand(-12, 12),
    })
  }
  return out
}

type Props = {
  count?: number
  /** 变化时重新随机落点，例如关卡 id */
  layoutKey?: string
  className?: string
}

export function SparkleStars({ count = 3, layoutKey = 'stars', className }: Props) {
  const stars = useMemo(
    () => makeSparkleStars(count, layoutKey),
    // layoutKey / count 变了才重抽；同一次通关保持稳定
    [count, layoutKey],
  )

  return (
    <div className={`sparkle-stars ${className || ''}`.trim()} aria-hidden>
      {stars.map((s) => (
        <span
          key={s.id}
          className="sparkle-star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            fontSize: `${s.size}rem`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            ['--star-spin' as string]: `${s.spin}deg`,
          }}
        >
          ★
          <span className="sparkle-star__glow" />
        </span>
      ))}
    </div>
  )
}
