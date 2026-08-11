import { useState, lazy, Suspense } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import CityCover from '../components/ui/CityCover.jsx'
import {
  Button,
  Card,
  Eyebrow,
  FilterTabs,
  Input,
  Pill,
  Select,
  EmptyState,
} from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { inr } from '../lib/format.js'
import { downloadPackageQuote } from '../lib/packageQuote.js'
// Bulk-upload modal pulls in XLSX — load it only when actually opened so the
// Packages landing page stays lightweight.
const PackageImport = lazy(() => import('./PackageImport.jsx'))

const cx = (...c) => c.filter(Boolean).join(' ')
const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Package code with a copy-to-clipboard button (used inside the card Link).
function CopyCode({ code }) {
  const [copied, setCopied] = useState(false)
  const copy = (e) => {
    e.preventDefault(); e.stopPropagation()
    navigator.clipboard?.writeText(code)
    setCopied(true); setTimeout(() => setCopied(false), 1200)
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1">
      <span className="font-mono text-[11px] font-medium text-muted-foreground">{code}</span>
      <button type="button" onClick={copy} aria-label={`Copy ${code}`} title="Copy code"
        className={cx('flex h-5 w-5 items-center justify-center rounded-md transition-colors', copied ? 'text-status-won' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
        <Icon name={copied ? 'check' : 'copy'} size={12} />
      </button>
    </span>
  )
}
const monthLabel = (key) => {
  const [y, m] = key.split('-')
  return `${MONTHS_ABBR[+m - 1]} ${y}`
}

export default function Packages() {
  const { packages, fromPrice, pkgSeats, user, departuresForPackage, hydrated } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [origin, setOrigin] = useState('')
  const [destCity, setDestCity] = useState('')
  const [month, setMonth] = useState('')
  const [life, setLife] = useState('active') // admin lifecycle filter
  const [importOpen, setImportOpen] = useState(false)
  const role = user?.role
  const isAdmin = role === 'admin'
  const isSales = role === 'sales' // sales gets the explore/book storefront
  // Operations gets the management view (all packages incl. inactive) but read-only.
  const isActive = (p) => p.active !== false

  const origins = [...new Set(packages.map((p) => p.origin).filter(Boolean))].sort()
  const destCities = [...new Set(packages.map((p) => p.destinationCity).filter(Boolean))].sort()
  // Distinct departure months (YYYY-MM) across all packages, chronological.
  const months = [
    ...new Set(packages.flatMap((p) => departuresForPackage(p.id).map((d) => d.date.slice(0, 7)))),
  ].sort()
  const hasFilters = query || origin || destCity || month

  const filtered = packages.filter((p) => {
    const q = query.toLowerCase()
    const mq = !q || p.name.toLowerCase().includes(q) || p.destinationCity.toLowerCase().includes(q) || p.origin.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q)
    const mo = !origin || p.origin === origin
    const mc = !destCity || p.destinationCity === destCity
    const mm = !month || departuresForPackage(p.id).some((d) => d.date.slice(0, 7) === month)
    // Sales only ever see active packages; admin & operations can filter Active/Inactive/All.
    const ml = isSales ? isActive(p) : (life === 'all' ? true : life === 'active' ? isActive(p) : !isActive(p))
    return mq && mo && mc && mm && ml
  })

  return (
    <>
      <TopBar
        title={isSales ? 'Explore packages' : 'Packages'}
        subtitle={
          isSales
            ? 'Browse our fixed-departure holidays, pick your offering and book your seats.'
            : 'Fixed-departure tour products with flight inventory and pricing.'
        }
      />

      {!isSales && (
        <div className="px-4 pt-4 sm:px-6 lg:px-8">
          <FilterTabs
            value={life}
            onChange={setLife}
            tabs={[
              { key: 'active', label: 'Active', count: packages.filter(isActive).length, tone: 'won' },
              { key: 'inactive', label: 'Inactive', count: packages.filter((p) => !isActive(p)).length, tone: 'neutral' },
            ]}
          />
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-6 lg:px-8">
        <div className="relative">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="w-48 pl-9" />
        </div>
        <div className="w-48">
          <Select value={origin} onChange={(e) => setOrigin(e.target.value)}>
            <option value="">All departure cities</option>
            {origins.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        </div>
        <div className="w-48">
          <Select value={destCity} onChange={(e) => setDestCity(e.target.value)}>
            <option value="">All destination cities</option>
            {destCities.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div className="w-48">
          <Select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">All departure months</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </Select>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setOrigin(''); setDestCity(''); setMonth('') }}>
            Clear
          </Button>
        )}
        {isAdmin && (
          <Button variant="outline" icon="upload" className="ml-auto" onClick={() => setImportOpen(true)}>
            Bulk upload
          </Button>
        )}
        {isAdmin && (
          <Button icon="plus" onClick={() => navigate('/packages/new')}>
            Add package
          </Button>
        )}
      </div>

      {/* Still loading from the backend — show skeletons instead of an empty state */}
      {!hydrated && packages.length === 0 && (
        <div className="grid grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <div className="h-44 animate-pulse bg-muted" />
              <div className="space-y-3 p-5">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="mt-4 flex justify-between border-t pt-3">
                  <div className="h-6 w-20 animate-pulse rounded bg-muted" />
                  <div className="h-6 w-24 animate-pulse rounded bg-muted" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {hydrated && filtered.length === 0 && (
        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <Card><EmptyState icon="search" title={packages.length === 0 ? 'No packages yet' : 'No packages match'} hint={packages.length === 0 ? 'Create your first package to get started.' : 'Try clearing a filter.'} /></Card>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => {
          const seats = pkgSeats(p)
          const booked = Math.max(0, seats.total - seats.avail)
          const from = fromPrice(p)
          return (
            <Link key={p.id} to={`/packages/${p.id}`} className="group block">
              <Card className="relative overflow-hidden transition-shadow group-hover:shadow-md">
                <CityCover
                  url={p.coverUrl}
                  city={p.destinationCity}
                  focal={p.coverFocal}
                  className="h-44"
                  overlayLabel={
                    <>
                      <div>
                        <p className="text-xs font-semibold text-white/85">
                          {p.origin}
                        </p>
                        <p className="text-lg font-bold text-white drop-shadow-sm">
                          {p.destinationCity}
                        </p>
                      </div>
                      <span className="rounded-lg bg-white/90 px-2 py-1 text-xs font-bold text-foreground">
                        {p.durationLabel}
                      </span>
                    </>
                  }
                />
                <div className="p-5">
                  <div className="flex items-center gap-1.5">
                    {p.categories.map((c) => (
                      <Pill
                        key={c}
                        tone={c === 'Super Deluxe' ? 'proposal' : 'neutral'}
                      >
                        {c}
                      </Pill>
                    ))}
                    {!isActive(p) && <Pill tone="urgent">Inactive</Pill>}
                    {p.code && <CopyCode code={p.code} />}
                  </div>
                  <h3 className="mt-2.5 text-base font-bold leading-tight">
                    {p.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {p.destinationsLabel}
                  </p>

                  <div className="mt-4 flex items-end justify-between border-t pt-3">
                    <div>
                      <Eyebrow>From</Eyebrow>
                      <p className="text-lg font-bold leading-none">
                        {from ? inr(from) : '—'}
                        <span className="text-xs font-medium text-muted-foreground">
                          {' '}
                          /adult
                        </span>
                      </p>
                    </div>
                    <div className="text-right">
                      <Eyebrow>{seats.departures} departures</Eyebrow>
                      <div className="mt-1.5 flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${seats.total ? Math.min(100, (booked / seats.total) * 100) : 0}%` }} />
                        </div>
                        <span className="text-xs font-semibold tabular-nums">{booked}/{seats.total}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      {importOpen && (
        <Suspense fallback={null}>
          <PackageImport open={importOpen} onClose={() => setImportOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
