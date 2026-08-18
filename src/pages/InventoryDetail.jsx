import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Card, Eyebrow, Input, Modal, Pill, SeatMeter } from '../components/ui/primitives.jsx'
import InventoryImage from '../components/InventoryImage.jsx'
import { useApp } from '../store/AppStore.jsx'
import { INV_STATUS_TONE, INVENTORY_LABELS, OCCUPANCY } from '../store/data.js'
import { inr, shortDate, timeLabel, flightDuration } from '../lib/format.js'
import { blockCities, hotelOptionsForCity, travellersForBlock, downloadRooming, bookingsForBlock } from '../lib/rooming.js'

const cx = (...c) => c.filter(Boolean).join(' ')
const cityCode = (s = '') => (String(s).match(/\(([A-Za-z]{3})\)/)?.[1] || String(s).replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase()
const cityName = (s = '') => String(s).replace(/\s*\([A-Za-z]{3}\)\s*/, '').trim()

// Hotel detail is split into two tabs (mirrors the booking-detail tabs):
//   Inventory → rooms allocation + inventory by category
//   Rooming   → hotel-per-traveller + rooming-list progress
const HOTEL_TABS = [
  { key: 'inventory', label: 'Inventory', icon: 'boxes' },
  { key: 'rooming', label: 'Rooming', icon: 'building' },
]

function Bar({ pct, tone = 'bg-primary' }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className={cx('h-full rounded-full', tone)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

function DaysChip({ days }) {
  if (days == null) return null
  const tone = days < 0 ? 'urgent' : days <= 3 ? 'urgent' : days <= 7 ? 'proposal' : 'new'
  const text = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `${days}d left`
  return <Pill tone={tone}>{text}</Pill>
}

function DeadlineRow({ icon, label, date, days }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
      <span className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary text-primary"><Icon name={icon} size={15} /></span>
        <span>
          <span className="block text-sm font-semibold">{label}</span>
          <span className="block text-xs text-muted-foreground">{date ? shortDate(date) : '—'}</span>
        </span>
      </span>
      <DaysChip days={days} />
    </div>
  )
}

export default function InventoryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { inventoryById, packageById, releaseSeats, bookings, setBookingTravellers } = useApp()
  const inv = inventoryById(id)
  const [person, setPerson] = useState(null)
  const [invTab, setInvTab] = useState('inventory') // hotels only: 'inventory' | 'rooming'
  // Release-inventory modal (quantity + optional note; the action is logged).
  const [relOpen, setRelOpen] = useState(false)
  const [relQty, setRelQty] = useState('')
  const [relNote, setRelNote] = useState('')
  // Rooming edits are held as a local draft so the user gets an explicit Save
  // (with feedback) rather than a silent per-keystroke write.
  const SEP = '␟'
  const [roomDraft, setRoomDraft] = useState({})
  const [roomSaved, setRoomSaved] = useState(false)

  // Assign a hotel (for one city) to one traveller, persisting via the booking.
  const assignHotel = (bookingId, idx, city, val) => {
    const b = bookings.find((x) => x.id === bookingId)
    if (!b) return
    const details = (b.travellerDetails || []).map((t, i) =>
      (i === idx ? { ...t, hotelByCity: { ...(t.hotelByCity || {}), [city]: val } } : t))
    setBookingTravellers(bookingId, details)
  }

  const roomKey = (bookingId, idx, city) => `${bookingId}${SEP}${idx}${SEP}${city}`
  const roomVal = (r, city) => {
    const k = roomKey(r.bookingId, r.idx, city)
    return roomDraft[k] !== undefined ? roomDraft[k] : (r.hotelByCity[city] || '')
  }
  const editRoom = (r, city, val) => {
    setRoomDraft((d) => ({ ...d, [roomKey(r.bookingId, r.idx, city)]: val }))
    setRoomSaved(false)
  }
  const roomDirty = Object.keys(roomDraft).length > 0
  // Save all rooming edits — grouped per booking so multiple city changes for the
  // same traveller are applied together (not clobbered by successive writes).
  const saveRooming = () => {
    const byBooking = {}
    Object.entries(roomDraft).forEach(([k, v]) => {
      const [bid, idxS, city] = k.split(SEP)
      ;(byBooking[bid] ||= []).push({ idx: Number(idxS), city, val: v })
    })
    Object.entries(byBooking).forEach(([bid, changes]) => {
      const b = bookings.find((x) => x.id === bid)
      if (!b) return
      const details = (b.travellerDetails || []).map((t, i) => {
        const forI = changes.filter((c) => c.idx === i)
        if (!forI.length) return t
        const hotelByCity = { ...(t.hotelByCity || {}) }
        forI.forEach((c) => { hotelByCity[c.city] = c.val })
        return { ...t, hotelByCity }
      })
      setBookingTravellers(bid, details)
    })
    setRoomDraft({})
    setRoomSaved(true)
    setTimeout(() => setRoomSaved(false), 2500)
  }

  const L = INVENTORY_LABELS[inv?.type || 'airline']

  if (!inv) {
    return (
      <>
        <TopBar title="Inventory not found" />
        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <Link to="/inventory" className="text-sm font-semibold text-primary">← Back to inventory</Link>
        </div>
      </>
    )
  }

  const pkg = inv.packageId ? packageById(inv.packageId) : null
  const isHotel = (inv.type || 'airline') === 'hotel'
  // Clean, human ID: FL-<n> (flights) / HT-<n> (hotels), like PKG for packages.
  const invLabel = `${isHotel ? 'HT' : 'FL'}-${String(inv.inventoryId || inv.id || '').replace(/\D/g, '') || inv.id}`
  const showRelease = inv.available > 0 && inv.releaseDaysLeft != null && inv.releaseDaysLeft <= 7 &&
    inv.status === 'Active'

  // --- Per-category room ledger (hotels) -----------------------------------
  // Each hotel category (Deluxe, Super Deluxe, …) is its own pool: booking a
  // Deluxe room draws down Deluxe only, Super Deluxe stays intact. Purchased is
  // the per-city room split; allocated is rooms consumed by that category's
  // (non-cancelled) bookings; available is what's left.
  const roomsForBooking = (b) => {
    const p = b.pax || {}
    return Math.ceil((Number(p.adult) || 0) / 2) + (Number(p.single) || 0)
  }
  const catLedger = (() => {
    if (!isHotel || !Array.isArray(inv.cities) || inv.cities.length === 0) return []
    // Ordered, de-duped category list across all cities.
    const order = []
    inv.cities.forEach((c) => (c.categories || []).forEach((cat) => { if (!order.includes(cat)) order.push(cat) }))
    // Allocated rooms per category, from bookings linked to this block.
    const allocByCat = {}
    bookingsForBlock(bookings, inv).forEach((b) => {
      const cat = b.category || '—'
      allocByCat[cat] = (allocByCat[cat] || 0) + roomsForBooking(b)
    })
    return order.map((cat) => {
      // Capacity for the category = its per-city room split (one block per city,
      // so the same split applies in each city — take the largest declared).
      const purchased = Math.max(0, ...inv.cities.map((c) => Number(c.roomsByCategory?.[cat]) || 0))
      const cities = inv.cities.map((c) => {
        const idx = (c.categories || []).findIndex((x) => x === cat)
        return {
          city: c.city,
          rooms: Number(c.roomsByCategory?.[cat]) || 0,
          hotel: (idx >= 0 && c.hotels && c.hotels[idx]) || '—',
        }
      })
      const allocated = allocByCat[cat] || 0
      return { cat, purchased, allocated, available: Math.max(0, purchased - allocated), cities }
    })
  })()
  const catTotals = catLedger.reduce(
    (a, c) => ({ purchased: a.purchased + c.purchased, allocated: a.allocated + c.allocated }),
    { purchased: 0, allocated: 0 },
  )

  return (
    <>
      <TopBar
        title={invLabel}
        crumbLabel={invLabel}
        subtitle={`${inv.inventoryId} · ${inv.airline} · ${inv.sector}`}
      />

      {/* Release inventory — quantity + note; logged to the block's history */}
      <Modal
        open={relOpen}
        onClose={() => setRelOpen(false)}
        title={`Release ${L.unit}s`}
        subtitle={`Return unsold ${L.unit}s back to the ${isHotel ? 'hotel' : 'airline'}. This is logged.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRelOpen(false)}>Cancel</Button>
            <Button
              icon="check"
              disabled={!(Number(relQty) > 0) || Number(relQty) > inv.available}
              onClick={() => { releaseSeats(inv.id, Number(relQty), relNote); setRelOpen(false) }}
            >
              Release {Number(relQty) > 0 ? Number(relQty) : ''} {L.unit}{Number(relQty) === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {inv.available} {L.unit}{inv.available === 1 ? '' : 's'} available to release. Releasing everything closes the block (marks it Inactive).
          </p>
          <div className="max-w-[200px]">
            <Eyebrow className="mb-1">Quantity</Eyebrow>
            <Input type="number" min="1" max={inv.available} value={relQty} onChange={(e) => setRelQty(e.target.value)} />
          </div>
          <div>
            <Eyebrow className="mb-1">Reason / note (optional)</Eyebrow>
            <Input value={relNote} onChange={(e) => setRelNote(e.target.value)} placeholder="e.g. Released to airline ahead of deadline" />
          </div>
        </div>
      </Modal>

      <div className="grid gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {/* Release decision — surfaced at the very top so it can't be missed */}
        {showRelease && (
          <Card className="border-status-urgent/30 bg-status-urgent-bg/40 p-5">
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-urgent-bg text-status-urgent"><Icon name="clock" size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Release decision required</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {inv.available} unsold {L.unit}{inv.available > 1 ? 's' : ''} · release window closes {inv.releaseDaysLeft <= 0 ? 'today' : `in ${inv.releaseDaysLeft} day${inv.releaseDaysLeft > 1 ? 's' : ''}`}.
                  Retain them for late bookings, or release them back to the {inv.type === 'hotel' ? 'hotel' : 'airline'} before the deadline. Releasing everything closes the block (marks it Inactive).
                </p>
              </div>
              <Button size="sm" icon="check" onClick={() => releaseSeats(inv.id, inv.available)}>Release {inv.available} {L.unit}s</Button>
            </div>
          </Card>
        )}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="grid min-w-0 flex-1 gap-6">
          {inv.isPast && (
            <Card className="flex items-center gap-3 border-muted-foreground/20 bg-muted/40 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><Icon name="check" size={18} /></span>
              <div>
                <p className="text-sm font-bold">Inactive · travel date passed</p>
                <p className="text-xs text-muted-foreground">
                  {inv.type === 'hotel' ? 'Stay ended' : 'Travelled'} {inv.tripEnd ? shortDate(inv.tripEnd) : ''} — automatically marked Inactive and hidden from the active inventory list.
                  {inv.outstanding > 0 ? ' A balance is still outstanding — see Finance.' : ' Fully settled.'}
                </p>
              </div>
            </Card>
          )}
          {!inv.isPast && inv.fullyReleased && (
            <Card className="flex items-center gap-3 border-muted-foreground/20 bg-muted/40 p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"><Icon name="check" size={18} /></span>
              <div>
                <p className="text-sm font-bold">Inactive · fully released</p>
                <p className="text-xs text-muted-foreground">
                  All {inv.totalSeats} {inv.type === 'hotel' ? 'rooms' : 'seats'} have been released back to the {inv.type === 'hotel' ? 'hotel' : 'airline'} — nothing left to sell, so this block is automatically Inactive and hidden from the active list.
                </p>
              </div>
            </Card>
          )}
          {/* Property / route header */}
          <Card className="overflow-hidden">
            {isHotel && (inv.imageUrl || pkg?.coverUrl) ? (
              /* Hotels with a photo lead with a full-bleed property image */
              <div className="relative h-64 w-full sm:h-80">
                {(inv.imageUrl || pkg?.coverUrl) ? (
                  <img src={inv.imageUrl || pkg.coverUrl} alt={inv.airline} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-secondary text-muted-foreground"><Icon name="building" size={48} /></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                <div className="absolute right-4 top-4">
                  <Pill tone={INV_STATUS_TONE[inv.status] || 'neutral'}>{inv.status}</Pill>
                </div>
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">{inv.sector}</p>
                  <h2 className="mt-1 text-2xl font-bold leading-tight text-white drop-shadow sm:text-3xl">{inv.airline}</h2>
                  <p className="mt-0.5 text-sm font-medium text-white/90">{inv.flightNo}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between px-5 pt-5">
                <div className="flex items-start gap-3">
                  <InventoryImage inv={inv} size={52} />
                  <div>
                    <h2 className="text-lg font-bold">{inv.sector}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{inv.airline} · {inv.flightNo}</p>
                  </div>
                </div>
                <Pill tone={INV_STATUS_TONE[inv.status] || 'neutral'}>{inv.status}</Pill>
              </div>
            )}

            <div className="px-5 pb-5 pt-4">
              {/* Flights show the check-in/out + route summary. Hotels don't
                  capture check-in/check-out, so this card is hidden for them. */}
              {!isHotel && (
                <div className="grid grid-cols-2 gap-4 rounded-xl border p-4 sm:grid-cols-4">
                  <Metric label={L.anchor} value={shortDate(inv.departureDate) + (inv.departTime ? ` · ${timeLabel(inv.departTime)}` : '')} icon="calendar" />
                  <Metric label={L.ret} value={inv.returnDate ? shortDate(inv.returnDate) + (inv.returnDepartTime ? ` · ${timeLabel(inv.returnDepartTime)}` : '') : '—'} icon="calendar" />
                  <Metric label={L.from} value={inv.departureCity} icon="mapPin" small />
                  <Metric label={L.to} value={inv.arrivalCity} icon="mapPin" small />
                </div>
              )}
              {!isHotel && (
                <div className="mt-4 overflow-hidden rounded-xl border">
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
                    <Icon name="plane" size={15} className="text-primary" />
                    <h3 className="text-sm font-bold">Itinerary</h3>
                    <span className="rounded-full border bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Round trip</span>
                  </div>
                  <FlightLeg
                    tag="Outbound" inv={inv} date={inv.departureDate}
                    airline={inv.airline} flightNo={inv.flightNo}
                    fromCity={inv.departureCity} toCity={inv.arrivalCity}
                    depTime={inv.departTime} arrTime={inv.arriveTime}
                  />
                  <div className="relative border-t">
                    <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                      <span className="rounded-full border bg-card px-3 py-0.5 text-[11px] font-semibold text-muted-foreground">Return</span>
                    </div>
                  </div>
                  <FlightLeg
                    tag="Return" inv={inv} date={inv.returnDate}
                    airline={inv.returnAirline || inv.airline} flightNo={inv.returnFlightNo || inv.flightNo}
                    fromCity={inv.arrivalCity} toCity={inv.departureCity}
                    depTime={inv.returnDepartTime} arrTime={inv.returnArriveTime}
                  />
                </div>
              )}
              {pkg && (
                <div className="mt-4 overflow-hidden rounded-xl border">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Icon name="boxes" size={15} className="text-primary" />
                      <h3 className="text-sm font-bold">Linked package</h3>
                    </div>
                    <Link to={`/packages/${pkg.id}`} className="text-xs font-semibold text-primary hover:underline">View package →</Link>
                  </div>
                  <div className="grid gap-4 p-4">
                    <div className="flex items-center gap-3">
                      {pkg.coverUrl ? (
                        <img src={pkg.coverUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-lg">{pkg.emoji || '🧳'}</span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">{pkg.name}</p>
                        <p className="text-xs text-muted-foreground">{[pkg.code, pkg.durationLabel].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <Metric label="Route" value={[pkg.origin, pkg.destinationCity].filter(Boolean).join(' → ') || '—'} icon="mapPin" small />
                      <Metric label="Country" value={pkg.country || '—'} icon="mapPin" small />
                      <Metric label="Destinations" value={pkg.destinationsLabel || '—'} icon="mapPin" small />
                    </div>
                    {Array.isArray(pkg.categories) && pkg.categories.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Categories</span>
                        {pkg.categories.map((c) => (
                          <Pill key={c} tone={c === 'Super Deluxe' ? 'proposal' : 'neutral'}>{c}</Pill>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Hotel detail tabs — Inventory vs Rooming. Flights keep the single
              continuous layout below (no tabs). */}
          {isHotel && (
            <div className="-mb-px flex flex-wrap items-center gap-1 overflow-x-auto border-b">
              {HOTEL_TABS.map((t) => (
                <button key={t.key} type="button" onClick={() => setInvTab(t.key)}
                  className={cx('flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors',
                    invTab === t.key ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  <Icon name={t.icon} size={16} /> {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Inventory by category — each category is its own room pool; a
              booking in one category draws down only that category. Under each
              category we list its cities, room split & hotel. */}
          {isHotel && invTab === 'inventory' && catLedger.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <Eyebrow>Inventory by category</Eyebrow>
                <span className="text-xs font-semibold text-muted-foreground">{catLedger.length} {catLedger.length === 1 ? 'category' : 'categories'} · {inv.cities.length} {inv.cities.length === 1 ? 'city' : 'cities'}</span>
              </div>
              <div className="grid gap-3">
                {catLedger.map((cl) => {
                  const pct = cl.purchased ? Math.round((cl.allocated / cl.purchased) * 100) : 0
                  return (
                    <div key={cl.cat} className="rounded-xl border p-4">
                      {/* Category header + its own allocation ledger */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={cl.cat === 'Super Deluxe' ? 'proposal' : 'neutral'}>{cl.cat}</Pill>
                        <span className="rounded-lg bg-muted px-2.5 py-1 text-sm font-bold tabular-nums">{cl.purchased} <span className="text-xs font-medium text-muted-foreground">rooms</span></span>
                        <div className="ml-auto flex items-center gap-3 text-xs font-semibold">
                          <span className="text-muted-foreground">Allocated <span className="tabular-nums text-foreground">{cl.allocated}</span></span>
                          <span className={cl.available > 0 ? 'text-status-won' : 'text-status-urgent'}>Available <span className="tabular-nums">{cl.available}</span></span>
                        </div>
                      </div>
                      <div className="mt-2.5">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      </div>
                      {/* Cities under this category */}
                      <div className="mt-3 grid gap-2 border-t pt-3">
                        {cl.cities.map((cc) => (
                          <div key={cc.city} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-3">
                            <span className="flex shrink-0 items-center gap-2 sm:w-52">
                              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-primary"><Icon name="mapPin" size={13} /></span>
                              <span className="text-sm font-semibold">{cc.city}</span>
                              <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-bold tabular-nums">{cc.rooms} <span className="font-medium text-muted-foreground">rm</span></span>
                            </span>
                            <span className="text-sm text-muted-foreground">{cc.hotel}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Rooming — assign a hotel per city to each traveller + Excel export */}
          {isHotel && invTab === 'rooming' && blockCities(inv).length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Eyebrow>Rooming — hotel per traveller</Eyebrow>
                  {roomDirty && <span className="rounded-full bg-status-proposal-bg px-2 py-0.5 text-[11px] font-semibold text-status-proposal">Unsaved changes</span>}
                  {roomSaved && <span className="inline-flex items-center gap-1 rounded-full bg-status-won-bg px-2 py-0.5 text-[11px] font-semibold text-status-won"><Icon name="check" size={11} /> Saved</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" icon="check" disabled={!roomDirty} onClick={saveRooming}>Save rooming</Button>
                  <Button size="sm" variant="outline" icon="download" onClick={() => downloadRooming(inv, bookings)}>Export Excel</Button>
                </div>
              </div>
              {travellersForBlock(bookings, inv).length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No travellers yet. Once names are captured against bookings for this package, assign each a hotel per city here.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/60 text-left text-[13px] font-semibold text-muted-foreground">
                        <th className="px-3 py-2">Traveller</th>
                        <th className="px-3 py-2">Booking</th>
                        {blockCities(inv).map((c) => <th key={c} className="px-3 py-2">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {travellersForBlock(bookings, inv).map((r) => (
                        <tr key={`${r.bookingId}-${r.idx}`} className="border-t align-middle">
                          <td className="px-3 py-2">
                            <p className="font-medium">{r.name}</p>
                            {r.category && <p className="text-xs text-muted-foreground">{r.category}</p>}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.ref}</td>
                          {blockCities(inv).map((city) => {
                            const opts = hotelOptionsForCity(inv, city, r.category)
                            const listId = `h-${r.bookingId}-${r.idx}-${city.replace(/\W/g, '')}`
                            return (
                              <td key={city} className="px-3 py-2">
                                <Input value={roomVal(r, city)} placeholder="Type hotel" list={listId}
                                  onChange={(e) => editRoom(r, city, e.target.value)}
                                  className="h-9 min-w-[180px] text-xs" />
                                <datalist id={listId}>{opts.map((o) => <option key={o} value={o} />)}</datalist>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* Rooms allocation — hotels show it on the Inventory tab; flights always. */}
          {(!isHotel || invTab === 'inventory') && (
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <Eyebrow>{L.units} allocation</Eyebrow>
              <span className="text-xs font-semibold text-muted-foreground">{isHotel ? (inv.totalSeats ? Math.round((catTotals.allocated / inv.totalSeats) * 100) : 0) : inv.utilization}% utilized</span>
            </div>
            {isHotel ? (
              <>
                {(() => {
                  const allocated = catTotals.allocated
                  const available = Math.max(0, inv.totalSeats - allocated - (inv.releasedSeats || 0))
                  return (
                    <>
                      <SeatMeter available={available} total={inv.totalSeats} />
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Kpi label="Purchased" value={inv.totalSeats} />
                        <Kpi label="Allocated" value={allocated} />
                        <Kpi label="Available" value={available} tone={available > 0 ? 'text-status-won' : ''} />
                        <Kpi label="Released" value={inv.releasedSeats || 0} tone={inv.releasedSeats ? 'text-status-urgent' : ''} />
                      </div>
                    </>
                  )
                })()}
                {/* Per-category ledger — each pool depletes independently. */}
                <div className="mt-4 overflow-hidden rounded-xl border">
                  <div className="grid grid-cols-4 gap-2 border-b bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <span>Category</span><span className="text-right">Purchased</span><span className="text-right">Allocated</span><span className="text-right">Available</span>
                  </div>
                  {catLedger.map((cl) => (
                    <div key={cl.cat} className="grid grid-cols-4 items-center gap-2 border-t px-3 py-2 text-sm">
                      <span><Pill tone={cl.cat === 'Super Deluxe' ? 'proposal' : 'neutral'}>{cl.cat}</Pill></span>
                      <span className="text-right font-semibold tabular-nums">{cl.purchased}</span>
                      <span className="text-right font-semibold tabular-nums">{cl.allocated}</span>
                      <span className={`text-right font-semibold tabular-nums ${cl.available > 0 ? 'text-status-won' : 'text-status-urgent'}`}>{cl.available}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <SeatMeter available={inv.available} total={inv.totalSeats} />
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Kpi label="Purchased" value={inv.totalSeats} />
                  <Kpi label="Allocated" value={inv.allocatedSeats} />
                  <Kpi label="Available" value={inv.available} tone={inv.available > 0 ? 'text-status-won' : ''} />
                  <Kpi label="Released" value={inv.releasedSeats || 0} tone={inv.releasedSeats ? 'text-status-urgent' : ''} />
                </div>
              </>
            )}
            {(inv.history || []).some((h) => h.action === 'release') && (
              <div className="mt-4 border-t pt-4">
                <Eyebrow className="mb-2">Release log</Eyebrow>
                <div className="grid gap-1.5">
                  {(inv.history || []).filter((h) => h.action === 'release').slice().reverse().map((h, i) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-lg border px-3 py-2 text-sm">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-urgent-bg text-status-urgent"><Icon name="seat" size={13} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block">{h.note}</span>
                        <span className="block text-xs text-muted-foreground">{h.by}{h.at ? ` · ${shortDate(String(h.at).slice(0, 10))}` : ''}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
          )}

          {/* Naming / rooming-list progress + manifest. Hotels: Rooming tab; flights: always. */}
          {(!isHotel || invTab === 'rooming') && (
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <Eyebrow>{L.naming} progress</Eyebrow>
              <DaysChip days={inv.namingDaysLeft} />
            </div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold">{inv.namesCaptured} of {inv.allocatedSeats} names captured</span>
              <span className="text-muted-foreground">{inv.namingPct}%</span>
            </div>
            <Bar pct={inv.namingPct} tone={inv.namesPending > 0 ? 'bg-status-proposal' : 'bg-status-won'} />
            <p className="mt-2 text-xs text-muted-foreground">
              {inv.namesPending > 0
                ? `${inv.namesPending} name${inv.namesPending > 1 ? 's' : ''} still pending — ${L.namingDeadline.toLowerCase()} ${shortDate(inv.namingDeadline)}.`
                : 'All allocated travellers have been named.'}
            </p>

            <div className="mt-4 mb-3 flex items-center justify-between border-t pt-4">
              <Eyebrow>{inv.type === 'hotel' ? 'Rooming list' : 'Passenger manifest'}</Eyebrow>
              <span className="text-xs font-semibold text-muted-foreground">{inv.namesCaptured} named · {inv.namesPending} pending</span>
            </div>
            {inv.namesCaptured === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No names captured yet.</p>
            ) : (
              <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {(inv.manifest || []).map((m, i) => (
                  <button key={i} type="button" onClick={() => setPerson(m)}
                    className="group flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-muted">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-status-won-bg text-[10px] font-bold text-status-won">{i + 1}</span>
                    <span className="flex-1 truncate">{m.name}</span>
                    <Icon name="chevronRight" size={14} className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
                {Array.from({ length: Math.min(inv.namesPending, 12) }).map((_, i) => (
                  <div key={`p-${i}`} className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">•</span>
                    <span>Pending name</span>
                  </div>
                ))}
              </div>
            )}
            {inv.namesPending > 12 && <p className="mt-2 text-xs text-muted-foreground">…and {inv.namesPending - 12} more pending.</p>}
          </Card>
          )}

        </div>

        {/* Actions + vendors + notes */}
        <aside className="w-full min-w-0 lg:w-[340px] lg:shrink-0">
          <div className="grid gap-6 lg:sticky lg:top-24">
            {/* Actions */}
            <Card className="p-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  icon="seat"
                  disabled={inv.available <= 0}
                  onClick={() => { setRelQty(String(inv.available)); setRelNote(''); setRelOpen(true) }}
                >
                  Release {L.unit}s
                </Button>
                {/* Inventory is derived from the package — edit it at the source. */}
                <Button variant="outline" icon="edit"
                  onClick={() => (inv.packageId
                    ? navigate(`/packages/${inv.packageId}/edit`, { state: { returnTo: `${L.route}/${inv.id}` } })
                    : navigate(`${L.route}/${inv.id}/edit`))}>
                  Edit
                </Button>
              </div>
            </Card>

            {/* Operational deadlines — kept in the sidebar so they stay visible
                across both tabs (hotels) and alongside the block (flights). */}
            <Card className="p-5">
              <Eyebrow className="mb-3">Operational deadlines</Eyebrow>
              <div className="grid gap-2">
                {[
                  { icon: 'users', label: L.namingDeadline, date: inv.namingDeadline, days: inv.namingDaysLeft },
                  { icon: 'seat', label: L.releaseDeadline, date: inv.releaseDeadline, days: inv.releaseDaysLeft },
                ]
                  .slice()
                  .sort((a, b) => (a.days == null ? Infinity : a.days) - (b.days == null ? Infinity : b.days))
                  .map((d) => <DeadlineRow key={d.label} icon={d.icon} label={d.label} date={d.date} days={d.days} />)}
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <Eyebrow>Vendors</Eyebrow>
                <span className="text-xs font-semibold text-muted-foreground">{(inv.vendors || []).length}</span>
              </div>
              {(inv.vendors && inv.vendors.length) ? (
                <div className="flex flex-wrap gap-2">
                  {inv.vendors.map((v, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm font-medium">
                      <Icon name="users" size={14} className="text-primary" />{v}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No vendors attached yet.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon="edit" onClick={() => navigate(`${L.route}/${inv.id}/edit`)}>Manage vendors</Button>
                <Button size="sm" variant="ghost" icon="users" onClick={() => navigate('/vendors')}>All vendors</Button>
              </div>
            </Card>

            <Card className="p-5">
              <Eyebrow className="mb-2">Notes</Eyebrow>
              {inv.remarks
                ? <p className="whitespace-pre-line text-sm text-muted-foreground">{inv.remarks}</p>
                : <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No notes added.</p>}
            </Card>
          </div>
        </aside>
        </div>
      </div>

      <GuestProfileModal person={person} type={inv.type} onClose={() => setPerson(null)} onBooking={(bid) => { setPerson(null); navigate(`/bookings/${bid}`) }} />
    </>
  )
}

// Full traveller / guest profile — name, contact, passport & uploaded documents.
function GuestProfileModal({ person, type, onClose, onBooking }) {
  const { guestById, bookings } = useApp()
  const navigate = useNavigate()
  if (!person) return null
  const guest = person.guestId ? guestById?.(person.guestId) : null
  const guestBookings = person.guestId ? bookings.filter((b) => b.guestId === person.guestId) : []
  const rows = [
    ['Gender', person.gender],
    ['Mobile', person.phone],
    ['Email', person.email],
    ['Passport no.', person.passportNo],
    ['Issuing country', person.passportCountry],
    ['Passport expiry', person.passportExpiry ? shortDate(person.passportExpiry) : ''],
    ['Frequent flyer', person.frequentFlyer],
  ].filter(([, v]) => v)
  const docs = person.docs || []
  return (
    <Modal
      open={!!person}
      onClose={onClose}
      title={person.name || 'Traveller'}
      subtitle={person.bookingRef ? `Booking ${person.bookingRef}` : (type === 'hotel' ? 'Rooming list guest' : 'Passenger manifest')}
      width="max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {person.bookingId && <Button icon="arrowRight" onClick={() => onBooking(person.bookingId)}>View booking</Button>}
        </>
      }
    >
      <div className="grid gap-4">
        {rows.length > 0 ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className={cx('truncate font-medium', /passport|flyer/i.test(label) ? 'font-mono' : '')}>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No profile details captured for this traveller yet.</p>
        )}
        <div>
          <Eyebrow className="mb-2">Documents</Eyebrow>
          {docs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {docs.map((d, di) =>
                d.url ? (
                  <a key={di} href={d.url} download={d.name}
                    className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                    <Icon name="paperclip" size={13} className="text-primary" />
                    <span className="max-w-[180px] truncate">{d.name}</span>
                  </a>
                ) : (
                  <span key={di} className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-medium">
                    <Icon name="file" size={13} /> {d.name}
                  </span>
                ),
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed px-3 py-3 text-center text-xs text-muted-foreground">
              No documents on file. Passport / ID documents are uploaded during booking.
            </p>
          )}
        </div>

        {guest && (
          <div className="rounded-xl border p-3">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Icon name="users" size={13} className="text-muted-foreground" />
              <Eyebrow>Guest directory</Eyebrow>
            </div>
            <p className="text-sm font-semibold">{guest.name}</p>
            <p className="text-xs text-muted-foreground">{[guest.email, guest.phone, guest.city].filter(Boolean).join(' · ') || 'No contact details on file.'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{guestBookings.length} booking{guestBookings.length === 1 ? '' : 's'} on record.</p>
            {person.bookingId && (
              <button type="button" onClick={() => onBooking(person.bookingId)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                View booking <Icon name="chevronRight" size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

// A single boarding-pass style flight leg (departure → arrival) for the itinerary.
function FlightLeg({ tag, inv, date, fromCity, toCity, airline, flightNo, depTime, arrTime }) {
  const carrier = airline || inv.airline
  const fltNo = flightNo || inv.flightNo
  const dur = flightDuration(depTime, arrTime)
  // Use the uploaded logo only when this leg is the record's primary airline.
  const legImg = carrier === inv.airline ? inv.imageUrl : undefined
  return (
    <div className="grid grid-cols-1 items-center gap-6 px-5 py-5 sm:grid-cols-[minmax(150px,0.8fr)_1fr]">
      {/* Carrier + date */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">{date ? shortDate(date) : tag}</p>
        <div className="mt-2 flex items-center gap-2.5">
          <InventoryImage inv={{ type: 'airline', airline: carrier, imageUrl: legImg }} size={32} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{carrier}</p>
            <p className="text-[11px] text-muted-foreground">{tag} · <span className="font-mono">{fltNo}</span> · Economy</p>
          </div>
        </div>
      </div>

      {/* From — arrow — to */}
      <div className="flex items-center gap-4">
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none tracking-tight">{cityCode(fromCity)}</p>
          <p className="mt-1.5 truncate text-xs text-muted-foreground">{cityName(fromCity)}</p>
          {depTime && <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{timeLabel(depTime)}</p>}
        </div>
        <div className="flex flex-1 flex-col items-center px-1">
          {dur && <p className="mb-1 text-[11px] font-medium text-muted-foreground">{dur}</p>}
          <div className="flex w-full items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
            <div className="flex-1 border-t border-dashed border-border" />
            <Icon name="plane" size={12} className="mx-1 shrink-0 text-muted-foreground" />
            <div className="flex-1 border-t border-dashed border-border" />
            <span className="h-1.5 w-1.5 rounded-full bg-border" />
          </div>
        </div>
        <div className="min-w-0 text-right">
          <p className="text-2xl font-semibold leading-none tracking-tight">{cityCode(toCity)}</p>
          <p className="mt-1.5 truncate text-xs text-muted-foreground">{cityName(toCity)}</p>
          {arrTime && <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{timeLabel(arrTime)}</p>}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, icon, small }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary"><Icon name={icon} size={15} /></span>
      <div className="min-w-0">
        <Eyebrow>{label}</Eyebrow>
        <p className={cx('font-bold leading-tight', small ? 'text-xs' : 'text-sm')}>{value}</p>
      </div>
    </div>
  )
}
function Kpi({ label, value, tone = '' }) {
  return (
    <div className="rounded-xl border p-3 text-center">
      <p className={cx('text-2xl font-bold tabular-nums', tone)}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
