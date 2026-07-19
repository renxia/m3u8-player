import { Outlet } from 'react-router'
import { useSeo } from '@/hooks/useSeo'
import { useViewMode } from '@/hooks/useViewMode'
import Footer from './Footer'
import Header from './Header'

export default function Layout() {
  // mode=embed 时仅显示播放器主体；未显式指定 mode 且处于 iframe 中时默认为 embed
  const mode = useViewMode()
  const isEmbed = mode === 'embed'

  // 根据 SEO 考虑，在路由和语言变化时自动更新 meta 信息
  useSeo()

  if (isEmbed) {
    return (
      <div className="min-h-screen flex flex-col layout-bg transition-colors duration-300">
        <main className="flex-1 w-full p-1 sm:p-2">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col layout-bg transition-colors duration-300">
      <Header />
      <main className="flex-1 container mx-auto py-3 md:py-6 px-2 md:px-4 w-full">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
