import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Card, Pill, EmptyState } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { inr, shortDate } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')
const FILTERS = ['All', 'Pending approval', 'Approved']

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
  }), [txns])

  // Money analytics: collected vs refunded, and collected bifurcated by package.
  const analytics = useMemo(() => {
    const collectedTx = bookings.filter((b) => b.paymentNote && b.paymentApproved && b.status !== 'Cancelled')
    const collected = collectedTx.reduce((s, b) => s + (b.amount || 0), 0)
    const cancelled = bookings.filter((b) => b.status === 'Cancelled' && b.cancellation)
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
    return { collected, refunded, refundPending, net: Math.max(0, collected - refunded), perPackage, maxPkg }
  }, [bookings, packageById])

  const rows = txns.filter((t) =>
    filter === 'All' ? true : filter === 'Approved' ? t.approved : !t.approved)

  return (
    <>
      <TopBar title="Finance" subtitle="Approve the payments your sales team logs against package bookings." />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Approved / collected" value={inr(totals.collected)} icon="check" tone="text-status-won" />
          <Stat label="Pending approval" value={inr(totals.pendingAmt)} icon="clock" tone="text-status-proposal" />
          <Stat label="Awaiting review" value={totals.pendingCount} icon="wallet" />
          <Stat label="Approved" value={totals.approvedCount} icon="shield" />
        </div>

        {/* Analytics — money in vs out, and bifurcation by package */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Icon name="wallet" size={17} className="text-primary" />
              <h2 className="text-base font-bold">Collected vs refunded</h2>
            </div>
            <div className="grid gap-3">
              <MoneyBar label="Collected" value={analytics.collected} pct={100} barClass="bg-status-won" valClass="text-status-won" />
              <MoneyBar label="Refunded (cancellations)" value={analytics.refunded} pct={analytics.collected ? (analytics.refunded / analytics.collected) * 100 : 0} barClass="bg-status-urgent" valClass="text-status-urgent" />
              <MoneyBar label="Refund pending" value={analytics.refundPending} pct={analytics.collected ? (analytics.refundPending / analytics.collected) * 100 : 0} barClass="bg-status-proposal" valClass="text-status-proposal" />
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
              <div className="grid max-h-64 gap-3 overflow-y-auto pr-1">
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

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cx('rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors', filter === f ? 'bg-secondary text-secondary-foreground' : 'border bg-card text-muted-foreground hover:bg-muted')}>
              {f}
            </button>
          ))}
        </div>

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState icon="wallet" title="No transactions" hint="Payments logged by sales against a booking will appear here for approval." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-5 py-3">Booking</th>
                    <th className="px-3 py-3">Package</th>
                    <th className="px-3 py-3">Logged by</th>
                    <th className="px-3 py-3">Payment note</th>
                    <th className="px-3 py-3">Amount</th>
                    <th className="px-5 py-3 text-right">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-t hover:bg-muted/40">
                      <td className="px-5 py-3">
                        <button type="button" onClick={() => navigate(`/bookings/${t.id}`)} className="text-left">
                          <p className="font-mono text-xs font-semibold text-primary">{t.ref}</p>
                          <p className="text-xs text-muted-foreground">{t.guest?.name || '—'} · {shortDate(t.createdAt)}</p>
                        </button>
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
                              <p className="mt-1 text-[11px] text-muted-foreground">{t.approvedBy}{t.approvedAt ? ` · ${shortDate(t.approvedAt)}` : ''}</p>
                            </div>
                          ) : (
                            <>
                              <Pill tone="proposal" dot>Pending</Pill>
                              <Button size="sm" icon="check" onClick={() => approveBookingPayment(t.id)}>Approve</Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
