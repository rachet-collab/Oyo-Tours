import { useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import { LayoutContext } from './layout-context.js'
import { useApp } from '../../store/AppStore.jsx'

export default function AppLayout() {
  const { user } = useApp()
  const [navOpen, setNavOpen] = useState(false)

  if (!user) return <Navigate to="/login" replace />

  return (
    <LayoutContext.Provider value={{ openNav: () => setNavOpen(true) }}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <Sidebar className="hidden lg:flex" />

        {/* Mobile drawer */}
        {navOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setNavOpen(false)}
              aria-hidden="true"
            />
            <Sidebar
              className="absolute inset-y-0 left-0 flex w-64 shadow-xl"
              onNavigate={() => setNavOpen(false)}
              onClose={() => setNavOpen(false)}
            />
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </LayoutContext.Provider>
  )
}
