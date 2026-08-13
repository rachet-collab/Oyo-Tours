import { NavLink, useNavigate } from 'react-router-dom'
import Icon from '../ui/Icon.jsx'
import { Avatar } from '../ui/primitives.jsx'
import { useApp } from '../../store/AppStore.jsx'
import oyoLogo from '../../assets/oyo-logo.png'
// Duotone nav icons (recolored to currentColor so they take the nav text color).
import icInventory from '../../assets/nav/inventory.svg?raw'
import icFinance from '../../assets/nav/finance.svg?raw'
import icOperations from '../../assets/nav/operations.svg?raw'
import icPackages from '../../assets/nav/packages.svg?raw'
import icBookings from '../../assets/nav/bookings.svg?raw'

const cx = (...c) => c.filter(Boolean).join(' ')

const ROLE_LABEL = { admin: 'Admin', operations: 'Operations', sales: 'Sales' }

// Nav per role. Admin sees everything; Operations runs the back office;
// Sales gets the storefront + bookings.
const NAV = {
  admin: [
    { to: '/packages', label: 'Packages', svg: icPackages },
    { to: '/inventory', label: 'Inventory', svg: icInventory },
    { to: '/operations', label: 'Operations', svg: icOperations },
    { to: '/bookings', label: 'Bookings', svg: icBookings },
    { to: '/finance', label: 'Finance', svg: icFinance },
  ],
  operations: [
    { to: '/packages', label: 'Packages', svg: icPackages },
    { to: '/inventory', label: 'Inventory', svg: icInventory },
    { to: '/operations', label: 'Operations', svg: icOperations },
    { to: '/bookings', label: 'Bookings', svg: icBookings },
    { to: '/finance', label: 'Finance', svg: icFinance },
  ],
  sales: [
    { to: '/packages', label: 'Explore', svg: icPackages },
    { to: '/bookings', label: 'My bookings', svg: icBookings },
  ],
}

// Renders a raw duotone SVG string, sized and inheriting the current text color.
function NavIcon({ svg, active }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-flex shrink-0 [&_svg]:h-[18px] [&_svg]:w-[18px]', active ? 'text-primary' : 'text-current')}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function NavItem({ item, onNavigate }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-secondary text-secondary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {item.svg ? <NavIcon svg={item.svg} active={isActive} /> : <Icon name={item.icon} size={18} className={isActive ? 'text-primary' : ''} />}
          {item.label}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ className = '', onNavigate, onClose }) {
  const { user, logout: signOut } = useApp()
  const navigate = useNavigate()
  const items = NAV[user?.role] || NAV.sales
  const logout = async () => { await signOut(); navigate('/login') }

  return (
    <aside className={cx('w-64 shrink-0 flex-col border-r bg-card', className)}>
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-5">
        <img src={oyoLogo} alt="OYO" className="h-9 w-auto" />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Close menu"
          >
            <Icon name="x" size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Workspace
        </p>
        {items.map((item) => (
          <NavItem key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      {/* Footer — signed-in user + settings / logout */}
      <div className="shrink-0 border-t p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <Avatar name={user?.name} size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABEL[user?.role] || 'Sales'}</p>
          </div>
          {user?.role === 'admin' && (
            <button type="button" onClick={() => { navigate('/settings'); onNavigate?.() }} aria-label="Settings"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
              <Icon name="settings" size={18} />
            </button>
          )}
          <button type="button" onClick={logout} aria-label="Log out"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
            <Icon name="logout" size={18} />
          </button>
        </div>
        {/* Build stamp — lets you confirm which build is actually live. */}
        <p className="px-2 pt-1.5 text-[10px] text-muted-foreground/70">build {typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev'} UTC</p>
      </div>
    </aside>
  )
}
