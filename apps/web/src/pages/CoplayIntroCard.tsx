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
          <li>选一个主题，先玩第 1 关</li>
          <li>听不懂看图；说不出可以点图</li>
          <li>通关看贴纸，星星会闪哦</li>
        </ol>
        <button type="button" className="coplay-intro__go" onClick={dismiss}>
          开始吧
        </button>
      </div>
    </div>
  )
}
