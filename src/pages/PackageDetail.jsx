import { useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import CityCover from '../components/ui/CityCover.jsx'
import InventoryImage from '../components/InventoryImage.jsx'
import {
  Button,
  Card,
  Eyebrow,
  Field,
  Input,
  Modal,
  Pill,
  Select,
  SeatMeter,
  StatusPill,
} from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { OCCUPANCY, DEFAULT_TERMS } from '../store/data.js'
import { inr, shortDate } from '../lib/format.js'
import { downloadPackageQuote } from '../lib/packageQuote.js'

const cx = (...c) => c.filter(Boolean).join(' ')
const ADMIN_TABS = ['Itinerary', 'Departures', 'Pricing', 'Hotels', 'Inclusions', 'Add-ons', 'Policy', 'Terms']
// Guests get an exploration-first experience — no raw flight/seat/pricing tables.
const GUEST_TABS = ['Itinerary', 'Departures', 'Hotels', 'Inclusions', 'Policy', 'Terms']

export default function PackageDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, packageById, departuresForPackage, bookableDeparturesForPackage, available, addDeparture, updatePackage, deletePackage, bookings, cancelBooking } =
    useApp()
  const pkg = packageById(id)
  const isAdmin = user?.role === 'admin'
  // Operations sees the full management detail (all tabs) but read-only — edit,
  // delete, change-status and departure editing stay admin-only via isAdmin.
  const canViewFull = user?.role === 'admin' || user?.role === 'operations'
  const TABS = canViewFull ? ADMIN_TABS : GUEST_TABS
  const [tab, setTab] = useState(TABS[0])
  const [addOpen, setAddOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [delOpen, setDelOpen] = useState(false)

  // Admin/operations see every travel date for management; guests see only
  // bookable ones (dates whose flight block is Inactive are hidden from booking).
  const departures = canViewFull ? departuresForPackage(id) : bookableDeparturesForPackage(id)

  if (!pkg) {
    return (
      <>
        <TopBar title="Package not found" />
        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <Link to="/packages" className="text-sm font-semibold text-primary">
            ← Back to packages
          </Link>
        </div>
      </>
    )
  }

  const seats = {
    total: departures.reduce((s, d) => s + d.seatsTotal, 0),
    avail: departures.reduce((s, d) => s + available(d), 0),
  }

  // Active (non-cancelled) bookings block a straight deactivation.
  const activeBookings = bookings.filter((x) => x.packageId === pkg.id && x.status !== 'Cancelled')
  const pkgBookings = bookings.filter((x) => x.packageId === pkg.id)
  // Booked = total − available, from the same departure-level counters the
  // Packages list card uses, so the progress bar matches in both places.
  const seatsBooked = Math.max(0, seats.total - seats.avail)
  // Starting (lowest per-adult) price across all departures & categories.
  const adultPrices = departures.flatMap((d) => Object.values(d.pricing || {}).map((g) => g?.adult).filter((n) => n > 0))
  const startingFrom = adultPrices.length ? Math.min(...adultPrices) : 0
  const isActive = pkg.active !== false
  // Confirm handler for the change-status modal: activate, or deactivate
  // (cancelling any live bookings first, which releases their seats).
  const confirmStatusChange = () => {
    if (!isActive) { updatePackage(pkg.id, { active: true }); setStatusOpen(false); return }
    activeBookings.forEach((x) => cancelBooking(x.id, 'operator', 'Package deactivated'))
    updatePackage(pkg.id, { active: false })
    setStatusOpen(false)
  }

  return (
    <>
      <TopBar
        title={
          <span className="flex items-center gap-2">
            <Link
              to="/packages"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Packages
            </Link>
            <Icon name="chevronRight" size={16} className="text-muted-foreground" />
            <span>{pkg.destinationCity}</span>
          </span>
        }
        subtitle={`${pkg.code ? pkg.code + ' · ' : ''}${pkg.name} · ${pkg.origin}`}
      />

      <div className="grid gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {pkg.active === false && (
          <Card className="flex items-center gap-3 border-status-urgent/30 bg-status-urgent-bg/40 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-urgent-bg text-status-urgent"><Icon name="x" size={18} /></span>
            <div>
              <p className="text-sm font-bold">This package is inactive</p>
              <p className="text-xs text-muted-foreground">Hidden from Explore and closed for new bookings. Reactivate it to sell again.</p>
            </div>
          </Card>
        )}
        {/* Hero */}
        <Card className="overflow-hidden">
          <CityCover
            url={pkg.coverUrl}
            city={pkg.destinationCity}
            focal={pkg.coverFocal}
            rounded="rounded-t-2xl"
            className="h-80"
            overlayLabel={
              <>
                <div>
                  <p className="text-sm font-semibold text-white/85">
                    {pkg.origin} · {pkg.durationLabel}
                  </p>
                  <p className="text-2xl font-bold text-white drop-shadow">
                    {pkg.name}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {pkg.categories.map((c) => (
                    <span
                      key={c}
                      className="rounded-lg bg-white/90 px-2 py-1 text-xs font-bold text-foreground"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </>
            }
          />
          {/* Identity strip — reference facts grouped, with lifecycle status */}
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <MetaItem label="Package ID" value={pkg.code || '—'} mono />
              <span className="hidden h-8 w-px bg-border sm:block" />
              <MetaItem label="Duration" value={pkg.durationLabel} />
              <span className="hidden h-8 w-px bg-border sm:block" />
              <MetaItem label="Route" value={pkg.destinationsLabel} />
            </div>
            <div className="flex items-center gap-3">
              <Pill tone={isActive ? 'won' : 'neutral'} dot>{isActive ? 'Active' : 'Inactive'}</Pill>
              {isAdmin && (
                <button type="button" onClick={() => setStatusOpen(true)}
                  className="text-[13px] font-semibold text-primary transition-colors hover:underline">
                  Change status
                </button>
              )}
            </div>
          </div>

          {/* Primary band — price paired with the actions it drives */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t bg-muted/25 px-5 py-4">
            <div>
              <Eyebrow>Starting from</Eyebrow>
              <p className="mt-1 text-2xl font-bold leading-none tabular-nums">
                {startingFrom ? inr(startingFrom) : 'On request'}
                {startingFrom ? <span className="ml-1 text-xs font-medium text-muted-foreground">/ adult</span> : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isAdmin && (
                <Button variant="outline" icon="edit" onClick={() => navigate(`/packages/${pkg.id}/edit`)}>Edit</Button>
              )}
              {isAdmin && !isActive && (
                <Button variant="danger" icon="x" onClick={() => setDelOpen(true)}>Delete</Button>
              )}
              <Button variant="outline" icon="download" onClick={() => downloadPackageQuote(pkg, departures)}>Download</Button>
              <Button icon="plus" disabled={pkg.active === false} onClick={() => navigate(`/checkout?package=${pkg.id}`)}>Book this package</Button>
            </div>
          </div>

        </Card>

        {/* Seats booked — its own block */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Eyebrow>Seats booked ({pkgBookings.length} booking{pkgBookings.length === 1 ? '' : 's'})</Eyebrow>
            <div className="flex items-center gap-4">
              <span className="text-sm font-bold tabular-nums">{seatsBooked} / {seats.total}</span>
              <Button variant="outline" onClick={() => navigate(`/bookings?package=${pkg.id}`)}>
                View bookings <Icon name="arrowRight" size={16} />
              </Button>
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${seats.total ? Math.min(100, (seatsBooked / seats.total) * 100) : 0}%` }} />
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cx(
                'rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors',
                tab === t
                  ? 'bg-secondary text-secondary-foreground'
                  : 'border bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {(tab === 'Departures' || tab === 'Departure dates') && (
          <DeparturesTab pkg={pkg} departures={departures} available={available} isAdmin={isAdmin} />
        )}
        {tab === 'Pricing' && <PricingTab pkg={pkg} departures={departures} />}
        {tab === 'Hotels' && <HotelsTab pkg={pkg} />}
        {tab === 'Itinerary' && <ItineraryTab pkg={pkg} departures={departures} available={available} />}
        {tab === 'Inclusions' && <InclusionsTab pkg={pkg} />}
        {tab === 'Add-ons' && <AddOnsTab pkg={pkg} />}
        {tab === 'Policy' && <PolicyTab pkg={pkg} />}
        {tab === 'Terms' && <TermsTab pkg={pkg} />}
      </div>

      <AddDepartureModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        pkg={pkg}
        onAdd={addDeparture}
      />

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={isActive ? 'Deactivate this package?' : 'Reactivate this package?'}
        subtitle={`${pkg.name} · ${pkg.origin}`}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStatusOpen(false)}>Cancel</Button>
            {isActive ? (
              <Button variant="danger" icon="x" onClick={confirmStatusChange}>
                {activeBookings.length > 0
                  ? `Cancel ${activeBookings.length} booking${activeBookings.length > 1 ? 's' : ''} & deactivate`
                  : 'Deactivate package'}
              </Button>
            ) : (
              <Button icon="check" onClick={confirmStatusChange}>Activate package</Button>
            )}
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            isActive ? 'bg-status-urgent-bg text-status-urgent' : 'bg-status-won-bg text-status-won')}>
            <Icon name={isActive ? 'clock' : 'check'} size={18} />
          </span>
          <div className="text-sm">
            <p className="font-semibold">
              You're changing this package from{' '}
              <span className={isActive ? 'text-status-won' : 'text-muted-foreground'}>{isActive ? 'Active' : 'Inactive'}</span>
              {' → '}
              <span className={isActive ? 'text-muted-foreground' : 'text-status-won'}>{isActive ? 'Inactive' : 'Active'}</span>.
            </p>
            {isActive ? (
              <>
                <p className="mt-1 text-muted-foreground">
                  Deactivating hides it from Explore and closes it to new bookings.
                  {activeBookings.length > 0
                    ? ` It has ${activeBookings.length} live booking${activeBookings.length > 1 ? 's' : ''} — confirming cancels ${activeBookings.length > 1 ? 'them' : 'it'} and releases the held seats back to inventory. This can't be undone.`
                    : ' You can reactivate it again anytime.'}
                </p>
                {activeBookings.length > 0 && (
                  <ul className="mt-3 grid gap-1">
                    {activeBookings.slice(0, 6).map((x) => (
                      <li key={x.id} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs">
                        <span className="font-mono font-semibold">{x.ref}</span>
                        <StatusPill status={x.status} />
                      </li>
                    ))}
                    {activeBookings.length > 6 && <li className="text-xs text-muted-foreground">…and {activeBookings.length - 6} more.</li>}
                  </ul>
                )}
              </>
            ) : (
              <p className="mt-1 text-muted-foreground">
                Reactivating lists it on Explore again and reopens it for new bookings.
              </p>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Delete this package?"
        subtitle={`${pkg.name} · ${pkg.origin}`}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDelOpen(false)}>Keep</Button>
            <Button variant="danger" icon="x" onClick={() => { deletePackage(pkg.id); navigate('/packages') }}>Delete package</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-urgent-bg text-status-urgent"><Icon name="x" size={18} /></span>
          <p className="text-sm text-muted-foreground">
            This permanently removes <span className="font-semibold text-foreground">{pkg.name}</span> and its {departures.length} departure{departures.length === 1 ? '' : 's'} from the portal. Only inactive packages can be deleted — this can’t be undone.
          </p>
        </div>
      </Modal>

    </>
  )
}

function MetaItem({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <p className={cx('mt-0.5 truncate text-sm font-bold leading-tight', mono && 'font-mono')}>{value}</p>
    </div>
  )
}

/* ------------------------------------------------- helpers / overview --- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CAT_STAR = {
  Deluxe: 'Deluxe (3-Star)',
  'Super Deluxe': 'Super Deluxe (4-Star)',
  Standard: 'Standard (4-Star)',
}

function groupByMonth(departures) {
  const sorted = [...departures].sort((a, b) => a.date.localeCompare(b.date))
  const map = new Map()
  sorted.forEach((d) => {
    const [y, m, day] = d.date.split('-')
    const key = `${MONTHS[+m - 1]} ${y}`
    if (!map.has(key)) map.set(key, [])
    map.get(key).push({ dep: d, day })
  })
  return [...map.entries()].map(([label, items]) => ({ label, items }))
}

function PackageOverview({ pkg, groups }) {
  const travel = groups
    .map((g) => `${g.label.split(' ')[0]}: ${g.items.map((i) => i.day).join(', ')}`)
    .join('    |    ')
  const rows = [
    ['Package Name', `${pkg.name} (${pkg.origin.replace(' ', '-')})`],
    ['Duration', pkg.durationLabel],
    ['Destinations', pkg.destinationsLabel.replace(/·/g, '|')],
    ['Travel Date', travel],
    ['Package Category', pkg.categories.map((c) => CAT_STAR[c] || c).join('    |    ')],
  ]
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4">
        <h2 className="text-base font-bold">Package overview</h2>
      </div>
      <dl className="border-t">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex flex-col gap-1 border-t px-5 py-3 first:border-t-0 sm:flex-row sm:gap-8"
          >
            <dt className="w-44 shrink-0 text-sm font-semibold text-muted-foreground">
              {k}
            </dt>
            <dd className="text-sm font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

// Read-only departure showcase — all travel dates in a single straight line.
function DepartureCalendar({ groups, available }) {
  const items = groups.flatMap((g) => g.items.map((it) => ({ ...it, mon: g.label.split(' ')[0] })))
  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="calendar" size={18} className="text-primary" />
        <h2 className="text-base font-bold">Departure dates</h2>
      </div>
      <p className="text-xs text-muted-foreground">All scheduled travel dates for this package.</p>
      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No departures scheduled yet.</p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {items.map(({ dep, day, mon }) => {
            const left = available(dep)
            const sold = left === 0
            return (
              <div key={dep.id}
                className={cx('flex min-w-[84px] flex-col items-center rounded-xl border px-3 py-2 text-center', sold && 'opacity-55')}>
                <span className="text-lg font-bold leading-none">{day} <span className="text-xs font-semibold text-muted-foreground">{mon}</span></span>
                <span className={cx('mt-1 text-[10px] font-semibold', sold ? 'text-status-urgent' : 'text-status-won')}>
                  {sold ? 'Sold out' : `${left} left`}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function DateSelect({ groups, available, onBook }) {
  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="calendar" size={18} className="text-primary" />
        <h2 className="text-base font-bold">Choose your travel date</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Select a departure date to start your booking.
      </p>
      <div className="mt-4 grid gap-4">
        {groups.map((g) => (
          <div key={g.label}>
            <Eyebrow className="mb-2">{g.label}</Eyebrow>
            <div className="flex flex-wrap gap-2">
              {g.items.map(({ dep, day }) => {
                const left = available(dep)
                const sold = left === 0
                return (
                  <button
                    key={dep.id}
                    disabled={sold}
                    onClick={() => onBook(dep.id)}
                    className={cx(
                      'flex min-w-[72px] flex-col items-center rounded-xl border px-3 py-2 text-center transition-colors',
                      sold
                        ? 'opacity-45'
                        : 'hover:border-primary hover:bg-muted',
                    )}
                  >
                    <span className="text-lg font-bold leading-none">{day}</span>
                    <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.label.split(' ')[0]}
                    </span>
                    <span
                      className={cx(
                        'mt-1 text-[10px] font-semibold',
                        sold ? 'text-status-urgent' : 'text-status-won',
                      )}
                    >
                      {sold ? 'Sold out' : `${left} left`}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------- Departures --- */
function DeparturesTab({ pkg, departures, available, isAdmin }) {
  const groups = groupByMonth(departures)
  return (
    <div className="grid gap-6">
      <DepartureCalendar groups={groups} available={available} />
      {isAdmin && (
      <Card className="overflow-hidden">
        <div className="px-5 py-4">
          <h2 className="text-base font-bold">Flight details per departure</h2>
          <p className="text-xs text-muted-foreground">
            Round-trip flights & seat inventory for each travel date. Manage departures from the Edit page.
          </p>
        </div>
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <th className="px-5 py-2.5 font-semibold">Departure</th>
                <th className="px-3 py-2.5 font-semibold">Outbound</th>
                <th className="px-3 py-2.5 font-semibold">Return</th>
                <th className="px-3 py-2.5 font-semibold">Starting from</th>
                <th className="px-5 py-2.5 font-semibold">Seats</th>
              </tr>
            </thead>
            <tbody>
              {[...departures].sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
                const from = Math.min(
                  ...Object.values(d.pricing).map((g) => g.adult),
                )
                const avail = available(d)
                return (
                  <tr key={d.id} className="border-t hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <p className="font-semibold">{shortDate(d.date)}</p>
                      <p className="text-xs text-muted-foreground">
                        back {shortDate(d.returnDate)}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <FlightCell f={d.outbound} />
                    </td>
                    <td className="px-3 py-3">
                      <FlightCell f={d.inbound} />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold tabular-nums">{inr(from)}</p>
                      <p className="text-xs text-muted-foreground">per adult</p>
                    </td>
                    <td className="px-5 py-3">
                      <SeatMeter available={avail} total={d.seatsTotal} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
      )}
    </div>
  )
}

/* ---------------------------------------------------------- Pricing --- */
function PricingTab({ pkg, departures }) {
  return (
    <div className="grid gap-6">
      {pkg.categories.map((cat) => (
        <Card key={cat} className="overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4">
            <h2 className="text-base font-bold">Pricing — {cat}</h2>
            <Pill tone={cat === 'Super Deluxe' ? 'proposal' : 'neutral'}>
              per person (₹)
            </Pill>
          </div>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold">Departure</th>
                  {OCCUPANCY.map((o) => (
                    <th key={o.key} className="px-3 py-2.5 font-semibold">
                      {o.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {departures.map((d) => {
                  const g = d.pricing[cat]
                  if (!g) return null
                  return (
                    <tr key={d.id} className="border-t hover:bg-muted/40">
                      <td className="px-5 py-3 font-semibold">
                        {shortDate(d.date)}
                      </td>
                      {OCCUPANCY.map((o) => (
                        <td key={o.key} className="px-3 py-3 tabular-nums">
                          {g[o.key] ? inr(g[o.key]) : '—'}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  )
}

function FlightCell({ f }) {
  return (
    <div className="flex items-center gap-2.5">
      <InventoryImage inv={{ type: 'airline', airline: f.airline }} size={28} />
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 font-medium">
          {f.from}
          <Icon name="arrowRight" size={12} className="text-muted-foreground" />
          {f.to}
        </p>
        <p className="text-xs text-muted-foreground">{f.airline} · <span className="font-mono">{f.flightNo}</span></p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Hotels --- */
function HotelsTab({ pkg }) {
  const { inventoryView } = useApp()
  const hotelBlocks = inventoryView.filter((i) => (i.type || 'airline') === 'hotel' && i.packageId === pkg.id)
  // Inventory hotel image keyed by lowercased city.
  const imgByCity = {}
  hotelBlocks.forEach((i) => { const c = String(i.departureCity || '').toLowerCase(); if (i.imageUrl && !imgByCity[c]) imgByCity[c] = i.imageUrl })

  // Category-wise grouping (mirrors the Hotels configuration): each category
  // lists its cities with a small property thumbnail + hotel options.
  const cats = pkg.categories.filter((c) => (pkg.hotels || []).some((h) => h.category === c && (h.rows || []).length))
  if (cats.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">No hotels listed for this package.</Card>
  }

  return (
    <div className="grid gap-4">
      {cats.map((cat) => {
        const rows = ((pkg.hotels || []).find((h) => h.category === cat)?.rows || []).filter((r) => r.city || r.options)
        return (
          <Card key={cat} className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Pill tone={cat === 'Super Deluxe' ? 'proposal' : cat === 'Deluxe' ? 'new' : 'neutral'}>{cat}</Pill>
              <span className="text-xs text-muted-foreground">hotels</span>
            </div>
            <div className="grid gap-2">
              {rows.map((r, i) => {
                const img = imgByCity[String(r.city || '').toLowerCase()]
                return (
                  <div key={i} className="flex items-center gap-3 rounded-xl border p-2.5">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border">
                      {img
                        ? <img src={img} alt={r.city} className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center bg-secondary text-muted-foreground"><Icon name="building" size={18} /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Icon name="mapPin" size={13} className="text-primary" />
                        <p className="text-sm font-bold">{r.city}</p>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">{r.options}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------------- Itinerary --- */
function addDays(iso, n) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function IncludedChip({ icon, label }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-primary">
        <Icon name={icon} size={15} />
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </div>
  )
}

function FlightBlock({ leg, tag }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="plane" size={14} className="text-primary" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Flight · {tag}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-center">
          <p className="text-lg font-bold leading-none text-primary">{leg.from}</p>
        </div>
        <div className="flex-1">
          <div className="flex items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-border" />
            <div className="flex-1 border-t border-dashed border-border" />
            <div className="flex-1 border-t border-dashed border-border" />
            <span className="h-1.5 w-1.5 rounded-full bg-border" />
          </div>
          <p className="mt-1 text-center text-[11px] font-semibold text-muted-foreground">
            {leg.airline} {leg.flightNo}
          </p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold leading-none text-primary">{leg.to}</p>
        </div>
      </div>
    </div>
  )
}

function ItineraryTab({ pkg, departures, available }) {
  const rep = departures?.[0]
  const days = pkg.itinerary || []
  const groups = groupByMonth(departures)
  const hotels = (pkg.destinationsLabel || '').split(/[·|]/).filter((s) => s.trim()).length
  const included = [
    { icon: 'calendar', label: `${days.length}-Day Plan` },
    ...(rep ? [{ icon: 'plane', label: '2 Flights' }] : []),
    ...(hotels ? [{ icon: 'building', label: `${hotels} Hotels` }] : []),
    ...(pkg.transfers?.length ? [{ icon: 'ticket', label: `${pkg.transfers.length} Transfers` }] : []),
    { icon: 'sparkle', label: 'Meals & sightseeing' },
  ]

  return (
    <div className="grid gap-6">
      <Card className="p-5">
        <Eyebrow className="mb-3">Included in this package</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {included.map((c, i) => <IncludedChip key={i} {...c} />)}
        </div>
      </Card>

      <div className="grid gap-6">
        {/* Day cards */}
        <div className="grid gap-4">
          {days.map((it, i) => {
            const isFirst = i === 0
            const isLast = i === days.length - 1
            return (
              <Card key={it.day} className="overflow-hidden">
                <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {it.day}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">Day {it.day}</p>
                    <p className="truncate text-xs text-muted-foreground">{it.title}</p>
                  </div>
                </div>
                <div className="grid gap-3 p-5">
                  {isFirst && rep && <FlightBlock leg={rep.outbound} tag="Arrival" />}
                  <p className="text-sm leading-relaxed text-muted-foreground">{it.desc}</p>
                  {isLast && rep && <FlightBlock leg={rep.inbound} tag="Departure" />}
                </div>
              </Card>
            )
          })}

          {pkg.transfers?.length > 0 && (
            <Card className="p-5">
              <div className="mb-2 flex items-center gap-2">
                <Icon name="ticket" size={16} className="text-primary" />
                <h4 className="text-sm font-bold">Ferry / cruise transfers</h4>
              </div>
              <div className="grid gap-1.5">
                {pkg.transfers.map((t, i) => (
                  <p key={i} className="text-sm">
                    <span className="font-semibold">{t.from} → {t.to}</span>{' '}
                    <span className="text-muted-foreground">· {t.timing}</span>
                  </p>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------- Inclusions --- */
function InclusionsTab({ pkg }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-status-won">
          <Icon name="check" size={18} />
          <h3 className="text-base font-bold text-foreground">Inclusions</h3>
        </div>
        <ul className="grid gap-2">
          {pkg.inclusions.map((x, i) => (
            <li key={i} className="flex gap-2.5 text-sm">
              <Icon name="check" size={16} className="mt-0.5 shrink-0 text-status-won" />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-status-urgent">
          <Icon name="x" size={18} />
          <h3 className="text-base font-bold text-foreground">Exclusions</h3>
        </div>
        <ul className="grid gap-2">
          {pkg.exclusions.map((x, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-muted-foreground">
              <Icon name="x" size={16} className="mt-0.5 shrink-0 text-status-urgent" />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

/* ---------------------------------------------------------- Add-ons --- */
function AddOnsTab({ pkg }) {
  if (!pkg.addOns?.length)
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No optional add-ons listed for this package.
      </Card>
    )
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4">
        <h2 className="text-base font-bold">Supplement cost (optional)</h2>
        <p className="text-xs text-muted-foreground">Per person, chargeable extra</p>
      </div>
      <div className="overflow-x-auto border-t">
        <table className="w-full text-sm">
          <tbody>
            {pkg.addOns.map((a, i) => (
              <tr key={i} className="border-t first:border-t-0 hover:bg-muted/40">
                <td className="px-5 py-2.5">{a.item}</td>
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                  {inr(a.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ----------------------------------------------------------- Policy --- */
function PolicyTab({ pkg }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h3 className="mb-3 text-base font-bold">Payment policy</h3>
        <div className="grid gap-2.5 text-sm">
          <PolicyRow label="Booking amount" value={pkg.payment.bookingAmount} />
          <PolicyRow label="Balance" value={pkg.payment.balance} />
          <PolicyRow
            label="TA commission"
            value={inr(pkg.payment.taCommission) + ' per person'}
          />
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-status-proposal-bg px-4 py-3 text-status-proposal">
          <Icon name="wallet" size={16} className="mt-0.5" />
          <p className="text-[13px] leading-relaxed">
            Payments are collected offline. Update the booking status once
            payment is received.
          </p>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="mb-3 text-base font-bold">Cancellation policy</h3>
        <div className="grid gap-2">
          {pkg.cancellation.map((c, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border p-3">
              <span className="text-sm font-medium">{c.timeline}</span>
              <span className="text-sm font-semibold text-status-urgent">
                {c.penalty}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------ Terms --- */
function TermsTab({ pkg }) {
  const terms = (pkg.terms && pkg.terms.trim()) || DEFAULT_TERMS
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon name="ticket" size={18} className="text-primary" />
        <h3 className="text-base font-bold">Terms &amp; conditions</h3>
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{terms}</p>
    </Card>
  )
}

function PolicyRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{value}</span>
    </div>
  )
}

/* ------------------------------------------------ Add departure modal --- */
const blankFlight = { from: '', to: '', airline: '', flightNo: '' }

function AddDepartureModal({ open, onClose, pkg, onAdd }) {
  const [date, setDate] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [seatsTotal, setSeatsTotal] = useState('')
  const [outbound, setOutbound] = useState({ ...blankFlight })
  const [inbound, setInbound] = useState({ ...blankFlight })
  const [pricing, setPricing] = useState(
    Object.fromEntries(
      pkg.categories.map((c) => [
        c,
        Object.fromEntries(OCCUPANCY.map((o) => [o.key, ''])),
      ]),
    ),
  )

  const setOut = (k) => (e) => setOutbound((f) => ({ ...f, [k]: e.target.value }))
  const setIn = (k) => (e) => setInbound((f) => ({ ...f, [k]: e.target.value }))
  const setPrice = (cat, key) => (e) =>
    setPricing((p) => ({ ...p, [cat]: { ...p[cat], [key]: e.target.value } }))

  const canSave = date && seatsTotal && outbound.flightNo && outbound.from

  const save = () => {
    const pricingNum = Object.fromEntries(
      pkg.categories.map((c) => [
        c,
        Object.fromEntries(
          OCCUPANCY.map((o) => [o.key, Number(pricing[c][o.key]) || 0]),
        ),
      ]),
    )
    onAdd({
      packageId: pkg.id,
      date,
      returnDate: returnDate || date,
      outbound: {
        ...outbound,
        to: outbound.to.toUpperCase(),
        from: outbound.from.toUpperCase(),
        flightNo: outbound.flightNo.toUpperCase(),
      },
      inbound: {
        ...inbound,
        to: inbound.to.toUpperCase(),
        from: inbound.from.toUpperCase(),
        flightNo: inbound.flightNo.toUpperCase(),
      },
      seatsTotal: Number(seatsTotal),
      pricing: pricingNum,
    })
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add departure"
      subtitle={`${pkg.destinationCity} · ${pkg.origin}`}
      width="max-w-3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon="check" disabled={!canSave} onClick={save}>
            Add departure
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Departure date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Return date">
            <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
          </Field>
          <Field label="Total seats" required>
            <Input type="number" min="1" value={seatsTotal} onChange={(e) => setSeatsTotal(e.target.value)} placeholder="12" />
          </Field>
        </div>

        <FlightFieldset title="Outbound flight" f={outbound} set={setOut} />
        <FlightFieldset title="Return flight" f={inbound} set={setIn} />

        <div className="grid gap-3">
          <Eyebrow>Pricing grid (per person, ₹)</Eyebrow>
          {pkg.categories.map((cat) => (
            <div key={cat} className="rounded-xl border p-3">
              <p className="mb-2 text-sm font-bold">{cat}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {OCCUPANCY.map((o) => (
                  <Field key={o.key} label={o.label}>
                    <Input
                      type="number"
                      value={pricing[cat][o.key]}
                      onChange={setPrice(cat, o.key)}
                      placeholder="0"
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function FlightFieldset({ title, f, set }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="mb-2 text-sm font-bold">{title}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="From"><Input value={f.from} onChange={set('from')} placeholder="BOM" /></Field>
        <Field label="To"><Input value={f.to} onChange={set('to')} placeholder="IXZ" /></Field>
        <Field label="Airline"><Input value={f.airline} onChange={set('airline')} placeholder="Indigo" /></Field>
        <Field label="Flight no."><Input value={f.flightNo} onChange={set('flightNo')} placeholder="6E-802" /></Field>
      </div>
    </div>
  )
}
