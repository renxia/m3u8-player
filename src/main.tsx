// import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import { StorageKeys, storage } from './lib/storage'
import './i18n'
import './lib/cdn'
import './index.css'
import { initStats } from './utils/init-stats'

// 初始化主题，避免闪烁
function initTheme() {
  const stored = (storage.get<'light' | 'dark' | 'system'>(StorageKeys.theme) || 'system') as 'light' | 'dark' | 'system'
  let theme: 'light' | 'dark'

  if (stored === 'system') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } else {
    theme = stored
  }

  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

initStats()
// 在渲染前初始化主题
initTheme()

createRoot(document.getElementById('app')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
  // <StrictMode>
  // </StrictMode>,
)
