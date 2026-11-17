import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'

const ShadowingRoutes = lazy(() => import('./features/shadowing'))
const RecordsPage = lazy(() => import('./pages/RecordsPage'))
const VocabPage = lazy(() => import('./pages/VocabPage'))
const DialoguePage = lazy(() => import('./pages/DialoguePage'))
const EffectsLab = lazy(() => import('./effects/EffectsLab'))

function Loading() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
      <div className="dream-backdrop" />
      <p className="dream-title" style={{ fontSize: 28 }}>
        loading the dream…
      </p>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/shadowing/*" element={<ShadowingRoutes />} />
          <Route path="/records/*" element={<RecordsPage />} />
          <Route path="/vocab" element={<VocabPage />} />
          <Route path="/dialogue" element={<DialoguePage />} />
          <Route path="/lab/effects" element={<EffectsLab />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
