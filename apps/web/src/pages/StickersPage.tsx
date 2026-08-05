import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assetUrl, loadAllApprovedLevels } from '../content/loader'
import { allStickers } from '../progress/store'
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

  return (
    <div className="stickers-screen">
      <button className="exit-btn dark" onClick={() => navigate('/')} aria-label="back" />
      <div className="sticker-grid">
        {levels.map((level) => {
          const got = earned.includes(level.reward.sticker)
          return (
            <div key={level.id} className={`sticker-slot ${got ? 'earned' : 'empty'}`}>
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
