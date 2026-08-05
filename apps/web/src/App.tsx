import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { loadProgress } from './progress/store'
import type { ProgressState } from './types'
import { HomePage } from './pages/HomePage'
import { MapPage } from './pages/MapPage'
import { LevelPage } from './pages/LevelPage'
import { StickersPage } from './pages/StickersPage'
import { ParentPage } from './pages/ParentPage'
import './App.css'

export default function App() {
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress())

  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/map/:packId" element={<MapPage progress={progress} />} />
        <Route
          path="/level/:levelId"
          element={<LevelPage progress={progress} onProgress={setProgress} />}
        />
        <Route path="/stickers" element={<StickersPage progress={progress} />} />
        <Route
          path="/parent"
          element={<ParentPage progress={progress} onProgress={setProgress} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
