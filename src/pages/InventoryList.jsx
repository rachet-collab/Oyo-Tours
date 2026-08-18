import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Card, Chip, FilterTabs, Input, Modal, Pagination, Pill, SeatMeter, Select, EmptyState } from '../components/ui/primitives.jsx'
import InventoryImage from '../components/InventoryImage.jsx'
import DeleteIcon from '../components/ui/DeleteIcon.jsx'
import { useApp } from '../store/AppStore.jsx'
import { shortDate, timeLabel } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')
const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (key) => { const [y, m] = key.split('-'); return `${MONTHS_ABBR[+m - 1]} ${y}` }
// Airport code → city, so the route shows readable origin/destination cities.
const CITY = {
  DEL: 'Delhi', BOM: 'Mumbai', IXZ: 'Port Blair', MAA: 'Chennai', BLR: 'Bengaluru',
  CCU: 'Kolkata', HYD: 'Hyderabad', GOI: 'Goa', GOX: 'Goa', COK: 'Kochi', AMD: 'Ahmedabad',
  PNQ: 'Pune', JAI: 'Jaipur', SXR: 'Srinagar', CDG: 'Paris', LHR: 'London', DXB: 'Dubai',
  AUH: 'Abu Dhabi', DOH: 'Doha', SIN: 'Singapore', BKK: 'Bangkok', HKT: 'Phuket',
  DPS: 'Bali', KUL: 'Kuala Lumpur', HAN: 'Hanoi', SGN: 'Ho Chi Minh', MLE: 'Malé',
  CMB: 'Colombo', KTM: 'Kathmandu', IST: 'Istanbul', HKG: 'Hong Kong', NRT: 'Tokyo',
}
const cityName = (code) => CITY[String(code || '').toUpperCase()] || code || ''

// A clean, human inventory ID: FL-<n> for flights, HT-<n> for hotels (the
// "FL"/"HT" initials mirror "PKG" for packages). The number is taken from the
// record's existing id so it stays stable — no more confusing airline-code IDs.
const invLabel = (i) => {
  const num = String(i.inventoryId || i.id || '').replace(/\D/g, '') || String(i.id || '')
  return `${(i.type || 'airline') === 'hotel' ? 'HT' : 'FL'}-${num}`
}

// Days-left sub-label for a deadline: emphatic red when the date is close or
// already past, muted otherwise. Returns null when there's no deadline set.
const deadlineNote = (days) => {
  if (days == null) return null
  if (days < 0) return { text: 'Passed', urgent: true }
  if (days === 0) return { text: 'Today', urgent: true }
  return { text: `${days}d left`, urgent: days <= 3 }
}

function DeadlineCell({ date, days }) {
  const n = deadlineNote(days)
  return (
    <td>
      <p className="font-medium">{shortDate(date) || '—'}</p>
      {n && <p className={cx('mt-0.5 text-xs font-semibold', n.urgent ? 'text-status-urgent' : 'text-muted-foreground')}>{n.text}</p>}
    </td>
  )
}

function Stat({ label, value, icon }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg font-bold tabular-nums">{value}</p>
      </div>
    </Card>
  )
}

