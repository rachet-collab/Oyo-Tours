import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Card, FilterTabs, Input, Modal, Pill, SeatMeter, Select, EmptyState } from '../components/ui/primitives.jsx'
import InventoryImage from '../components/InventoryImage.jsx'
import DeleteIcon from '../components/ui/DeleteIcon.jsx'
import { useApp } from '../store/AppStore.jsx'
import { shortDate } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')
const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (key) => { const [y, m] = key.split('-'); return `${MONTHS_ABBR[+m - 1]} ${y}` }

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

// A dismissible active-filter chip (matches the reference filter design).
function Chip({ label, value, onClear }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="rounded-md bg-secondary px-1.5 py-0.5 font-semibold text-primary">{value}</span>
      <button type="button" onClick={onClear} className="text-muted-foreground hover:text-foreground"><Icon name="x" size={12} /></button>
    </span>
  )
}

// A single-type inventory workspace (flights OR hotels). Reached from the
// Inventory overview; shows filters, stats and the block table for that type.
export default function InventoryList({ type = 'airline' }) {
  const isHotelView = type === 'hotel'
  const { inventoryView, deleteInventory, packageById } = useApp()
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
    }),
    [base, query, fromCity, toCity, month],
  )

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
        actions={<Button variant="outline" icon="chevronLeft" onClick={() => navigate('/inventory')}>Inventory overview</Button>}
      />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <FilterTabs
          value={life}
          onChange={setLife}
          tabs={[
            { key: 'active', label: 'Active', count: lifeCounts.active, tone: 'won' },
            { key: 'inactive', label: 'Inactive', count: lifeCounts.inactive, tone: 'urgent' },
          ]}
        />

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isHotelView && <Button variant="outline" icon="plane" onClick={() => navigate('/airlines')}>Airlines</Button>}
          <Button variant="outline" icon="upload" onClick={() => navigate(`/inventory/bulk-upload?type=${type}`)}>Bulk upload</Button>
          <Button icon="plus" onClick={() => navigate(isHotelView ? '/hotels/new' : '/inventory/new')}>
            {isHotelView ? 'Add hotel block' : 'Add flight'}
          </Button>
        </div>

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
            <div className="w-40">
              <Select value={month} onChange={(e) => setMonth(e.target.value)} title={isHotelView ? 'Check-in month' : 'Departure month'}>
                <option value="">All months</option>
                {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{rows.length} result{rows.length === 1 ? '' : 's'} found</span>
            {hasFilters && (
              <>
                <span className="mx-1 text-muted-foreground">·</span>
                {query && <Chip label="Search" value={query} onClear={() => setQuery('')} />}
                {fromCity && <Chip label={isHotelView ? 'City' : 'From'} value={fromCity} onClear={() => setFromCity('')} />}
                {toCity && <Chip label="To" value={toCity} onClear={() => setToCity('')} />}
                {month && <Chip label="Month" value={monthLabel(month)} onClear={() => setMonth('')} />}
                <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 text-xs font-semibold text-status-urgent hover:underline">
                  <Icon name="x" size={13} /> Clear
                </button>
              </>
            )}
          </div>
        </Card>

        {/* Stats — below the filters, reflecting the filtered rows */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Purchased" value={s.purchased} icon="wallet" />
          <Stat label="Allocated" value={`${s.allocated} · ${s.util}%`} icon="trend" />
          <Stat label="Available" value={s.available} icon="check" />
          <Stat label="Released" value={s.released} icon="logout" />
        </div>

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState icon="boxes" title="No inventory found" hint="Add a record, upload in bulk, or adjust your filters." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-5 py-3">Inventory</th>
                    <th className="px-3 py-3">Package</th>
                    <th className="px-3 py-3">Route / stay</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">{unitLabel}</th>
                    <th className="px-3 py-3">Vendors</th>
                    <th className="px-5 py-3">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const hot = i.releaseDaysLeft != null && i.releaseDaysLeft <= 3 && i.available > 0
                    const pkg = pkgOf(i)
                    return (
                      <tr key={i.id} onClick={() => navigate(`${detailBase}/${i.id}`)}
                        className={cx('cursor-pointer border-t transition-colors hover:bg-muted/40 [&>td]:px-3 [&>td]:py-4 [&>td]:align-middle', hot && 'bg-status-urgent-bg/20')}>
                        <td className="!px-5">
                          <div className="flex items-center gap-3">
                            <InventoryImage inv={i} size={38} />
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-semibold">{i.inventoryId}</p>
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
                          ) : <span className="text-xs text-muted-foreground">Unlinked</span>}
                        </td>
                        <td>
                          <p className="font-medium">{i.sector}</p>
                          <p className="text-xs text-muted-foreground">{i.flightNo}</p>
                        </td>
                        <td>
                          <p className="font-medium">{shortDate(i.departureDate)}</p>
                          {hot && <p className="text-xs font-semibold text-status-urgent">Release in {Math.max(0, i.releaseDaysLeft)}d</p>}
                        </td>
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
                        <td className="!px-5">
                          <div className="flex items-center gap-2">
                            <span className={cx('inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold',
                              pkg ? 'bg-status-won-bg text-status-won' : 'bg-status-urgent-bg text-status-urgent')}>
                              <span className={cx('h-1.5 w-1.5 rounded-full', pkg ? 'bg-status-won' : 'bg-status-urgent')} />
                              {pkg ? 'Linked' : 'Not linked'}
                            </span>
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
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
