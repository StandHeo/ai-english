import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { assetUrl, listPackIds, loadPack } from '../content/loader'
import type { ContentPack } from '../types'
import './home.css'

export function HomePage() {
  const navigate = useNavigate()
  const [packs, setPacks] = useState<ContentPack[]>([])

  useEffect(() => {
    listPackIds()
      .then((ids) => Promise.all(ids.map(loadPack)))
      .then(setPacks)
      .catch(() => setPacks([]))
  }, [])

  if (!packs.length) return <div className="screen loading-dot" />

  return (
    <div className="home-screen">
      <img className="home-bunny" src={assetUrl('assets/characters/bunny.png')} alt="" />
      <div className="home-actions">
        <button className="icon-btn" onClick={() => navigate('/stickers')} aria-label="stickers">
          ⭐
        </button>
        <button className="icon-btn" onClick={() => navigate('/parent')} aria-label="parent">
          👨‍👩‍👧
        </button>
      </div>
      <div className="theme-grid">
        <button
          className="theme-card family-card"
          type="button"
          aria-label="Family Calendar"
          onClick={() => navigate('/family')}
        >
          <div className="family-card-inner">
            <span className="family-card-title">Family</span>
            <span className="family-card-sub">今日冒险</span>
          </div>
        </button>
        {packs.map((pack) => (
          <button
            key={pack.id}
            className="theme-card"
            type="button"
            aria-label={pack.title}
            onClick={() => navigate(`/map/${pack.id}`)}
          >
            <img
              src={assetUrl(pack.homeImage || pack.mapImage)}
              alt=""
            />
          </button>
        ))}
      </div>
    </div>
  )
}
