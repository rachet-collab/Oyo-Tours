import { useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon.jsx'
import { Avatar } from '../ui/primitives.jsx'
import NotificationBell from '../NotificationBell.jsx'
import { useApp } from '../../store/AppStore.jsx'
import { useLayout } from './layout-context.js'

const ROLE_LABEL = { admin: 'Admin', operations: 'Operations', sales: 'Sales' }

// The global utility bar — one per app, no page text. Holds the date,
// notifications, a team shortcut, and the signed-in user with a logout action.
export default function AppTopBar() {
  const { user, logout } = useApp()
  const { openNav } = useLayout()
  const navigate = useNavigate()
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const isAdmin = user?.role === 'admin'
  const signOut = async () => { await logout(); navigate('/login') }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-x-3 border-b bg-background/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      {/* Left: mobile menu toggle (title text intentionally lives below, per page) */}
      <button
        type="button"
        onClick={openNav}
        className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
        aria-label="Open menu"
      >
        <Icon name="menu" size={20} />
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-2 rounded-xl border bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground sm:flex">
          <Icon name="calendar" size={15} className="text-primary" />
          <span className="tabular-nums">{today}</span>
        </div>

        <NotificationBell />

        {/* Team shortcut */}
        {isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/settings')}
            aria-label="Team"
            title="Team"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon name="userGroup" size={18} />
          </button>
        )}

        {/* User + logout */}
        <div className="flex items-center gap-2 rounded-xl border bg-card py-1 pl-1 pr-1.5">
          <Avatar name={user?.name} size={28} />
          <div className="hidden min-w-0 leading-tight sm:block">
            <p className="truncate text-[13px] font-semibold">{user?.name}</p>
            <p className="text-[11px] text-muted-foreground">{ROLE_LABEL[user?.role] || 'Sales'}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            aria-label="Log out"
            title="Log out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </div>
    </header>
  )
}
