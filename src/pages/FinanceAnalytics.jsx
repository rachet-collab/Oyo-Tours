import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Card, Select } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { inr } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All time' },
]

function rangeBounds(key) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (key) {
    case 'today': return [startOfToday, null]
    case 'yesterday': { const y = new Date(startOfToday); y.setDate(y.getDate() - 1); return [y, startOfToday] }
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

export default function FinanceAnalytics() {
  const { bookings, packageById } = useApp()
  const navigate = useNavigate()
  const [range, setRange] = useState('all')

  const totals = useMemo(() => {
    const collected = bookings.filter((b) => b.paymentNote && b.paymentApproved && b.status !== 'Cancelled').reduce((s, b) => s + b.amount, 0)
    const pendingAmt = bookings.filter((b) => b.paymentNote && !b.paymentApproved && b.status !== 'Cancelled').reduce((s, b) => s + b.amount, 0)
    return {
      collected,
      pendingAmt,
      pendingCount: bookings.filter((b) => b.paymentNote && !b.paymentApproved && b.status !== 'Cancelled').length,
      approvedCount: bookings.filter((b) => b.paymentNote && b.paymentApproved && b.status !== 'Cancelled').length,
      outstanding: bookings.filter((b) => b.status !== 'Cancelled').reduce((s, b) => s + Math.max(0, (b.amount || 0) - (b.advanceAmount || 0)), 0),
    }
  }, [bookings])

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
      if (!byPkg[key]) byPkg[key] = { name: p?.destinationCity || p?.name || 'Unknown', amount: 0, count: 0 }
      byPkg[key].amount += b.amount || 0
      byPkg[key].count += 1
    })
    const perPackage = Object.values(byPkg).sort((a, b) => b.amount - a.amount)
    const maxPkg = perPackage.reduce((m, p) => Math.max(m, p.amount), 0) || 1
    const outstanding = bookings.filter((b) => b.status !== 'Cancelled' && inRange(b.approvedAt || b.createdAt))
      .reduce((s, b) => s + Math.max(0, (b.amount || 0) - (b.advanceAmount || 0)), 0)
    return { collected, refunded, refundPending, outstanding, net: Math.max(0, collected - refunded), perPackage, maxPkg }
  }, [bookings, packageById, range])

  return (
    <>
      <TopBar
        title="Finance analytics"
        subtitle="Money collected, refunded and outstanding across bookings."
        actions={<Button variant="outline" onClick={() => navigate('/finance')}><span aria-hidden="true" className="mr-1">←</span> Back to transactions</Button>}
      />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">Overview</h2>
          <div className="w-44">
            <Select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Analytics date range">
              {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Approved / collected" value={inr(totals.collected)} icon="check" tone="text-status-won" />
          <Stat label="Yet to collect" value={inr(totals.outstanding)} icon="wallet" tone="text-status-urgent" />
          <Stat label="Pending approval" value={inr(totals.pendingAmt)} icon="clock" tone="text-status-proposal" />
          <Stat label="Awaiting review" value={totals.pendingCount} icon="clock" />
          <Stat label="Approved" value={totals.approvedCount} icon="shield" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Icon name="wallet" size={17} className="text-primary" />
              <h2 className="text-base font-bold">Collected vs refunded</h2>
            </div>
            <div className="grid gap-3">
              <MoneyBar label="Collected" value={analytics.collected} pct={analytics.collected > 0 ? 100 : 0} barClass="bg-status-won" valClass="text-status-won" />
              <MoneyBar label="Refunded (cancellations)" value={analytics.refunded} pct={analytics.collected ? (analytics.refunded / analytics.collected) * 100 : 0} barClass="bg-status-urgent" valClass="text-status-urgent" />
              <MoneyBar label="Refund pending" value={analytics.refundPending} pct={analytics.collected ? (analytics.refundPending / analytics.collected) * 100 : 0} barClass="bg-status-proposal" valClass="text-status-proposal" />
              <MoneyBar label="Yet to collect (balance due)" value={analytics.outstanding} pct={(analytics.collected + analytics.outstanding) ? (analytics.outstanding / (analytics.collected + analytics.outstanding)) * 100 : 0} barClass="bg-status-urgent" valClass="text-status-urgent" />
              <div className="mt-1 flex items-center justify-between border-t pt-3">
                <span className="text-sm font-semibold">Net collected</span>
                <span className="text-lg font-bold tabular-nums">{inr(analytics.net)}</span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Icon name="boxes" size={17} className="text-primary" />
              <h2 className="text-base font-bold">Collected by package</h2>
            </div>
            {analytics.perPackage.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No approved payments yet.</p>
            ) : (
              <div className="grid max-h-72 gap-3 overflow-y-auto pr-1">
                {analytics.perPackage.map((p, i) => (
                  <div key={i}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{p.name}<span className="text-muted-foreground"> · {p.count} booking{p.count === 1 ? '' : 's'}</span></span>
                      <span className="shrink-0 font-semibold tabular-nums">{inr(p.amount)}</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (p.amount / analytics.maxPkg) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
