import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import CityCover from '../components/ui/CityCover.jsx'
import {
  Avatar,
  Button,
  Card,
  Eyebrow,
  Field,
  Input,
  Pill,
  SeatMeter,
  Select,
} from '../components/ui/primitives.jsx'
import InventoryImage from '../components/InventoryImage.jsx'
import { useApp, priceFor } from '../store/AppStore.jsx'
import { OCCUPANCY } from '../store/data.js'
import { inr, shortDate } from '../lib/format.js'
import { downloadGuestQuote } from '../lib/packageQuote.js'
import { advancePerSeat } from '../lib/policy.js'

const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (key) => { const [y, m] = key.split('-'); return `${MONTHS_ABBR[+m - 1]} ${y}` }
// Crisp travel-date range: "16–21 Oct 2026" · "30 Oct – 4 Nov 2026" · cross-year full.
const crispRange = (a, b) => {
  if (!a) return ''
  const [ya, ma, da] = a.split('-').map(Number)
  if (!b || b === a) return `${da} ${MONTHS_ABBR[ma - 1]} ${ya}`
  const [yb, mb, db] = b.split('-').map(Number)
  if (ya === yb && ma === mb) return `${da}–${db} ${MONTHS_ABBR[ma - 1]} ${ya}`
  if (ya === yb) return `${da} ${MONTHS_ABBR[ma - 1]} – ${db} ${MONTHS_ABBR[mb - 1]} ${ya}`
  return `${da} ${MONTHS_ABBR[ma - 1]} ${ya} – ${db} ${MONTHS_ABBR[mb - 1]} ${yb}`
}

const cx = (...c) => c.filter(Boolean).join(' ')
const MAX_ADULTS = 3 // allowed occupancy: 2 + 1 on extra bed
const newRoom = () => ({ adults: 2, children: [] }) // children: 'with' | 'without'
// Full passenger profile captured against each traveller / the lead guest.
const emptyForm = () => ({
  firstName: '', lastName: '', gender: '',
  countryCode: '+91', mobile: '', email: '',
  passportNo: '', passportCountry: '', passportExpiry: '', frequentFlyer: '',
  docs: [], // {name,url}
})
const COUNTRY_CODES = ['+91', '+1', '+44', '+971', '+65', '+66', '+62', '+94', '+977', '+60']

// Convert a rooms configuration into occupancy pax counts used for pricing.
function computePax(rooms) {
  const pax = { adult: 0, extraBed: 0, cwb: 0, cnb: 0, single: 0 }
  rooms.forEach((r) => {
    if (r.adults <= 1) pax.single += 1
    else {
      pax.adult += 2
      if (r.adults > 2) pax.extraBed += r.adults - 2
    }
    r.children.forEach((c) => (c === 'with' ? (pax.cwb += 1) : (pax.cnb += 1)))
  })
  return pax
}
const roomsTravellers = (rooms) => rooms.reduce((s, r) => s + r.adults + r.children.length, 0)

// One entry per person that needs details captured (across all rooms).
function travellerSlots(rooms) {
  const slots = []
  rooms.forEach((r, ri) => {
    for (let a = 0; a < r.adults; a++) slots.push({ room: ri, type: 'adult', label: `Adult ${a + 1}` })
    r.children.forEach((c, ci) => slots.push({ room: ri, type: 'child', bed: c, label: `Child ${ci + 1}` }))
  })
  return slots
}

const readFile = (file) =>
  new Promise((res) => {
    const r = new FileReader()
    r.onload = () => res({ name: file.name, url: r.result })
    r.readAsDataURL(file)
  })

