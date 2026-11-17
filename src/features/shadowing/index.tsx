// 跟读 (shadowing) feature: nested routes under /shadowing/*.
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import LessonPicker from './LessonPicker'
import ResultPage from './ResultPage'

// The camera session pulls in the effects engine; load it only when a session starts.
const SessionPage = lazy(() => import('./SessionPage'))

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

export default function ShadowingRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route index element={<LessonPicker />} />
        <Route path="session/:lessonId" element={<SessionPage />} />
        <Route path="result/:sessionId" element={<ResultPage />} />
        <Route path="*" element={<Navigate to="/shadowing" replace />} />
      </Routes>
    </Suspense>
  )
}
