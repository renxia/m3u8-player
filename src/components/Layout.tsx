import { Outlet, useSearchParams } from 'react-router'
import { useSeo } from '@/hooks/useSeo'
import Footer from './Footer'
import Header from './Header'

export default function Layout() {
  const [searchParams] = useSearchParams()
  const showHeader = searchParams.get('showHeader') !== '0'

  // 根据 SEO 考虑，在路由和语言变化时自动更新 meta 信息
  useSeo()

  return (
    <div className="min-h-screen flex flex-col layout-bg transition-colors duration-300">
      {showHeader && <Header />}
      <main className="flex-1 container mx-auto py-3 md:py-6 px-2 md:px-4 w-full">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
