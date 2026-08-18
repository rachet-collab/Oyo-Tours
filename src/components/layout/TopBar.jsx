import { Link, useLocation } from 'react-router-dom'
import Icon from '../ui/Icon.jsx'

const cx = (...c) => c.filter(Boolean).join(' ')

// Human labels for known route segments. Anything not here is treated as an
// entity id and rendered using the page's `title`.
const SEG_LABEL = {
  packages: 'Packages', inventory: 'Inventory', bookings: 'Bookings', finance: 'Finance',
  operations: 'Operations', vendors: 'Vendors', guests: 'Guests', settings: 'Settings',
  airlines: 'Airlines', overview: 'Overview', reports: 'Reports', checkout: 'Checkout',
  flights: 'Flights', hotels: 'Hotels', 'bulk-upload': 'Bulk upload', new: 'New', edit: 'Edit',
}
const isEntity = (seg) => !SEG_LABEL[seg]

// The page header: a clickable breadcrumb trail of the flow the user is in,
// then the page title/subtitle and any page-level actions. The global utility
// bar (notifications, team, user) lives once in AppLayout, above this.
export default function TopBar({ title, subtitle, actions, crumbLabel, tabs }) {
  const { pathname } = useLocation()
  const segs = pathname.split('/').filter(Boolean)

  // Build the trail: Home → each mapped segment (clickable) → current page.
  const trail = [{ label: 'Home', to: '/' }]
  segs.forEach((seg, i) => {
    if (isEntity(seg)) return // ids get folded into the current-page crumb
    trail.push({ label: SEG_LABEL[seg], to: '/' + segs.slice(0, i + 1).join('/') })
  })
  // Current crumb = an explicit label, the string title, or the last mapped seg.
  const currentLabel = crumbLabel || (typeof title === 'string' ? title : null)
  const crumbs = currentLabel
    ? [...trail.slice(0, -1), { label: currentLabel, to: null }]
    : trail.map((c, i) => (i === trail.length - 1 ? { ...c, to: null } : c))

  return (
    <div className="border-b bg-background px-4 py-4 sm:px-6 lg:px-8">
      {/* Title + actions come first */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">{actions}</div>}
      </div>

      {/* Breadcrumb flow — sits below the heading & subheading */}
      <nav aria-label="Breadcrumb" className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/50">·</span>}
              {c.to && !last ? (
                <Link to={c.to} className="font-medium text-muted-foreground transition-colors hover:text-foreground">{c.label}</Link>
              ) : (
                <span className={cx('font-semibold', last ? 'text-foreground' : 'text-muted-foreground')}>{c.label}</span>
              )}
            </span>
          )
        })}
      </nav>

      {/* Optional tab / filter strip (e.g. Active/Inactive, All/Pending/Approved). */}
      {tabs && <div className="mt-3">{tabs}</div>}
    </div>
  )
}
