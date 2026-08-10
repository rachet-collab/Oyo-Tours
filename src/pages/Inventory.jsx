import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Card } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'

// Inventory landing — an overview of navigable blocks. Each card is a doorway
// into a focused workspace (flights, hotels, bulk upload, vendors).
function Block({ icon, title, desc, stats, meter, cta, onClick }) {
  return (
    <Card
      onClick={onClick}
      className="group relative flex cursor-pointer flex-col gap-5 overflow-hidden p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      {/* Faint oversized glyph for texture */}
      <Icon name={icon} size={128} className="pointer-events-none absolute -right-5 -top-6 text-primary/[0.05]" />

      <div className="flex items-start justify-between">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary ring-1 ring-primary/10">
          <Icon name={icon} size={26} />
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border text-muted-foreground transition-colors group-hover:border-primary group-hover:bg-primary group-hover:text-white">
          <Icon name="chevronRight" size={16} />
        </span>
      </div>

      <div>
        <h2 className="text-lg font-bold tracking-[-0.01em]">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>

      {stats && (
        <div className="flex flex-wrap gap-2">
          {stats.map((st) => (
            <div key={st.label} className="min-w-[92px] flex-1 rounded-xl bg-muted/50 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{st.label}</p>
              <p className="text-xl font-bold tabular-nums">{st.value}</p>
            </div>
          ))}
        </div>
      )}

      {meter && (
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{meter.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{meter.pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${meter.pct}%` }} />
          </div>
        </div>
      )}

      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary">
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
    const pct = (list) => (list.length ? Math.round((list.filter((i) => i.status === 'Active').length / list.length) * 100) : 0)
    return {
      flightBlocks: flights.length,
      flightActive: flights.filter((i) => i.status === 'Active').length,
      flightSeats: activeFree(flights),
      flightPct: pct(flights),
      hotelBlocks: hotels.length,
      hotelActive: hotels.filter((i) => i.status === 'Active').length,
      hotelRooms: activeFree(hotels),
      hotelPct: pct(hotels),
      vendors: vendors.length,
    }
  }, [inventoryView, vendors])

  return (
    <>
      <TopBar title="Inventory" subtitle="Airline seat blocks and hotel room blocks — allocation, vendors & deadlines." />

      <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid gap-5 sm:grid-cols-2 xl:max-w-5xl">
          <Block
            icon="plane"
            title="Flight Inventory Overview"
            desc="Airline seat blocks — routes, dates, allocation & release deadlines."
            cta="Open flights"
            onClick={() => navigate('/inventory/flights')}
            stats={[
              { label: 'Blocks', value: stats.flightBlocks },
              { label: 'Active', value: stats.flightActive },
              { label: 'Seats free', value: stats.flightSeats },
            ]}
            meter={{ label: 'Active blocks', pct: stats.flightPct }}
          />
          <Block
            icon="building"
            title="Hotel Inventory Overview"
            desc="Hotel room blocks — properties, stays, rooming & release."
            cta="Open hotels"
            onClick={() => navigate('/inventory/hotels')}
            stats={[
              { label: 'Blocks', value: stats.hotelBlocks },
              { label: 'Active', value: stats.hotelActive },
              { label: 'Rooms free', value: stats.hotelRooms },
            ]}
            meter={{ label: 'Active blocks', pct: stats.hotelPct }}
          />
          <Block
            icon="upload"
            title="Bulk Upload"
            desc="Import flights, hotel blocks or vendors from Excel / CSV — with live progress."
            cta="Start an upload"
            onClick={() => navigate('/inventory/bulk-upload')}
          />
          <Block
            icon="users"
            title="Vendors"
            desc="Suppliers & consolidators, the blocks sourced from each, and bulk add."
            cta="Manage vendors"
            onClick={() => navigate('/vendors')}
            stats={[{ label: 'Vendors', value: stats.vendors }]}
          />
        </div>
      </div>
    </>
  )
}
