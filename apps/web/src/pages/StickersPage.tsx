import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assetUrl, loadAllApprovedLevels } from '../content/loader'
import { allStickers } from '../progress/store'
import { isStickerEarnedTonight } from '../progress/stickerTonight'
import type { LevelScript, ProgressState } from '../types'
import './stickers.css'

type Props = { progress: ProgressState }

export function StickersPage({ progress }: Props) {
  const navigate = useNavigate()
  const [levels, setLevels] = useState<LevelScript[]>([])
  const earned = allStickers(progress)

  useEffect(() => {
    loadAllApprovedLevels().then(setLevels)
  }, [])

  const tonightCount = levels.filter(
    (level) =>
      earned.includes(level.reward.sticker) && isStickerEarnedTonight(level.reward.sticker),
  ).length

  return (
    <div className="stickers-screen">
      <button className="exit-btn dark" onClick={() => navigate('/')} aria-label="back" />
      {tonightCount > 0 && (
        <p className="stickers-tonight-banner" role="status">
          今晚新得 {tonightCount} 张贴纸
        </p>
      )}
      <div className="sticker-grid">
        {levels.map((level) => {
          const got = earned.includes(level.reward.sticker)
          const tonight = got && isStickerEarnedTonight(level.reward.sticker)
          return (
            <div
              key={level.id}
              className={`sticker-slot ${got ? 'earned' : 'empty'} ${tonight ? 'tonight' : ''}`}
            >
              {tonight && <span className="sticker-tonight-badge" aria-hidden>新</span>}
              <img src={assetUrl(level.reward.stickerImage)} alt="" />
            </div>
          )
        })}
      </div>
      <div className="star-count" aria-hidden>
        {'★'.repeat(Math.min(progress.stars, 24))}
      </div>
    </div>
  )
}
