import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { assetUrl, loadApprovedLevels, loadPack } from '../content/loader'
import {
  isDailyLimitReached,
} from '../progress/store'
import type { ContentPack, LevelScript, ProgressState } from '../types'
import './map.css'

type Props = {
  progress: ProgressState
  onProgress: (p: ProgressState) => void
}

export function MapPage({ progress }: Props) {
  const [pack, setPack] = useState<ContentPack | null>(null)
  const [levels, setLevels] = useState<LevelScript[]>([])
  const navigate = useNavigate()
  const limited = isDailyLimitReached(progress)

  useEffect(() => {
    Promise.all([loadPack(), loadApprovedLevels()]).then(([p, ls]) => {
      setPack(p)
      setLevels(ls)
    })
  }, [])

  const nodes = useMemo(() => {
    return levels.map((level, index) => {
      const unlocked = progress.unlocked.includes(level.id)
      const completed = progress.completed.includes(level.id)
      return { level, index, unlocked, completed }
    })
  }, [levels, progress])

  if (!pack) return <div className="screen loading-dot" />

  return (
    <div
      className="map-screen"
      style={{ backgroundImage: `url(${assetUrl(pack.mapImage)})` }}
    >
      <header className="map-top">
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
            onClick={() => unlocked && !limited && navigate(`/level/${level.id}`)}
          >
            <img src={assetUrl(level.reward.stickerImage)} alt="" />
            {!unlocked && <span className="lock" />}
          </button>
        ))}
      </div>

      <Link className="sr-only" to="/parent">
        parent
      </Link>
    </div>
  )
}
