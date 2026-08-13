import { useEffect, useState } from 'react'
import { assetUrl } from '../content/loader'
import { isDataUrl } from './clearCeremony'

type Props = {
  stickerSrc: string
  showBeepEntry: boolean
  pulseContinue: boolean
  onContinue: () => void
  onBeep: () => void
}

export function ClearCeremonyOverlay({
  stickerSrc,
  showBeepEntry,
  pulseContinue,
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

  return (
    <div className="clear-ceremony" role="dialog" aria-label="level clear">
      <div className="clear-ceremony__dim" aria-hidden />
      <div className="clear-ceremony__burst" aria-hidden />
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
      <div className="clear-ceremony__star" aria-hidden>
        ★
      </div>
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
