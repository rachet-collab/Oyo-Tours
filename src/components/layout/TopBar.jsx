import Icon from '../ui/Icon.jsx'
import { useLayout } from './layout-context.js'

// The signed-in user, settings and logout live in the sidebar, so the top bar
// only carries the page title/subtitle and any page-level action buttons.
export default function TopBar({ title, subtitle, actions }) {
  const { openNav } = useLayout()
  // The whole product revolves around dates, so surface today's date up top.
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-x-4 border-b bg-background/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {/* Mobile menu button */}
        <button
          type="button"
          onClick={openNav}
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden"
          aria-label="Open menu"
        >
          <Icon name="menu" size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold leading-tight tracking-tight sm:text-lg">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 hidden truncate text-xs text-muted-foreground lg:block">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:gap-4">
        <div className="hidden items-center gap-2 rounded-xl border bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground sm:flex">
          <Icon name="calendar" size={15} className="text-primary" />
          <span className="tabular-nums">{today}</span>
        </div>
        {actions && <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">{actions}</div>}
      </div>
    </header>
  )
}
