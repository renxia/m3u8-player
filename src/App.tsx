import { Navigate, Route, Routes } from 'react-router'
import { Toaster } from 'sonner'
import Layout from './components/Layout'
import { useTheme } from './hooks/useTheme'
import AboutPage from './pages/AboutPage'
import DownloadPage from './pages/DownloadPage'
import FeedbackPage from './pages/FeedbackPage'
import HomePage from './pages/HomePage'
import SettingsPage from './pages/SettingsPage'

function App() {
  const { resolvedTheme } = useTheme()

  return (
    <>
      <Toaster
        position="top-center"
        theme={resolvedTheme}
        toastOptions={{
          style: {
            background: resolvedTheme === 'dark' ? '#1e293b' : '#ffffff',
            color: resolvedTheme === 'dark' ? '#f1f5f9' : '#0f172a',
            border: resolvedTheme === 'dark' ? '1px solid #334155' : '1px solid #e2e8f0',
          },
        }}
      />
      <Routes>
        {['/', '/en', '/ja-JP'].map((langPath) => (
          <Route key={langPath} path={langPath} element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="download" element={<DownloadPage />} />
            <Route path="feedback" element={<FeedbackPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        ))}

        {/* 兼容旧的 .html 路由 */}
        <Route path="/index.html" element={<Navigate to="/" replace />} />
        <Route path="/about.html" element={<Navigate to="/about" replace />} />
        <Route path="/download.html" element={<Navigate to="/download" replace />} />
        <Route path="/feedback.html" element={<Navigate to="/feedback" replace />} />

        {/* 404 重定向 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