// A single-type inventory workspace (flights OR hotels). Reached from the
// Inventory overview; shows filters, stats and the block table for that type.
export default function InventoryList({ type = 'airline' }) {
  const isHotelView = type === 'hotel'
  const { inventoryView, deleteInventory, updateInventory, packageById } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [life, setLife] = useState('active') // 'active' | 'inactive'
  const [toDelete, setToDelete] = useState(null)
  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [month, setMonth] = useState('')

  const typeOf = (i) => i.type || 'airline'
  const scoped = useMemo(() => inventoryView.filter((i) => typeOf(i) === type), [inventoryView, type])
  const lifeCounts = useMemo(() => ({
    active: scoped.filter((i) => i.status === 'Active').length,
    inactive: scoped.filter((i) => i.status === 'Inactive').length,
  }), [scoped])
  const base = useMemo(() => scoped.filter((i) => i.status === (life === 'active' ? 'Active' : 'Inactive')), [scoped, life])

  const fromOptions = useMemo(() => [...new Set(scoped.map((i) => i.departureCity).filter(Boolean))].sort(), [scoped])
  const toOptions = useMemo(() => [...new Set(scoped.map((i) => i.arrivalCity).filter(Boolean))].sort(), [scoped])
  const monthOptions = useMemo(() => [...new Set(scoped.map((i) => i.departureDate).filter(Boolean).map((d) => d.slice(0, 7)))].sort(), [scoped])

  const rows = useMemo(
    () => base.filter((i) => {
      const q = query.toLowerCase()
      const mq = !q || i.inventoryId.toLowerCase().includes(q) || i.airline.toLowerCase().includes(q) || i.sector.toLowerCase().includes(q)
      const mFrom = !fromCity || i.departureCity === fromCity
      const mTo = !toCity || i.arrivalCity === toCity
      const mm = !month || (i.departureDate && i.departureDate.slice(0, 7) === month)
      return mq && mFrom && mTo && mm
    })
      // Dates always ascending.
      .sort((a, b) => String(a.departureDate || '').localeCompare(String(b.departureDate || ''))),
    [base, query, fromCity, toCity, month],
  )

  // Pagination.
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  // Multi-select.
  const [sel, setSel] = useState(() => new Set())
  useEffect(() => { setPage(1); setSel(new Set()) }, [query, fromCity, toCity, month, life, type])
  const pageRows = useMemo(() => rows.slice((page - 1) * perPage, page * perPage), [rows, page, perPage])
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allOnPage = pageRows.length > 0 && pageRows.every((i) => sel.has(i.id))
  const toggleAllOnPage = () => setSel((s) => {
    const n = new Set(s)
    if (allOnPage) pageRows.forEach((i) => n.delete(i.id))
    else pageRows.forEach((i) => n.add(i.id))
    return n
  })
  const selectedRows = useMemo(() => rows.filter((i) => sel.has(i.id)), [rows, sel])
  const selInactive = selectedRows.filter((i) => i.status === 'Inactive')
  const bulkDelink = () => { selectedRows.forEach((i) => { if (i.packageId) updateInventory(i.id, { packageId: '' }) }); setSel(new Set()) }
  const bulkDelete = () => { selInactive.forEach((i) => deleteInventory(i.id)); setSel(new Set()) }

  // Stats reflect the CURRENT filtered rows, not just the lifecycle tab.
  const s = useMemo(() => ({
    purchased: rows.reduce((a, i) => a + i.totalSeats, 0),
    allocated: rows.reduce((a, i) => a + i.allocatedSeats, 0),
    available: rows.reduce((a, i) => a + i.available, 0),
    released: rows.reduce((a, i) => a + (i.releasedSeats || 0), 0),
    util: rows.length ? Math.round(rows.reduce((a, i) => a + i.utilization, 0) / rows.length) : 0,
  }), [rows])

  const hasFilters = !!(query || fromCity || toCity || month)
  const clearAll = () => { setQuery(''); setFromCity(''); setToCity(''); setMonth('') }

  const detailBase = isHotelView ? '/hotels' : '/inventory'
  const unitLabel = isHotelView ? 'Rooms' : 'Seats'
  const pkgOf = (i) => (i.packageId ? packageById(i.packageId) : null)

  return (
    <>
      <TopBar
        title={isHotelView ? 'Hotel inventory' : 'Flight inventory'}
        subtitle={isHotelView ? 'Hotel room blocks — allocation, vendors & deadlines.' : 'Airline seat blocks — allocation, vendors & deadlines.'}
        tabs={(
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterTabs
              value={life}
              onChange={setLife}
              tabs={[
                { key: 'active', label: 'Active', count: lifeCounts.active, tone: 'won' },
                { key: 'inactive', label: 'Inactive', count: lifeCounts.inactive, tone: 'urgent' },
              ]}
            />
            {/* Inventory is seeded only from packages — the only action here is the
                Airlines registry link (flights). */}
            {!isHotelView && (
              <Button variant="outline" size="sm" icon="booking" onClick={() => navigate('/airlines')}>Airlines</Button>
            )}
          </div>
        )}
      />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {/* Filter panel (search + dropdowns + active-filter chips) */}
        <Card className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, name or route" className="w-full pl-9" />
            </div>
            <div className="w-40">
              <Select value={fromCity} onChange={(e) => setFromCity(e.target.value)}>
                <option value="">{isHotelView ? 'All cities' : 'From — all'}</option>
                {fromOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            {!isHotelView && (
              <div className="w-40">
                <Select value={toCity} onChange={(e) => setToCity(e.target.value)}>
                  <option value="">To — all</option>
                  {toOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
            )}
            {!isHotelView && (
              <div className="w-40">
                <Select value={month} onChange={(e) => setMonth(e.target.value)} title="Departure month">
                  <option value="">All months</option>
                  {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </Select>
              </div>
            )}
          </div>

          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2">
              {query && <Chip label="Search" value={query} onClear={() => setQuery('')} />}
              {fromCity && <Chip label={isHotelView ? 'City' : 'From'} value={fromCity} onClear={() => setFromCity('')} />}
              {toCity && <Chip label="To" value={toCity} onClear={() => setToCity('')} />}
              {month && <Chip label="Month" value={monthLabel(month)} onClear={() => setMonth('')} />}
              <button type="button" onClick={clearAll} className="ml-1 inline-flex items-center gap-1.5 text-xs font-semibold text-status-urgent hover:underline">
                <DeleteIcon size={14} /> Clear
              </button>
            </div>
          )}
        </Card>

        {/* Stats — below the filters, reflecting the filtered rows */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Purchased" value={s.purchased} icon="wallet" />
          <Stat label="Allocated" value={`${s.allocated} · ${s.util}%`} icon="trend" />
          <Stat label="Available" value={s.available} icon="check" />
          <Stat label="Released" value={s.released} icon="logout" />
        </div>

        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-foreground px-4 py-2.5 text-background">
            <span className="text-sm font-semibold">{sel.size} selected</span>
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" icon="unlink" className="!border-background/40 !bg-transparent !text-background hover:!bg-background/15" onClick={bulkDelink}>Delink</Button>
              <Button size="sm" variant="outline" className="!border-status-urgent/60 !bg-transparent !text-status-urgent hover:!bg-status-urgent/15" disabled={selInactive.length === 0} onClick={bulkDelete}>
                Delete{selInactive.length ? ` (${selInactive.length})` : ''}
              </Button>
              <button type="button" onClick={() => setSel(new Set())} className="text-xs font-semibold text-background/80 hover:text-background">Clear</button>
            </div>
          </div>
        )}

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState icon="boxes" title="No inventory found" hint={isHotelView ? 'Hotel room blocks are created from packages — add hotels to a package and they’ll appear here.' : 'Flight blocks are created from packages — add flights to a package departure and they’ll appear here.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className={cx('w-full text-sm', isHotelView ? 'min-w-[1160px]' : 'min-w-[1520px]')}>
                <thead>
                  <tr className="border-b bg-muted/60 text-left text-[13px] font-semibold text-muted-foreground">
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" checked={allOnPage} onChange={toggleAllOnPage} aria-label="Select all"
                        className="h-4 w-4 cursor-pointer rounded border-border accent-foreground" />
                    </th>
                    <th className="px-5 py-3">Inventory ID</th>
                    <th className="px-3 py-3">Package</th>
                    <th className="px-3 py-3">Route / stay</th>
                    {!isHotelView && <th className="px-3 py-3">Departure date</th>}
                    {!isHotelView && <th className="px-3 py-3">Return date</th>}
                    <th className="px-3 py-3">Release deadline</th>
                    <th className="px-3 py-3">Naming deadline</th>
                    <th className="px-3 py-3">{unitLabel}</th>
                    <th className="px-3 py-3">Vendors</th>
                    <th className="px-5 py-3" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((i) => {
                    const hot = i.releaseDaysLeft != null && i.releaseDaysLeft <= 3 && i.available > 0
                    const pkg = pkgOf(i)
                    return (
                      <tr key={i.id} onClick={() => navigate(`${detailBase}/${i.id}`)}
                        className={cx('cursor-pointer border-t transition-colors hover:bg-muted/40 [&>td]:px-3 [&>td]:py-4 [&>td]:align-middle', sel.has(i.id) && 'bg-secondary/40', hot && 'bg-status-urgent-bg/20')}>
                        <td className="!px-4" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggleSel(i.id)} aria-label={`Select ${i.inventoryId}`}
                            className="h-4 w-4 cursor-pointer rounded border-border accent-foreground" />
                        </td>
                        <td className="!px-5">
                          <div className="flex items-center gap-3">
                            {isHotelView && pkg?.coverUrl ? (
                              <img src={pkg.coverUrl} alt={pkg.name} className="h-[38px] w-[38px] shrink-0 rounded-lg object-cover" />
                            ) : (
                              <InventoryImage inv={i} size={38} />
                            )}
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-semibold">{invLabel(i)}</p>
                              <p className="text-xs text-muted-foreground">{i.airline}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          {pkg ? (
                            <div className="min-w-0">
                              <p className="max-w-[220px] truncate font-medium">{pkg.name}</p>
                              <p className="font-mono text-xs text-muted-foreground">{pkg.code}</p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-status-urgent-bg px-2 py-1 text-xs font-semibold text-status-urgent">
                                <span className="h-1.5 w-1.5 rounded-full bg-status-urgent" /> Unlinked
                              </span>
                              <span className="group relative inline-flex" onClick={(e) => e.stopPropagation()}>
                                <Icon name="info" size={14} className="cursor-help text-muted-foreground" />
                                <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 w-56 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs font-medium leading-relaxed text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                                  Not tied to a package yet. Link it to a package so it shows against that package's bookings and counts toward utilisation.
                                </span>
                              </span>
                            </span>
                          )}
                        </td>
                        <td>
                          {isHotelView ? (
                            <>
                              <p className="font-medium">{i.sector}</p>
                              <p className="text-xs text-muted-foreground">{i.flightNo}</p>
                            </>
                          ) : (
                            <>
                              <p className="font-medium">{cityName(i.departureCity)} <span className="text-muted-foreground">→</span> {cityName(i.arrivalCity)}</p>
                              <p className="text-xs text-muted-foreground">{i.departureCity} → {i.arrivalCity} · {i.flightNo}</p>
                            </>
                          )}
                        </td>
                        {!isHotelView && (
                          <td>
                            <p className="font-medium">{shortDate(i.departureDate) || '—'}</p>
                            {i.departTime ? <p className="text-xs text-muted-foreground">{timeLabel(i.departTime)}{i.arriveTime ? ` – ${timeLabel(i.arriveTime)}` : ''}</p> : null}
                          </td>
                        )}
                        {!isHotelView && (
                          <td>
                            <p className="font-medium">{shortDate(i.returnDate) || '—'}</p>
                            {i.returnDepartTime ? <p className="text-xs text-muted-foreground">{timeLabel(i.returnDepartTime)}{i.returnArriveTime ? ` – ${timeLabel(i.returnArriveTime)}` : ''}</p> : null}
                          </td>
                        )}
                        <DeadlineCell date={i.releaseDeadline} days={i.releaseDaysLeft} />
                        <DeadlineCell date={i.namingDeadline} days={i.namingDaysLeft} />
                        <td>
                          <SeatMeter available={i.available} total={i.totalSeats} />
                          <p className="mt-1.5 text-xs text-muted-foreground">{i.allocatedSeats} allocated</p>
                        </td>
                        <td>
                          {(i.vendors && i.vendors.length) ? (
                            <div className="flex max-w-[220px] flex-wrap gap-1">
                              {i.vendors.slice(0, 2).map((v, k) => (
                                <span key={k} className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">{v}</span>
                              ))}
                              {i.vendors.length > 2 && <span className="text-xs text-muted-foreground">+{i.vendors.length - 2}</span>}
                            </div>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="!px-5 text-right">
                          {i.status === 'Inactive' && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setToDelete(i) }}
                              title="Delete inactive record"
                              aria-label="Delete"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#FF5630] transition-colors hover:bg-[#FF5630]/10"
                            >
                              <DeleteIcon size={18} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <Pagination page={page} perPage={perPage} total={rows.length} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1) }} />
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete inventory?"
        subtitle={toDelete ? `${toDelete.inventoryId} · ${toDelete.sector}` : ''}
        width="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>Keep</Button>
            <Button variant="danger" icon="x" onClick={() => { deleteInventory(toDelete.id); setToDelete(null) }}>Delete inventory</Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-urgent-bg text-status-urgent"><Icon name="x" size={18} /></span>
          <p className="text-sm text-muted-foreground">
            This permanently removes the inactive record <span className="font-semibold text-foreground">{toDelete?.inventoryId}</span> from inventory. Only inactive records can be deleted — this can’t be undone.
          </p>
        </div>
      </Modal>
    </>
  )
}
