import { Link } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import {
  Card,
  Eyebrow,
  StatusPill,
  Avatar,
  SeatMeter,
} from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { inr, shortDate } from '../lib/format.js'

function StatTile({ icon, label, value, sub, tone = 'primary' }) {
  const tones = {
    primary: 'bg-secondary text-primary',
    gold: 'bg-status-proposal-bg text-status-proposal',
    green: 'bg-status-won-bg text-status-won',
    blue: 'bg-status-new-bg text-status-new',
  }
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className="mt-3 text-[28px] font-bold leading-none tracking-tight">{value}</p>
      {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  )
}

export default function Dashboard() {
  const { user, stats, bookings, guestById, packageById, packages, pkgSeats } =
    useApp()
  const recent = bookings.slice(0, 5)
  const byPackage = packages
    .map((p) => ({ ...p, ...pkgSeats(p) }))
    .filter((p) => p.departures > 0)

  return (
    <>
      <TopBar
        title={`Welcome back, ${user?.name?.split(' ')[0]}`}
        subtitle="Here's what's moving across your packages today."
      />

      <div className="grid gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon="seat"
            label="Available seats"
            value={stats.availableSeats}
            sub={`of ${stats.totalSeats} across ${stats.departures} departures`}
            tone="primary"
          />
          <StatTile
            icon="ticket"
            label="Active bookings"
            value={stats.activeBookings}
            sub={`${stats.confirmed} confirmed`}
            tone="blue"
          />
          <StatTile
            icon="clock"
            label="Processing"
            value={stats.processing}
            sub={`${inr(stats.pipeline)} in pipeline`}
            tone="gold"
          />
          <StatTile
            icon="wallet"
            label="Confirmed revenue"
            value={inr(stats.revenue)}
            sub="Offline payments received"
            tone="green"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <h2 className="text-base font-bold">Recent bookings</h2>
                <p className="text-xs text-muted-foreground">Latest activity across all users</p>
              </div>
              <Link
                to="/bookings"
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-primary transition-colors hover:bg-muted"
              >
                View all <Icon name="chevronRight" size={15} />
              </Link>
            </div>
            <div className="border-t">
              {recent.map((b) => {
                const g = guestById(b.guestId)
                const p = packageById(b.packageId)
                return (
                  <div key={b.id} className="flex items-center gap-3 border-b px-5 py-3 last:border-b-0">
                    <Avatar name={g?.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{g?.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p?.destinationCity} · {b.seats} pax · {b.ref}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-sm font-semibold tabular-nums">{inr(b.amount)}</p>
                      <p className="text-xs text-muted-foreground">{shortDate(b.createdAt)}</p>
                    </div>
                    <StatusPill status={b.status} />
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">Seats by package</h2>
                <p className="text-xs text-muted-foreground">Live availability</p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary">
                <Icon name="trend" size={16} />
              </span>
            </div>
            <div className="mt-4 grid gap-4">
              {byPackage.map((p) => (
                <Link
                  key={p.id}
                  to={`/packages/${p.id}`}
                  className="flex items-center gap-3 rounded-lg p-1 -m-1 transition-colors hover:bg-muted"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                    <Icon name="mapPin" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.destinationCity}</p>
                    <p className="text-xs text-muted-foreground">{p.origin}</p>
                  </div>
                  <SeatMeter available={p.avail} total={p.total} />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
