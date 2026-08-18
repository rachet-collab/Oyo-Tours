import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import DeleteIcon from '../components/ui/DeleteIcon.jsx'
import { Button, Card, Chip, Input, Pagination, Pill, Select, EmptyState } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { inr, shortDate } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')
const FILTERS = ['All', 'Pending approval', 'Approved']

// Date-range presets for the analytics section.
const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
]

// Returns [start, end) Date bounds for a preset; null means unbounded on that side.
function rangeBounds(key) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (key) {
    case 'today': return [startOfToday, null]
    case 'yesterday': {
      const y = new Date(startOfToday); y.setDate(y.getDate() - 1)
      return [y, startOfToday]
    }
    case '7d': { const s = new Date(startOfToday); s.setDate(s.getDate() - 6); return [s, null] }
    case '30d': { const s = new Date(startOfToday); s.setDate(s.getDate() - 29); return [s, null] }
    case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1), null]
    default: return [null, null]
  }
}

function Stat({ label, value, icon, tone = 'text-foreground' }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Icon name={icon} size={18} /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cx('truncate text-lg font-bold tabular-nums', tone)}>{value}</p>
      </div>
    </Card>
  )
}

function MoneyBar({ label, value, pct, barClass, valClass }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className={cx('font-bold tabular-nums', valClass)}>{inr(value)}</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={cx('h-full rounded-full', barClass)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  )
}

