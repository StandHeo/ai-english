import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { loadProgress } from './progress/store'
import type { ProgressState } from './types'
import { useAndroidBackNavigation } from './navigation/useAndroidBackNavigation'
import { HomePage } from './pages/HomePage'
import { MapPage } from './pages/MapPage'
import { LevelPage } from './pages/LevelPage'
import { StickersPage } from './pages/StickersPage'
import { ParentPage } from './pages/ParentPage'
import { FamilyStudioPage } from './pages/FamilyStudioPage'
import { FamilyStudioSettingsPage } from './pages/FamilyStudioSettingsPage'
import { FamilyCalendarPage } from './pages/FamilyCalendarPage'
import { FamilyDayPackPage } from './pages/FamilyDayPackPage'
import { FamilyLevelPage } from './pages/FamilyLevelPage'
import './App.css'

function AppRoutes() {
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress())
  useAndroidBackNavigation()

  return (
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
      <Route path="/family" element={<FamilyCalendarPage />} />
      <Route path="/family/studio" element={<FamilyStudioPage />} />
      <Route path="/family/studio/settings" element={<FamilyStudioSettingsPage />} />
      <Route path="/family/:date" element={<FamilyDayPackPage />} />
      <Route
        path="/family/:date/play/:levelId"
        element={<FamilyLevelPage onProgress={setProgress} />}
      />
      <Route
        path="/family/:date/play"
        element={<FamilyLevelPage onProgress={setProgress} />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <div className="app-shell">
      <AppRoutes />
    </div>
  )
}
