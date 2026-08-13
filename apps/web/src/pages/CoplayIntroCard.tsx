import { useEffect, useState } from 'react'
import './coplay-intro.css'

const KEY = 'ai-english-coplay-intro-v1'

type Props = {
  onDone?: () => void
}

export function CoplayIntroCard({ onDone }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === '1') return
      setOpen(true)
    } catch {
      setOpen(true)
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    setOpen(false)
    onDone?.()
  }

  if (!open) return null

  return (
    <div className="coplay-intro" role="dialog" aria-label="tonight play tip">
      <div className="coplay-intro__card">
        <p className="coplay-intro__brand">今晚一起玩</p>
        <ol className="coplay-intro__steps">
          <li>
            <span className="coplay-intro__emoji" aria-hidden>
              👂
            </span>
            先听大图说英语
          </li>
          <li>
            <span className="coplay-intro__emoji" aria-hidden>
              🎤
            </span>
            点红麦跟着说；说不出可点图
          </li>
          <li>
            <span className="coplay-intro__emoji" aria-hidden>
              ⭐
            </span>
            通关拿贴纸，星星会闪哦
          </li>
        </ol>
        <button type="button" className="coplay-intro__go" onClick={dismiss}>
          开始吧
        </button>
      </div>
    </div>
  )
}