export default function Checkout() {
  const app = useApp()
  const { packages, departuresForPackage, bookableDeparturesForPackage, packageById, available, addBooking, addGuest, inventoryForBooking } = app
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const prefillPackage = params.get('package') || ''
  const prefillDeparture = params.get('departure') || ''

  const [pkgId, setPkgId] = useState(prefillPackage)
  const [category, setCategory] = useState(() => {
    const p = prefillPackage ? packageById(prefillPackage) : null
    return p && p.categories.length === 1 ? p.categories[0] : ''
  })
  const [departureId, setDepartureId] = useState(prefillDeparture)
  const [rooms, setRooms] = useState([newRoom()])
  const [guestForms, setGuestForms] = useState([]) // per-traveller {firstName,lastName,docs}
  const [addOnQty, setAddOnQty] = useState({}) // add-on index -> quantity
  const [advanceNote, setAdvanceNote] = useState('') // advance payment reference (required to book)
  const [done, setDone] = useState(null)
  const [booking, setBooking] = useState(false) // true while the booking is being created
  const [bookErr, setBookErr] = useState('')
  const [depMonth, setDepMonth] = useState('') // travel-date month filter (YYYY-MM)

  const pkg = pkgId ? packageById(pkgId) : null
  const multiCat = pkg ? pkg.categories.length > 1 : false
  const departures = pkgId ? bookableDeparturesForPackage(pkgId) : []
  const depMonths = useMemo(
    () => [...new Set(departures.map((d) => (d.date || '').slice(0, 7)).filter(Boolean))].sort(),
    [departures],
  )
  const shownDepartures = useMemo(
    () => (depMonth ? departures.filter((d) => (d.date || '').slice(0, 7) === depMonth) : departures)
      .slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))),
    [departures, depMonth],
  )
  const departure = departures.find((d) => d.id === departureId)
  const grid = departure && category ? departure.pricing[category] : null
  // Preferred-property step: cities where the selected category offers >1 hotel.
  const parseOpts = (str) => String(str || '').split('/').map((x) => x.trim()).filter(Boolean).filter((x) => !/similar/i.test(x))
  const propertyRows = useMemo(() => {
    const rowsH = pkg && category ? (pkg.hotels?.find((h) => h.category === category)?.rows || []) : []
    return rowsH.map((r) => ({ city: r.city, options: parseOpts(r.options) })).filter((r) => r.city)
  }, [pkg, category])
  const needsProperty = propertyRows.length > 0
  // Free-text preferred property per city (keyed by city name).
  const [propertyPrefs, setPropertyPrefs] = useState({})
  const setCityPref = (city, val) => setPropertyPrefs((p) => ({ ...p, [city]: val }))
  const cityPrefs = () => propertyRows
    .map((r) => ({ city: r.city, property: String(propertyPrefs[r.city] || '').trim() }))
    .filter((x) => x.property)
  const pax = useMemo(() => computePax(rooms), [rooms])
  const slots = useMemo(() => travellerSlots(rooms), [rooms])
  const seats = roomsTravellers(rooms)
  const addOnsList = pkg?.addOns || []
  const addOnsSelected = addOnsList
    .map((a, i) => ({ ...a, qty: addOnQty[i] || 0 }))
    .filter((a) => a.qty > 0)
  const addOnsTotal = addOnsSelected.reduce((s, a) => s + a.qty * (a.price || 0), 0)
  const amount = (grid ? priceFor(grid, pax) : 0) + addOnsTotal
  // Advance (booking amount) that must be collected before the booking can be made.
  const advanceDue = pkg ? Math.round(advancePerSeat(pkg) * seats) : 0
  const advanceOk = advanceDue <= 0 || advanceNote.trim().length > 0
  // Linked airline + hotel inventory this package/date books against.
  const linkedInv = useMemo(
    () => (pkgId ? inventoryForBooking(pkgId, departure?.date) : { airline: null, hotel: null }),
    [pkgId, departure?.date, inventoryForBooking],
  )
  // Availability is the min of the departure's own seats and the linked airline
  // inventory's available seats (prevents over-allocation against inventory).
  const seatsLeft = Math.min(
    departure ? available(departure) : 0,
    linkedInv.airline ? linkedInv.airline.available : Infinity,
  )
  const roomsLeft = linkedInv.hotel ? linkedInv.hotel.available : Infinity
  const lead = guestForms[0]
  const leadName = lead ? `${lead.firstName} ${lead.lastName}`.trim() : ''

  // Steps: Travel date → Category (multi-tier only) → Travellers → Guest details → Review.
  const stepKeys = useMemo(
    () => [
      ...(prefillPackage ? [] : ['package']),
      'departure',
      ...(multiCat ? ['category'] : []),
      'pax',
      ...(needsProperty ? ['property'] : []),
      'guests',
      'review',
    ],
    [prefillPackage, multiCat, needsProperty],
  )
  const STEP_LABEL = { package: 'Package', departure: 'Travel date', category: 'Category', pax: 'Travellers', property: 'Hotels', guests: 'Guest details', review: 'Review' }
  const [stepKey, setStepKey] = useState(
    prefillPackage ? (prefillDeparture ? (multiCat ? 'category' : 'pax') : 'departure') : 'package',
  )
  const idx = Math.max(0, stepKeys.indexOf(stepKey))

  const choosePackage = (id) => {
    setPkgId(id)
    setDepartureId('')
    const p = packageById(id)
    setCategory(p.categories.length === 1 ? p.categories[0] : '')
  }

  // room helpers
  const patchRoom = (i, patch) => setRooms((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const setAdults = (i, n) => patchRoom(i, { adults: Math.max(1, Math.min(MAX_ADULTS, n)) })
  const addChild = (i) => setRooms((rs) => rs.map((r, idx) => (idx === i ? { ...r, children: [...r.children, 'with'] } : r)))
  const setChildBed = (i, ci, val) =>
    setRooms((rs) => rs.map((r, idx) => (idx === i ? { ...r, children: r.children.map((c, k) => (k === ci ? val : c)) } : r)))
  const removeChild = (i, ci) =>
    setRooms((rs) => rs.map((r, idx) => (idx === i ? { ...r, children: r.children.filter((_, k) => k !== ci) } : r)))

  // guest-detail helpers (reconcile to current slot count on every edit)
  const reconcile = (arr) => slots.map((_, k) => arr[k] || emptyForm())
  const setForm = (i, patch) => setGuestForms((arr) => { const n = reconcile(arr); n[i] = { ...n[i], ...patch }; return n })
  const addDocs = async (i, fileList) => {
    const read = await Promise.all([...fileList].map(readFile))
    setGuestForms((arr) => { const n = reconcile(arr); n[i] = { ...n[i], docs: [...n[i].docs, ...read] }; return n })
  }
  const removeDoc = (i, di) =>
    setGuestForms((arr) => { const n = reconcile(arr); n[i] = { ...n[i], docs: n[i].docs.filter((_, k) => k !== di) }; return n })

  const guestsOk =
    slots.length > 0 &&
    slots.every((_, i) => {
      const f = guestForms[i]
      return f && f.firstName.trim() && f.lastName.trim() && f.docs.length > 0
    })
  const canNext = {
    package: !!pkgId,
    departure: !!departureId,
    category: !!category,
    pax: seats >= 1 && seats <= seatsLeft && rooms.length <= roomsLeft,
    property: true,
    guests: guestsOk,
    review: true,
  }[stepKey]

  const next = () => {
    const i = stepKeys.indexOf(stepKey)
    if (i < stepKeys.length - 1) setStepKey(stepKeys[i + 1])
  }
  const back = () => {
    const i = stepKeys.indexOf(stepKey)
    if (i > 0) setStepKey(stepKeys[i - 1])
    else navigate(-1)
  }
  const confirm = async () => {
    if (booking) return
    setBookErr('')
    const forms = reconcile(guestForms)
    const names = forms.map((f) => `${f.firstName} ${f.lastName}`.trim()).filter(Boolean)
    const leadForm = forms[0] || emptyForm()
    const gid = addGuest({
      name: leadName || 'Guest',
      phone: leadForm.mobile ? `${leadForm.countryCode} ${leadForm.mobile}`.trim() : '',
      email: leadForm.email || '',
      city: '',
      passportNo: leadForm.passportNo || '',
    }).id
    setBooking(true)
    const res = await addBooking({
      guestId: gid, packageId: pkgId, departureId, category, pax, amount,
      advanceAmount: advanceDue,
      advancePaid: advanceDue > 0,
      paymentNote: advanceDue > 0 ? `Advance ${inr(advanceDue)} collected${advanceNote.trim() ? ` — ${advanceNote.trim()}` : ''}` : '',
      rooms, travellers: names,
      hotelPreferences: cityPrefs(),
      travellerDetails: forms.map((f, i) => ({
        ...slots[i],
        firstName: f.firstName, lastName: f.lastName, gender: f.gender,
        phone: f.mobile ? `${f.countryCode} ${f.mobile}`.trim() : '',
        email: f.email,
        passportNo: f.passportNo, passportCountry: f.passportCountry,
        passportExpiry: f.passportExpiry, frequentFlyer: f.frequentFlyer,
        docs: f.docs,
      })),
      addOns: addOnsSelected,
      // consume the linked airline + hotel inventory and roll names into their manifests
      airlineInventoryId: linkedInv.airline?.id,
      hotelInventoryId: linkedInv.hotel?.id,
      travellerNames: names,
    })
    setBooking(false)
    if (res?.error) { setBookErr(res.error.message || 'Could not create the booking. Please try again.'); return }
    setDone({ ...res.booking, leadName: leadName || 'your guest' })
  }

  /* --------------------------------------------------- confirmation --- */
  if (done) {
    return (
      <>
        <TopBar title="Booking confirmed" subtitle="Your seats are held." />
        <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
          <Card className="overflow-hidden text-center">
            <div className="flex flex-col items-center gap-3 px-8 pt-10">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-status-won-bg text-status-won">
                <Icon name="check" size={30} />
              </span>
              <h2 className="text-2xl font-bold tracking-tight">Booking confirmed 🎉</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Seats are reserved for {done.leadName}. Reference{' '}
                <span className="font-mono font-semibold text-foreground">{done.ref}</span>.
              </p>
            </div>
            <div className="mx-8 mt-6 grid gap-2 rounded-2xl border p-4 text-left">
              <Row label="Package" value={pkg?.destinationCity} sub={`${pkg?.origin} · ${category}`} />
              <Row label="Travel date" value={departure ? `${shortDate(departure.date)} → ${shortDate(departure.returnDate)}` : ''} sub={departure ? `${departure.outbound.flightNo} / ${departure.inbound.flightNo}` : ''} />
              <Row label="Rooms" value={`${rooms.length} room${rooms.length > 1 ? 's' : ''}`} sub={`${seats} traveller${seats > 1 ? 's' : ''}`} />
              <div className="mt-1 flex items-center justify-between border-t pt-3">
                <span className="text-sm font-semibold">Total amount</span>
                <span className="text-xl font-bold tabular-nums">{inr(done.amount)}</span>
              </div>
            </div>
            <div className="mx-8 mt-4 flex items-start gap-3 rounded-xl bg-status-proposal-bg px-4 py-3 text-left text-status-proposal">
              <Icon name="wallet" size={18} className="mt-0.5" />
              <p className="text-[13px] leading-relaxed">
                This booking is <strong>Processing</strong>. Pay the booking amount offline — our team will confirm your seats once payment is received.
              </p>
            </div>
            <div className="flex flex-col gap-2 p-8 sm:flex-row sm:justify-center">
              <Button variant="outline" onClick={() => navigate('/bookings')}>View my bookings</Button>
              <Button onClick={() => navigate('/packages')} icon="arrowRight">Explore more packages</Button>
            </div>
          </Card>
        </div>
      </>
    )
  }

  /* --------------------------------------------------------- checkout --- */
  return (
    <>
      <TopBar
        title="Checkout"
        subtitle="Complete your booking in a few steps."
      />

      <div className="grid gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            {/* Stepper */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-b px-6 py-4">
              {stepKeys.map((k, i) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                    i < idx ? 'bg-primary text-primary-foreground' : i === idx ? 'bg-secondary text-primary ring-2 ring-ring/25' : 'bg-muted text-muted-foreground')}>
                    {i < idx ? <Icon name="check" size={13} /> : i + 1}
                  </span>
                  <span className={cx('text-xs font-semibold', i === idx ? 'text-foreground' : 'text-muted-foreground')}>{STEP_LABEL[k]}</span>
                  {i < stepKeys.length - 1 && <span className="mx-1 h-px w-5 bg-border" />}
                </div>
              ))}
            </div>

            <div className="p-6">
              {stepKey === 'package' && (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {packages.filter((p) => p.active !== false).map((p) => {
                    const left = bookableDeparturesForPackage(p.id).reduce((s, d) => s + available(d), 0)
                    const disabled = left === 0
                    return (
                      <button key={p.id} disabled={disabled} onClick={() => choosePackage(p.id)}
                        className={cx('flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors',
                          pkgId === p.id ? 'border-primary ring-2 ring-ring/15' : 'hover:bg-muted', disabled && 'opacity-45')}>
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-muted-foreground"><Icon name="mapPin" size={18} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{p.destinationCity}</p>
                          <p className="text-xs text-muted-foreground">{p.origin} · {p.durationLabel}</p>
                        </div>
                        <Pill tone={disabled ? 'urgent' : 'won'}>{disabled ? 'Sold out' : `${left} left`}</Pill>
                      </button>
                    )
                  })}
                </div>
              )}

              {stepKey === 'departure' && (
                <div className="grid gap-3">
                  {/* Month filter */}
                  {depMonths.length > 1 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Month</span>
                      <div className="w-44">
                        <Select value={depMonth} onChange={(e) => setDepMonth(e.target.value)}>
                          <option value="">All months</option>
                          {depMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                        </Select>
                      </div>
                      <span className="ml-auto text-xs text-muted-foreground">{shownDepartures.length} departure{shownDepartures.length === 1 ? '' : 's'}</span>
                    </div>
                  )}

                  {shownDepartures.length === 0 && (
                    <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No departures for this package yet.</p>
                  )}
                  {shownDepartures.map((d) => {
                    const left = available(d)
                    const price = category ? d.pricing[category]?.adult : Math.min(...Object.values(d.pricing).map((g) => g.adult))
                    const disabled = left === 0
                    return (
                      <button key={d.id} disabled={disabled} onClick={() => setDepartureId(d.id)}
                        className={cx('flex items-center gap-4 rounded-xl border p-3.5 text-left transition-colors',
                          departureId === d.id ? 'border-primary ring-2 ring-ring/15' : 'hover:bg-muted', disabled && 'opacity-45')}>
                        {/* Flight logo */}
                        <InventoryImage inv={{ type: 'airline', airline: d.outbound?.airline, imageUrl: d.outbound?.logoUrl }} size={44} className="shrink-0" />
                        {/* Arrival & departure dates */}
                        <div className="min-w-0 w-44 shrink-0">
                          <p className="font-semibold">{crispRange(d.date, d.returnDate)}</p>
                          <p className="text-xs text-muted-foreground">{d.outbound?.airline} {d.outbound?.flightNo}</p>
                        </div>
                        {/* Seats progress bar */}
                        <div className="min-w-0 flex-1">
                          <SeatMeter available={left} total={d.seatsTotal} />
                          <p className="mt-1.5 text-xs text-muted-foreground">{disabled ? 'Sold out' : `${left} of ${d.seatsTotal} seats left`}</p>
                        </div>
                        {/* Price */}
                        <div className="shrink-0 text-right">
                          <p className="font-bold tabular-nums">{price ? inr(price) : '—'}</p>
                          <p className="text-xs text-muted-foreground">per adult</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {stepKey === 'category' && pkg && (
                <div className="grid gap-2.5">
                  {pkg.categories.map((c) => {
                    const from = Math.min(...departures.map((d) => d.pricing[c]?.adult || Infinity))
                    return (
                      <button key={c} onClick={() => setCategory(c)}
                        className={cx('flex items-center gap-3 rounded-xl border p-4 text-left transition-colors',
                          category === c ? 'border-primary ring-2 ring-ring/15' : 'hover:bg-muted')}>
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary"><Icon name="building" size={18} /></span>
                        <div className="flex-1">
                          <p className="font-bold">{c}</p>
                          <p className="text-xs text-muted-foreground">{c === 'Super Deluxe' ? '4-star hotels' : c === 'Deluxe' ? '3-star hotels' : 'Standard hotels'}</p>
                        </div>
                        <div className="text-right"><p className="text-xs text-muted-foreground">from</p><p className="font-bold tabular-nums">{isFinite(from) ? inr(from) : '—'}</p></div>
                      </button>
                    )
                  })}
                </div>
              )}

              {stepKey === 'pax' && (
                <div className="grid gap-6">
                  {/* Rooms & occupancy */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <Eyebrow>Rooms & occupancy</Eyebrow>
                      <Button variant="outline" size="sm" icon="plus" onClick={() => setRooms((rs) => [...rs, newRoom()])}>Add room</Button>
                    </div>
                    <div className="grid gap-3">
                      {rooms.map((room, ri) => (
                        <div key={ri} className="rounded-xl border p-4">
                          <div className="mb-3 flex items-center justify-between">
                            <p className="text-sm font-bold">Room {ri + 1}</p>
                            {rooms.length > 1 && (
                              <button onClick={() => setRooms((rs) => rs.filter((_, k) => k !== ri))} className="text-xs font-semibold text-status-urgent hover:underline">Remove</button>
                            )}
                          </div>
                          {/* Adults */}
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">Adults</p>
                              <p className="text-xs text-muted-foreground">Allowed occupancy: 2 · up to {MAX_ADULTS} with extra bed</p>
                            </div>
                            <Stepper value={room.adults} min={1} max={MAX_ADULTS} onChange={(v) => setAdults(ri, v)} />
                          </div>
                          {room.adults === 1 && <p className="mt-1 text-xs font-semibold text-status-proposal">Single occupancy{grid ? ` · ${inr(grid.single)}` : ''}</p>}
                          {room.adults > 2 && <p className="mt-1 text-xs font-semibold text-status-proposal">{room.adults - 2} adult on extra bed{grid ? ` · ${inr(grid.extraBed)} each` : ''}</p>}

                          {/* Children */}
                          <div className="mt-3 border-t pt-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-semibold">Children</p>
                              <Button variant="ghost" size="sm" icon="plus" onClick={() => addChild(ri)}>Add child</Button>
                            </div>
                            {room.children.map((c, ci) => (
                              <div key={ci} className="mt-2 rounded-xl border bg-muted/20 p-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold">Child {ci + 1}</span>
                                  <button onClick={() => removeChild(ri, ci)} className="inline-flex items-center gap-1 text-xs font-semibold text-status-urgent hover:underline">
                                    <Icon name="x" size={12} /> Remove
                                  </button>
                                </div>
                                <p className="mb-2 mt-0.5 text-xs text-muted-foreground">Choose a bed option — this changes the price for this child.</p>
                                <div className="grid grid-cols-2 gap-2">
                                  <BedOption active={c === 'with'} onClick={() => setChildBed(ri, ci, 'with')} title="With bed" price={grid?.cwb} />
                                  <BedOption active={c === 'without'} onClick={() => setChildBed(ri, ci, 'without')} title="Without bed" price={grid?.cnb} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {seats > seatsLeft && <p className="mt-2 text-xs font-semibold text-status-urgent">Only {seatsLeft} seats available on this date.</p>}
                    {rooms.length > roomsLeft && <p className="mt-1 text-xs font-semibold text-status-urgent">Only {roomsLeft} rooms available in the hotel block.</p>}
                    {(linkedInv.airline || linkedInv.hotel) && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Live inventory:
                        {linkedInv.airline && ` ${linkedInv.airline.available} of ${linkedInv.airline.totalSeats} seats`}
                        {linkedInv.airline && linkedInv.hotel && ' ·'}
                        {linkedInv.hotel && ` ${linkedInv.hotel.available} of ${linkedInv.hotel.totalSeats} rooms`}
                        {' '}available.
                      </p>
                    )}
                  </div>

                  {/* Optional add-ons */}
                  {addOnsList.length > 0 && (
                    <div>
                      <Eyebrow className="mb-2">Add-ons <span className="normal-case text-muted-foreground/70">(optional)</span></Eyebrow>
                      <div className="grid gap-2">
                        {addOnsList.map((a, i) => {
                          const qty = addOnQty[i] || 0
                          return (
                            <div key={i} className="flex items-center gap-3 rounded-xl border p-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold">{a.item}</p>
                                <p className="text-xs text-muted-foreground">{inr(a.price)} per person</p>
                              </div>
                              <Stepper value={qty} min={0} max={seats} onChange={(v) => setAddOnQty((q) => ({ ...q, [i]: Math.max(0, Math.min(seats, v)) }))} />
                            </div>
                          )
                        })}
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">Choose how many travellers each add-on is for. Added to your total below.</p>
                    </div>
                  )}
                </div>
              )}

              {stepKey === 'property' && (
                <div className="grid gap-4">
                  <div>
                    <Eyebrow>Preferred properties</Eyebrow>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Optional — note a preferred hotel for each city. Final confirmation is subject to availability.
                    </p>
                  </div>
                  {propertyRows.map((r) => (
                    <Field key={r.city} label={r.city}>
                      <Input
                        value={propertyPrefs[r.city] || ''}
                        onChange={(e) => setCityPref(r.city, e.target.value)}
                        placeholder={r.options.length ? `e.g. ${r.options[0]}` : 'Preferred hotel'}
                      />
                    </Field>
                  ))}
                </div>
              )}

              {stepKey === 'guests' && (
                <div className="grid gap-4">
                  <div>
                    <Eyebrow>Traveller details</Eyebrow>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Capture each traveller's passport-name, contact and passport details. The first traveller is treated as the lead guest.
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5 rounded-xl border border-status-proposal/30 bg-status-proposal-bg/50 px-4 py-3 text-[13px] leading-relaxed text-status-proposal">
                    <Icon name="clock" size={16} className="mt-0.5 shrink-0" />
                    <p>
                      Enter each name exactly as on the passport. The passport should be valid for at least 6 months from the travel date.
                      Ensure the Frequent Flyer number matches the passenger name, or the airline won't credit the points.
                    </p>
                  </div>
                  {slots.map((slot, i) => {
                    const f = guestForms[i] || emptyForm()
                    return (
                      <div key={i} className="rounded-xl border p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary text-xs font-bold text-primary">
                            {slot.type === 'adult' ? <Icon name="users" size={14} /> : <Icon name="sparkle" size={14} />}
                          </span>
                          <span className="text-sm font-bold">{slot.label}</span>
                          <span className="text-xs text-muted-foreground">
                            Room {slot.room + 1}{slot.type === 'child' ? ` · ${slot.bed === 'with' ? 'with bed' : 'no bed'}` : ''}
                          </span>
                          {i === 0 && <Pill tone="proposal" className="ml-auto">Lead guest</Pill>}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="First & middle name" required>
                            <Input value={f.firstName} onChange={(e) => setForm(i, { firstName: e.target.value })} placeholder="As on passport" />
                          </Field>
                          <Field label="Last name" required>
                            <Input value={f.lastName} onChange={(e) => setForm(i, { lastName: e.target.value })} placeholder="As on passport" />
                          </Field>
                        </div>
                        <div className="mt-3">
                          <Field label="Gender">
                            <div className="grid max-w-xs grid-cols-2 gap-2">
                              {['Male', 'Female'].map((g) => (
                                <button key={g} type="button" onClick={() => setForm(i, { gender: g })}
                                  className={cx('rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
                                    f.gender === g ? 'border-primary bg-secondary text-secondary-foreground ring-2 ring-ring/20' : 'text-muted-foreground hover:bg-muted')}>
                                  {g}
                                </button>
                              ))}
                            </div>
                          </Field>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <Field label="Country code">
                            <Select value={f.countryCode} onChange={(e) => setForm(i, { countryCode: e.target.value })}>
                              {COUNTRY_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </Select>
                          </Field>
                          <Field label="Mobile no.">
                            <Input value={f.mobile} onChange={(e) => setForm(i, { mobile: e.target.value })} placeholder="Optional" inputMode="tel" />
                          </Field>
                          <Field label="Email">
                            <Input type="email" value={f.email} onChange={(e) => setForm(i, { email: e.target.value })} placeholder="Optional" />
                          </Field>
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <Field label="Passport no.">
                            <Input value={f.passportNo} onChange={(e) => setForm(i, { passportNo: e.target.value.toUpperCase() })} placeholder="Optional" />
                          </Field>
                          <Field label="Passport issuing country">
                            <Input value={f.passportCountry} onChange={(e) => setForm(i, { passportCountry: e.target.value })} placeholder="e.g. India" />
                          </Field>
                          <Field label="Passport expiry">
                            <Input type="date" value={f.passportExpiry} onChange={(e) => setForm(i, { passportExpiry: e.target.value })} />
                          </Field>
                        </div>
                        <div className="mt-3 sm:max-w-xs">
                          <Field label="Frequent flyer no." hint="Must match this passenger's name.">
                            <Input value={f.frequentFlyer} onChange={(e) => setForm(i, { frequentFlyer: e.target.value })} placeholder="Optional" />
                          </Field>
                        </div>
                        <div className="mt-3">
                          <div className="flex items-center gap-1">
                            <Eyebrow>Required documents</Eyebrow>
                            <span className="text-status-urgent">*</span>
                          </div>
                          <div className="mt-2 grid gap-2">
                            {f.docs.map((d, di) => (
                              <div key={di} className="flex items-center gap-2 rounded-lg bg-status-won-bg/60 px-3 py-2 text-sm">
                                <Icon name="check" size={14} className="text-status-won" />
                                <span className="flex-1 truncate">{d.name}</span>
                                <button onClick={() => removeDoc(i, di)} className="text-muted-foreground hover:text-status-urgent"><Icon name="x" size={14} /></button>
                              </div>
                            ))}
                            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:bg-muted">
                              <Icon name="plus" size={15} />
                              {f.docs.length ? 'Add another document' : 'Upload document (passport / ID)'}
                              <input type="file" multiple accept="image/*,application/pdf"
                                className="hidden"
                                onChange={(e) => { if (e.target.files?.length) addDocs(i, e.target.files); e.target.value = '' }} />
                            </label>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {stepKey === 'review' && (
                <div className="grid gap-3">
                  <Row label="Lead guest" value={leadName || '—'} sub={slots[0]?.type === 'adult' ? 'Adult' : ''} />
                  <Row label="Package" value={pkg?.destinationCity} sub={`${pkg?.origin} · ${pkg?.durationLabel}`} />
                  <Row label="Category" value={category} />
                  <Row label="Travel date" value={departure ? crispRange(departure.date, departure.returnDate) : ''} sub={departure ? `${departure.outbound.flightNo} / ${departure.inbound.flightNo}` : ''} />
                  <Row label="Rooms" value={`${rooms.length} room${rooms.length > 1 ? 's' : ''} · ${seats} pax`} sub={paxSummary(pax)} />
                  {cityPrefs().length > 0 && (
                    <Row label="Preferred properties" value={cityPrefs().map((x) => `${x.city}: ${x.property}`).join(' · ')} />
                  )}
                  {addOnsSelected.length > 0 && (
                    <Row label="Add-ons" value={addOnsSelected.map((a) => `${a.item} ×${a.qty}`).join(', ')} />
                  )}
                  <div className="mt-1 border-t pt-3">
                    <Eyebrow className="mb-2">Travellers</Eyebrow>
                    <div className="grid gap-1.5">
                      {slots.map((slot, i) => {
                        const f = guestForms[i] || emptyForm()
                        return (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="font-medium">{`${f.firstName} ${f.lastName}`.trim() || slot.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {slot.label} · {f.docs.length} doc{f.docs.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Advance payment — required before a booking can be made */}
                  <div className="mt-1 rounded-xl border border-status-proposal/40 bg-status-proposal-bg/30 p-4">
                    <div className="flex items-center justify-between">
                      <Eyebrow>Advance payment {advanceDue > 0 ? '· required' : ''}</Eyebrow>
                      <span className="text-base font-bold tabular-nums">{inr(advanceDue)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {advanceDue > 0
                        ? 'Collect the advance to confirm this booking, then enter its payment reference below.'
                        : 'No advance configured for this package — set a booking amount in the package policy.'}
                    </p>
                    {advanceDue > 0 && (
                      <div className="mt-3">
                        <Field label="Advance payment reference" required>
                          <Input value={advanceNote} onChange={(e) => setAdvanceNote(e.target.value)} placeholder="e.g. UPI ref 4471… / NEFT UTR / receipt no." />
                        </Field>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {bookErr && stepKey === 'review' && (
              <div className="mx-6 mt-3 flex items-center gap-2 rounded-xl border border-status-urgent/30 bg-status-urgent-bg/40 px-3 py-2 text-sm text-status-urgent">
                <Icon name="info" size={16} /> {bookErr}
              </div>
            )}
            <div className="flex items-center justify-between border-t bg-muted/30 px-6 py-4">
              <Button variant="ghost" onClick={back}>{idx === 0 ? 'Cancel' : 'Back'}</Button>
              {stepKey !== 'review' ? (
                <Button disabled={!canNext} onClick={next}>Continue <Icon name="arrowRight" size={16} /></Button>
              ) : (
                <Button icon="check" disabled={!advanceOk || booking} onClick={confirm}>{booking ? 'Booking…' : 'Confirm & book'}</Button>
              )}
            </div>
          </Card>
        </div>

        {/* Order summary */}
        <aside className="lg:col-span-1">
          <Card className="overflow-hidden lg:sticky lg:top-20">
            {pkg ? (
              <CityCover url={pkg.coverUrl} city={pkg.destinationCity} className="h-28" rounded="rounded-t-2xl" />
            ) : (
              <div className="flex h-28 items-center justify-center bg-secondary text-primary"><Icon name="ticket" size={28} /></div>
            )}
            <div className="p-5">
              <Eyebrow>Order summary</Eyebrow>
              <div className="mt-3 grid gap-2.5 text-sm">
                <SumRow label="Package" value={pkg ? `${pkg.destinationCity} · ${pkg.origin}` : '—'} />
                <SumRow label="Category" value={category || '—'} />
                <SumRow label="Travel date" value={departure ? shortDate(departure.date) : '—'} />
                <SumRow label="Rooms" value={`${rooms.length} · ${seats} pax`} />
              </div>
              {leadName && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
                  <Avatar name={leadName} size={28} /><span className="text-sm font-semibold">{leadName}</span>
                </div>
              )}
              {grid && seats > 0 && (
                <div className="mt-4 grid gap-1.5 border-t pt-4 text-sm">
                  <Eyebrow className="mb-1">Price breakdown</Eyebrow>
                  {OCCUPANCY.filter((o) => pax[o.key] > 0).map((o) => (
                    <div key={o.key} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{o.label} <span className="text-xs">× {pax[o.key]}</span></span>
                      <span className="font-semibold tabular-nums">{inr(pax[o.key] * grid[o.key])}</span>
                    </div>
                  ))}
                  {addOnsSelected.map((a, i) => (
                    <div key={`ao-${i}`} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{a.item} <span className="text-xs">× {a.qty}</span></span>
                      <span className="font-semibold tabular-nums">{inr(a.qty * a.price)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t pt-4">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-2xl font-bold tabular-nums">{inr(amount)}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Payment collected offline after booking.</p>
              <Button
                variant="outline"
                icon="download"
                className="mt-4 w-full"
                disabled={!(pkg && grid && seats > 0)}
                onClick={() => downloadGuestQuote(pkg, {
                  leadName: leadName || 'Guest',
                  category,
                  departure,
                  rooms: rooms.length,
                  seats,
                  pax,
                  grid,
                  addOns: addOnsSelected,
                  hotelPreferences: cityPrefs(),
                  amount,
                  quoteDate: shortDate(new Date().toISOString().slice(0, 10)),
                })}
              >
                Download quote
              </Button>
              <p className="mt-1.5 text-[11px] text-muted-foreground">A personalised PDF-ready quote for this guest &amp; these selections.</p>
            </div>
          </Card>
        </aside>
      </div>
    </>
  )
}

function paxSummary(pax) {
  return OCCUPANCY.filter((o) => pax[o.key] > 0).map((o) => `${pax[o.key]} ${o.label}`).join(', ')
}
function BedOption({ active, onClick, title, price }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors',
        active ? 'border-primary bg-secondary ring-2 ring-ring/20' : 'hover:bg-muted',
      )}
    >
      <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', active ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>
        {active && <Icon name="check" size={11} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        {price != null && <span className="block text-xs text-muted-foreground tabular-nums">{inr(price)}</span>}
      </span>
    </button>
  )
}
function TabPill({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={cx('rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors', active ? 'border-primary bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted')}>
      {children}
    </button>
  )
}
function Row({ label, value, sub }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right"><p className="text-sm font-semibold">{value}</p>{sub && <p className="text-xs text-muted-foreground">{sub}</p>}</div>
    </div>
  )
}
function SumRow({ label, value }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="text-right font-semibold">{value}</span></div>
}
function Stepper({ value, onChange, min = 0, max = 99 }) {
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min}
        className="flex h-7 w-7 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-40">
        <Icon name="x" size={12} className="rotate-45" />
      </button>
      <span className="w-7 text-center text-sm font-bold tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max}
        className="flex h-7 w-7 items-center justify-center rounded-lg border text-primary hover:bg-muted disabled:opacity-40">
        <Icon name="plus" size={13} />
      </button>
    </div>
  )
}
