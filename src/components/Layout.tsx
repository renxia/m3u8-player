import { Outlet } from 'react-router'
import Footer from './Footer'
import Header from './Header'

export default function Layout() {
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
