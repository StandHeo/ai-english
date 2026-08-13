import { useEffect, useState } from 'react'
import { assetUrl } from '../content/loader'
import { isDataUrl } from './clearCeremony'
import { SparkleStars } from './SparkleStars'

type Props = {
  stickerSrc: string
  showBeepEntry: boolean
  pulseContinue: boolean
  /** 通关奖励星星数；展示时至少 3 颗更有存在感 */
  starCount?: number
  layoutKey?: string
  onContinue: () => void
  onBeep: () => void
}

export function ClearCeremonyOverlay({
  stickerSrc,
  showBeepEntry,
  pulseContinue,
  starCount = 1,
  layoutKey = 'clear',
  onContinue,
  onBeep,
}: Props) {
  const [imgSrc, setImgSrc] = useState(() =>
    isDataUrl(stickerSrc) ? stickerSrc : assetUrl(stickerSrc),
  )

  useEffect(() => {
    if (isDataUrl(stickerSrc)) {
      setImgSrc(stickerSrc)
      return
    }
    setImgSrc(assetUrl(stickerSrc))
  }, [stickerSrc])

  const sparkleCount = Math.max(3, Math.min(starCount + 2, 5))

  return (
    <div className="clear-ceremony" role="dialog" aria-label="level clear">
      <div className="clear-ceremony__dim" aria-hidden />
      <div className="clear-ceremony__burst" aria-hidden />
      <SparkleStars count={sparkleCount} layoutKey={layoutKey} />
      <img
        className="clear-ceremony__sticker"
        src={imgSrc}
        alt=""
        onError={() => {
          setImgSrc(
            "data:image/svg+xml," +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><circle cx="60" cy="60" r="56" fill="#fff8e8"/><path fill="#f0b429" d="M60 18l12.4 25.1 27.7 4-20 19.5 4.7 27.6L60 80.8 35.2 94.2l4.7-27.6-20-19.5 27.7-4z"/></svg>`,
              ),
          )
        }}
      />
      <button
        type="button"
        className={`clear-ceremony__continue ${pulseContinue ? 'pulse' : ''}`}
        aria-label="continue"
        onClick={onContinue}
      >
        ▶
      </button>
      {showBeepEntry && (
        <button
          type="button"
          className="clear-ceremony__beep"
          aria-label="talk with Beep"
          onClick={onBeep}
        >
          <img src={assetUrl('assets/items/robot.png')} alt="" />
        </button>
      )}
    </div>
  )
}
