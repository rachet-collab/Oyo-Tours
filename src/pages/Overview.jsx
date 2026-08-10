import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Card, Eyebrow, Pill } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { INV_STATUS_TONE } from '../store/data.js'
import { inr, shortDate } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')

function Tile({ label, value, sub, icon }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon name={icon} size={15} />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}

function TypeCard({ title, icon, rows, list }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary"><Icon name={icon} size={16} /></span>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{r.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{r.label}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

export default function Overview() {
  const { inventoryView, opsStats, user } = useApp()
  const navigate = useNavigate()

  const byType = useMemo(() => {
    const g = (t) => inventoryView.filter((i) => (i.type || 'airline') === t)
    const sum = (arr) => ({
      records: arr.length,
      purchased: arr.reduce((a, i) => a + i.totalSeats, 0),
      allocated: arr.reduce((a, i) => a + i.allocatedSeats, 0),
      available: arr.reduce((a, i) => a + i.available, 0),
      outstanding: arr.reduce((a, i) => a + i.outstanding, 0),
    })
    return { airline: sum(g('airline')), hotel: sum(g('hotel')) }
  }, [inventoryView])

  // Combined "needs attention" queue, most urgent first.
  const attention = useMemo(() => {
    const items = []
    inventoryView.forEach((i) => {
      const base = { id: i.id, type: i.type, ref: i.inventoryId, sector: i.sector, route: `${i.type === 'hotel' ? '/hotels' : '/inventory'}/${i.id}` }
      if (i.available > 0 && i.releaseDaysLeft != null && i.releaseDaysLeft <= 3 && i.status === 'Active')
        items.push({ ...base, kind: 'Release decision', detail: `${i.available} unsold · window closes ${i.releaseDaysLeft <= 0 ? 'today' : `in ${i.releaseDaysLeft}d`}`, days: i.releaseDaysLeft, icon: 'clock' })
      if (!i.balancePaid && i.balanceDaysLeft != null && i.balanceDaysLeft <= 3)
        items.push({ ...base, kind: 'Balance payment', detail: `${inr(i.outstanding)} due ${i.balanceDaysLeft < 0 ? `${Math.abs(i.balanceDaysLeft)}d overdue` : i.balanceDaysLeft === 0 ? 'today' : `in ${i.balanceDaysLeft}d`}`, days: i.balanceDaysLeft, icon: 'wallet' })
      if (i.namesPending > 0 && i.namingDaysLeft != null && i.namingDaysLeft <= 5)
        items.push({ ...base, kind: 'Naming pending', detail: `${i.namesPending} pending · deadline in ${Math.max(0, i.namingDaysLeft)}d`, days: i.namingDaysLeft, icon: 'users' })
    })
    return items.sort((a, b) => (a.days ?? 99) - (b.days ?? 99))
  }, [inventoryView])

  const first = user?.name?.split(' ')[0]

  return (
    <>
      <TopBar title={`Welcome back, ${first}`} subtitle="Inventory, payments and operational deadlines at a glance." />

      <div className="grid gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Tile label="Purchase value" value={inr(opsStats.purchaseValue)} sub={`${opsStats.records} inventory records`} icon="wallet" />
          <Tile label="Outstanding" value={inr(opsStats.outstanding)} sub={`${opsStats.overdue} overdue · ${opsStats.advancePending} advance pending`} icon="trend" />
          <Tile label="Seats + rooms free" value={opsStats.seatsAvailable} sub={`${opsStats.seatsAllocated}/${opsStats.seatsPurchased} allocated`} icon="seat" />
          <Tile label="Avg utilization" value={`${opsStats.avgUtilization}%`} sub={`${opsStats.namesPending} names pending`} icon="dashboard" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Needs attention */}
          <Card className="p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <Eyebrow>Needs attention</Eyebrow>
              <Pill tone={attention.length ? 'urgent' : 'won'}>{attention.length} item{attention.length === 1 ? '' : 's'}</Pill>
            </div>
            {attention.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">Nothing urgent — all deadlines are clear.</p>
            ) : (
              <div className="grid gap-2">
                {attention.map((a, i) => (
                  <button key={i} onClick={() => navigate(a.route)}
                    className="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50">
                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', a.days != null && a.days <= 1 ? 'bg-status-urgent-bg text-status-urgent' : 'bg-secondary text-primary')}>
                      <Icon name={a.icon} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{a.kind} <span className="font-mono text-xs text-muted-foreground">· {a.ref}</span></p>
                      <p className="truncate text-xs text-muted-foreground">{a.sector} — {a.detail}</p>
                    </div>
                    <Icon name="chevronRight" size={16} className="text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Inventory split */}
          <div className="grid gap-6">
            <TypeCard title="Airline" icon="plane" rows={[
              { label: 'Records', value: byType.airline.records },
              { label: 'Seats', value: byType.airline.purchased },
              { label: 'Free', value: byType.airline.available },
              { label: 'Due', value: inr(byType.airline.outstanding) },
            ]} />
            <TypeCard title="Hotel" icon="building" rows={[
              { label: 'Records', value: byType.hotel.records },
              { label: 'Rooms', value: byType.hotel.purchased },
              { label: 'Free', value: byType.hotel.available },
              { label: 'Due', value: inr(byType.hotel.outstanding) },
            ]} />
          </div>
        </div>

        {/* Upcoming departures / check-ins */}
        <Card className="overflow-hidden">
          <div className="px-5 py-4"><h2 className="text-base font-bold">Upcoming inventory</h2></div>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/60 text-left text-[13px] font-semibold text-muted-foreground">
                  <th className="px-5 py-2.5">Inventory</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Utilization</th><th className="px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...inventoryView].sort((a, b) => a.departureDate.localeCompare(b.departureDate)).slice(0, 8).map((i) => (
                  <tr key={i.id} onClick={() => navigate(`${i.type === 'hotel' ? '/hotels' : '/inventory'}/${i.id}`)} className="cursor-pointer border-t hover:bg-muted/40">
                    <td className="px-5 py-3"><span className="font-mono text-xs font-semibold">{i.inventoryId}</span><p className="text-xs text-muted-foreground">{i.airline}</p></td>
                    <td className="px-3 py-3"><Pill tone={i.type === 'hotel' ? 'proposal' : 'new'}>{i.type === 'hotel' ? 'Hotel' : 'Airline'}</Pill></td>
                    <td className="px-3 py-3">{shortDate(i.departureDate)}</td>
                    <td className="px-3 py-3 tabular-nums">{i.utilization}%</td>
                    <td className="px-5 py-3"><Pill tone={INV_STATUS_TONE[i.status] || 'neutral'}>{i.status}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
