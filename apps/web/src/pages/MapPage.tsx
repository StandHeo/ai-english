import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { assetUrl, loadApprovedLevels, loadPack } from '../content/loader'
import { getPackProgress, isDailyLimitReached } from '../progress/store'
import type { ContentPack, LevelScript, ProgressState } from '../types'
import './map.css'

type Props = {
  progress: ProgressState
}

export function MapPage({ progress }: Props) {
  const { packId = 'fruit-forest' } = useParams()
  const [pack, setPack] = useState<ContentPack | null>(null)
  const [levels, setLevels] = useState<LevelScript[]>([])
  const navigate = useNavigate()
  const limited = isDailyLimitReached(progress)
  const packProgress = getPackProgress(progress, packId)

  useEffect(() => {
    setPack(null)
    Promise.all([loadPack(packId), loadApprovedLevels(packId)])
      .then(([p, ls]) => {
        setPack(p)
        setLevels(ls)
      })
      .catch(() => navigate('/'))
  }, [navigate, packId])

  const nodes = useMemo(() => {
    return levels.map((level, index) => {
      const unlocked = packProgress.unlocked.includes(level.id)
      const completed = packProgress.completed.includes(level.id)
      return { level, index, unlocked, completed }
    })
  }, [levels, packProgress])

  if (!pack) return <div className="screen loading-dot" />

  return (
    <div
      className="map-screen"
      style={{ backgroundImage: `url(${assetUrl(pack.mapImage)})` }}
    >
      <header className="map-top">
        <button className="exit-btn" onClick={() => navigate('/')} aria-label="home" />
        <img className="bunny-badge" src={assetUrl('assets/characters/bunny.png')} alt="" />
        <div className="map-actions">
          <button className="icon-btn" onClick={() => navigate('/stickers')} aria-label="stickers">
            ⭐
          </button>
          <button className="icon-btn" onClick={() => navigate('/parent')} aria-label="parent">
            👨‍👩‍👧
          </button>
        </div>
      </header>

      {limited && <div className="limit-banner" aria-hidden />}

      <div className="map-nodes">
        {nodes.map(({ level, unlocked, completed }) => (
          <button
            key={level.id}
            className={`level-node ${unlocked ? 'open' : 'locked'} ${completed ? 'done' : ''}`}
            disabled={!unlocked || limited}
            onClick={() =>
              unlocked && !limited && navigate(`/level/${level.id}?pack=${packId}`)
            }
          >
            <img src={assetUrl(level.reward.stickerImage)} alt="" />
            {!unlocked && <span className="lock" />}
          </button>
        ))}
      </div>
    </div>
  )
}
