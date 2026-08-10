import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Card } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import icFlight from '../assets/nav/flight.svg?raw'
import icHotel from '../assets/nav/hotel.svg?raw'

const cx = (...c) => c.filter(Boolean).join(' ')

// One compact, uniform card. Flight/Hotel show stats + a slim utilisation meter
// (allocated ÷ purchased); Vendors shows a single count.
function StatCard({ icon, svg, title, stats, meter, cta, onClick }) {
  const tone = { bar: 'bg-success', text: 'text-success' }
  return (
    <Card
      onClick={onClick}
      className="group flex cursor-pointer flex-col gap-3.5 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
          {svg
            ? <span aria-hidden="true" className="inline-flex [&_svg]:h-[19px] [&_svg]:w-[19px]" dangerouslySetInnerHTML={{ __html: svg }} />
            : <Icon name={icon} size={17} />}
        </span>
        <h2 className="flex-1 truncate text-base font-bold tracking-[-0.01em]">{title}</h2>
        <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5">
          <Icon name="chevronRight" size={16} />
        </span>
      </div>

      {stats && (
        <div className="flex divide-x overflow-hidden rounded-xl border bg-muted/30">
          {stats.map((st) => (
            <div key={st.label} className="flex-1 px-3 py-2.5">
              <p className={cx('text-xl font-bold leading-none tabular-nums', st.tone)}>{st.value}</p>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">{st.label}</p>
            </div>
          ))}
        </div>
      )}

      {meter && (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">{meter.label}</span>
            <span className={cx('font-bold tabular-nums', tone.text)}>{meter.pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={cx('h-full rounded-full transition-[width] duration-500', tone.bar)} style={{ width: `${meter.pct}%` }} />
          </div>
        </div>
      )}

      <span className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-semibold">
        {cta} <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </span>
    </Card>
  )
}

export default function Inventory() {
  const { inventoryView, vendors } = useApp()
  const navigate = useNavigate()

  const stats = useMemo(() => {
    const flights = inventoryView.filter((i) => (i.type || 'airline') === 'airline')
    const hotels = inventoryView.filter((i) => i.type === 'hotel')
    const activeFree = (list) => list.filter((i) => i.status === 'Active').reduce((a, i) => a + i.available, 0)
    // Inventory utilisation = allocated ÷ purchased across the block set.
    const util = (list) => {
      const purchased = list.reduce((a, i) => a + (i.totalSeats || 0), 0)
      const allocated = list.reduce((a, i) => a + (i.allocatedSeats || 0), 0)
      return purchased ? Math.round((allocated / purchased) * 100) : 0
    }
    return {
      flightBlocks: flights.length,
      flightActive: flights.filter((i) => i.status === 'Active').length,
      flightSeats: activeFree(flights),
      flightPct: util(flights),
      hotelBlocks: hotels.length,
      hotelActive: hotels.filter((i) => i.status === 'Active').length,
      hotelRooms: activeFree(hotels),
      hotelPct: util(hotels),
      vendors: vendors.length,
    }
  }, [inventoryView, vendors])

  return (
    <>
      <TopBar title="Inventory" subtitle="Airline seat blocks and hotel room blocks — allocation, vendors & deadlines." />

      <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            svg={icFlight}
            title="Flight Inventory"
            desc="Airline seat blocks — routes, dates, allocation & release deadlines."
            cta="Open flights"
            onClick={() => navigate('/inventory/flights')}
            stats={[
              { label: 'Blocks', value: stats.flightBlocks },
              { label: 'Active', value: stats.flightActive, tone: 'text-success' },
              { label: 'Seats free', value: stats.flightSeats },
            ]}
            meter={{ label: 'Inventory utilisation', pct: stats.flightPct }}
          />
          <StatCard
            svg={icHotel}
            title="Hotel Inventory"
            desc="Hotel room blocks — properties, stays, rooming & release."
            cta="Open hotels"
            onClick={() => navigate('/inventory/hotels')}
            stats={[
              { label: 'Blocks', value: stats.hotelBlocks },
              { label: 'Active', value: stats.hotelActive, tone: 'text-success' },
              { label: 'Rooms free', value: stats.hotelRooms },
            ]}
            meter={{ label: 'Inventory utilisation', pct: stats.hotelPct }}
          />
          <StatCard
            icon="users"
            title="Vendors"
            desc="Suppliers & consolidators, and the blocks sourced from each."
            cta="Manage vendors"
            onClick={() => navigate('/vendors')}
            stats={[{ label: 'Vendors', value: stats.vendors }]}
          />
        </div>
      </div>
    </>
  )
}
