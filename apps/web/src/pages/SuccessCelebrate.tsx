/** 选对时的成就感动画：多种变体轮换，纯 CSS/SVG，无需联网或 GIF。 */

export type CelebrateVariant = 'check' | 'stars' | 'confetti' | 'trophy' | 'hearts' | 'rings'

const VARIANTS: CelebrateVariant[] = [
  'check',
  'stars',
  'confetti',
  'trophy',
  'hearts',
  'rings',
]

const TITLES: Record<CelebrateVariant, string[]> = {
  check: ['太棒了！', '答对啦！'],
  stars: ['闪闪发光！', '超级棒！'],
  confetti: ['耶——！', '庆祝一下！'],
  trophy: ['大赢家！', '冠军时刻！'],
  hearts: ['爱你呦！', '好喜欢！'],
  rings: ['完美！', '厉害！'],
}

let celebrateCursor = 0

/** 轮换 + 轻微随机，避免连续两次完全一样 */
export function pickCelebrateVariant(): CelebrateVariant {
  celebrateCursor = (celebrateCursor + 1 + Math.floor(Math.random() * 2)) % VARIANTS.length
  return VARIANTS[celebrateCursor]!
}

export function celebrateTitleFor(variant: CelebrateVariant): string {
  const pool = TITLES[variant]
  return pool[Math.floor(Math.random() * pool.length)] || '太棒了！'
}

type Props = {
  variant: CelebrateVariant
  title: string
  line: string
}

function Mark({ variant }: { variant: CelebrateVariant }) {
  switch (variant) {
    case 'stars':
      return (
        <div className="celeb-mark celeb-mark--stars" aria-hidden>
          <span className="celeb-mark__core">★</span>
          <span className="celeb-spark celeb-spark--1">✦</span>
          <span className="celeb-spark celeb-spark--2">✧</span>
          <span className="celeb-spark celeb-spark--3">✦</span>
        </div>
      )
    case 'confetti':
      return (
        <div className="celeb-mark celeb-mark--confetti" aria-hidden>
          <span className="celeb-mark__core">✓</span>
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className={`celeb-bit celeb-bit--${i + 1}`} />
          ))}
        </div>
      )
    case 'trophy':
      return (
        <div className="celeb-mark celeb-mark--trophy" aria-hidden>
          <span className="celeb-mark__core celeb-trophy" />
        </div>
      )
    case 'hearts':
      return (
        <div className="celeb-mark celeb-mark--hearts" aria-hidden>
          <span className="celeb-mark__core celeb-heart-shape" />
          <span className="celeb-heart celeb-heart--1">
            <span className="celeb-heart-shape celeb-heart-shape--sm" />
          </span>
          <span className="celeb-heart celeb-heart--2">
            <span className="celeb-heart-shape celeb-heart-shape--sm" />
          </span>
          <span className="celeb-heart celeb-heart--3">
            <span className="celeb-heart-shape celeb-heart-shape--sm" />
          </span>
        </div>
      )
    case 'rings':
      return (
        <div className="celeb-mark celeb-mark--rings" aria-hidden>
          <span className="celeb-ring celeb-ring--1" />
          <span className="celeb-ring celeb-ring--2" />
          <span className="celeb-ring celeb-ring--3" />
          <span className="celeb-mark__core">◎</span>
        </div>
      )
    case 'check':
    default:
      return (
        <div className="celeb-mark celeb-mark--check" aria-hidden>
          <span className="celeb-mark__core">✓</span>
        </div>
      )
  }
}

export function SuccessCelebrate({ variant, title, line }: Props) {
  return (
    <>
      <div className={`burst burst--${variant}`} aria-hidden />
      <div
        className={`result-flash result-flash--ok result-flash--${variant}`}
        role="status"
        aria-live="polite"
      >
        <Mark variant={variant} />
        <div className="result-flash__title">{title}</div>
        {line ? <div className="result-flash__line">{line}</div> : null}
      </div>
    </>
  )
}