// Finance = approvals queue. Sales log payments (transactions) against a package
// booking; operations / finance review and approve them here.
export default function Finance() {
  const { bookings, packageById, guestById, approveBookingPayment } = useApp()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('All')
  const [range, setRange] = useState('all') // analytics date-range preset
  const [query, setQuery] = useState('')
  const [agent, setAgent] = useState('')

  // A transaction is a payment a sales agent has logged against a booking.
  const txns = useMemo(
    () => bookings
      .filter((b) => b.paymentNote && b.status !== 'Cancelled')
      .map((b) => ({
        ...b,
        pkg: packageById(b.packageId),
        guest: guestById(b.guestId),
        approved: !!b.paymentApproved,
      }))
      .sort((a, b) => (a.approved === b.approved ? 0 : a.approved ? 1 : -1)),
    [bookings, packageById, guestById],
  )

  const totals = useMemo(() => ({
    collected: txns.filter((t) => t.approved).reduce((s, t) => s + t.amount, 0),
    pendingAmt: txns.filter((t) => !t.approved).reduce((s, t) => s + t.amount, 0),
    pendingCount: txns.filter((t) => !t.approved).length,
    approvedCount: txns.filter((t) => t.approved).length,
    // Balance still to be collected across all live bookings (total − advance).
    outstanding: bookings.filter((b) => b.status !== 'Cancelled')
      .reduce((s, b) => s + Math.max(0, (b.amount || 0) - (b.advanceAmount || 0)), 0),
  }), [txns, bookings])

  // Money analytics: collected vs refunded, and collected bifurcated by package.
  // Scoped to the selected date range (by the booking's payment/creation date).
  const analytics = useMemo(() => {
    const [rStart, rEnd] = rangeBounds(range)
    const inRange = (dateStr) => {
      if (!rStart && !rEnd) return true
      if (!dateStr) return false
      const d = new Date(dateStr)
      if (rStart && d < rStart) return false
      if (rEnd && d >= rEnd) return false
      return true
    }
    const collectedTx = bookings.filter((b) => b.paymentNote && b.paymentApproved && b.status !== 'Cancelled' && inRange(b.approvedAt || b.createdAt))
    const collected = collectedTx.reduce((s, b) => s + (b.amount || 0), 0)
    const cancelled = bookings.filter((b) => b.status === 'Cancelled' && b.cancellation && inRange(b.cancellation.at || b.createdAt))
    const refunded = cancelled.filter((b) => b.cancellation.refundStatus === 'refunded').reduce((s, b) => s + (b.cancellation.refundAmount || 0), 0)
    const refundPending = cancelled.filter((b) => b.cancellation.refundStatus === 'pending').reduce((s, b) => s + (b.cancellation.refundAmount || 0), 0)
    const byPkg = {}
    collectedTx.forEach((b) => {
      const p = packageById(b.packageId)
      const key = b.packageId || 'unknown'
      if (!byPkg[key]) byPkg[key] = { name: p?.destinationCity || p?.name || 'Unknown', origin: p?.origin || '', amount: 0, count: 0 }
      byPkg[key].amount += b.amount || 0
      byPkg[key].count += 1
    })
    const perPackage = Object.values(byPkg).sort((a, b) => b.amount - a.amount)
    const maxPkg = perPackage.reduce((m, p) => Math.max(m, p.amount), 0) || 1
    const outstanding = bookings
      .filter((b) => b.status !== 'Cancelled' && inRange(b.approvedAt || b.createdAt))
      .reduce((s, b) => s + Math.max(0, (b.amount || 0) - (b.advanceAmount || 0)), 0)
    return { collected, refunded, refundPending, outstanding, net: Math.max(0, collected - refunded), perPackage, maxPkg }
  }, [bookings, packageById, range])

  const agentOptions = useMemo(() => [...new Set(txns.map((t) => t.agent).filter(Boolean))].sort(), [txns])
  const q = query.trim().toLowerCase()
  const rows = txns.filter((t) => {
    const mStatus = filter === 'All' ? true : filter === 'Approved' ? t.approved : !t.approved
    const mAgent = !agent || t.agent === agent
    const mq = !q || [t.ref, t.guest?.name, t.pkg?.destinationCity, t.pkg?.name, t.paymentNote, t.agent]
      .some((v) => String(v || '').toLowerCase().includes(q))
    return mStatus && mAgent && mq
  })
  const hasFilters = !!(query || agent || filter !== 'All')
  const clearAll = () => { setQuery(''); setAgent(''); setFilter('All') }

  // Pagination
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)
  useEffect(() => { setPage(1) }, [filter, query, agent])
  const pageRows = useMemo(() => rows.slice((page - 1) * perPage, page * perPage), [rows, page, perPage])

  return (
    <>
      <TopBar
        title="Finance"
        subtitle="Approve the payments your sales team logs against package bookings."
        tabs={(
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={cx('rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors', filter === f ? 'bg-secondary text-secondary-foreground' : 'border bg-card text-muted-foreground hover:bg-muted')}>
                {f}
              </button>
            ))}
            <Button variant="outline" size="sm" icon="trend" className="ml-auto" onClick={() => navigate('/finance/analytics')}>Analytics</Button>
          </div>
        )}
      />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {/* Filter panel — search + logged-by */}
        <Card className="grid gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search booking, guest, package or note" className="w-full pl-9" />
            </div>
            <div className="w-48">
              <Select value={agent} onChange={(e) => setAgent(e.target.value)}>
                <option value="">All agents</option>
                {agentOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </div>
          </div>

          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2">
              {query && <Chip label="Search" value={query} onClear={() => setQuery('')} />}
              {agent && <Chip label="Logged by" value={agent} onClear={() => setAgent('')} />}
              {filter !== 'All' && <Chip label="Status" value={filter} onClear={() => setFilter('All')} />}
              <button type="button" onClick={clearAll} className="ml-1 inline-flex items-center gap-1.5 text-xs font-semibold text-status-urgent hover:underline">
                <DeleteIcon size={14} /> Clear
              </button>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState icon="wallet" title="No transactions" hint="Payments logged by sales against a booking will appear here for approval." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-left text-[13px] font-semibold text-muted-foreground">
                    <th className="px-5 py-3">Booking</th>
                    <th className="px-3 py-3">Package</th>
                    <th className="px-3 py-3">Logged by</th>
                    <th className="px-3 py-3">Payment note</th>
                    <th className="px-3 py-3">Amount</th>
                    <th className="px-5 py-3 text-right">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((t) => (
                    <tr key={t.id} onClick={() => navigate(`/bookings/${t.id}`)} className="cursor-pointer border-t transition-colors hover:bg-muted/40">
                      <td className="px-5 py-3">
                        <p className="font-mono text-xs font-semibold text-primary">{t.ref}</p>
                        <p className="text-xs text-muted-foreground">{t.guest?.name || '—'} · {shortDate(t.createdAt)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium">{t.pkg?.destinationCity || '—'}</p>
                        <p className="text-xs text-muted-foreground">{t.pkg?.origin} · {t.category}</p>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{t.agent || '—'}</td>
                      <td className="px-3 py-3">
                        <p className="max-w-[260px] truncate">{t.paymentNote}</p>
                        {t.paymentProof?.name && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Icon name="paperclip" size={12} />{t.paymentProof.name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-semibold tabular-nums">{inr(t.amount)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {t.approved ? (
                            <div className="text-right">
                              <Pill tone="won" dot>Approved</Pill>
                              <p className="mt-1 text-[11px] text-muted-foreground">{t.approvedBy}{t.approvedAt ? ` · ${shortDate(String(t.approvedAt).slice(0, 10))}` : ''}</p>
                            </div>
                          ) : (
                            <>
                              <Pill tone="proposal" dot>Pending</Pill>
                              <Button size="sm" icon="check" onClick={(e) => { e.stopPropagation(); approveBookingPayment(t.id) }}>Approve</Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} perPage={perPage} total={rows.length} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1) }} />
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
