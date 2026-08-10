import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Card, Eyebrow, Field, Input, Select, Textarea } from '../components/ui/primitives.jsx'
import InventoryImage from '../components/InventoryImage.jsx'
import { useApp } from '../store/AppStore.jsx'
import { INVENTORY_STATUSES, INVENTORY_LABELS, deriveDeadlines } from '../store/data.js'
import { CITY_OPTIONS } from '../lib/airports.js'
import { shortDate } from '../lib/format.js'

const cityCode = (city = '') => {
  const m = city.match(/\(([A-Za-z]{3})\)/)
  return (m ? m[1] : city.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase()
}

// Downscale an uploaded image to a compact inline data URL.
const readImage = (file, max = 800) =>
  new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.src = url
  })

export default function InventoryForm({ type: typeProp = 'airline' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { inventoryById, packages, addInventory, updateInventory, airlines, addAirline, hotelRegistry, vendors, addVendor } = useApp()
  const existing = id ? inventoryById(id) : null
  const editing = Boolean(existing)
  const type = existing?.type || typeProp
  const L = INVENTORY_LABELS[type]

  const [form, setForm] = useState(() => ({
    airline: existing?.airline || '',
    returnAirline: existing?.returnAirline || '',
    departureCity: existing?.departureCity || '',
    arrivalCity: existing?.arrivalCity || '',
    flightNo: existing?.flightNo || '',
    returnFlightNo: existing?.returnFlightNo || '',
    departureDate: existing?.departureDate || '',
    returnDate: existing?.returnDate || '',
    category: existing?.category || '',
    priceAdult: existing?.pricing?.adult ?? '',
    priceExtraBed: existing?.pricing?.extraBed ?? '',
    priceCwb: existing?.pricing?.cwb ?? '',
    priceCnb: existing?.pricing?.cnb ?? '',
    priceSingle: existing?.pricing?.single ?? '',
    totalSeats: existing?.totalSeats ?? '',
    seatCost: existing?.seatCost ?? '',
    allocatedSeats: existing?.allocatedSeats ?? 0,
    namesCaptured: existing?.namesCaptured ?? 0,
    releasedSeats: existing?.releasedSeats ?? 0,
    advancePaid: existing?.advancePaid ?? false,
    advanceDate: existing?.advanceDate || '',
    balancePaid: existing?.balancePaid ?? false,
    balanceDate: existing?.balanceDate || '',
    status: existing?.status || 'Active',
    packageId: existing?.packageId || '',
    remarks: existing?.remarks || '',
    imageUrl: existing?.imageUrl || '',
    vendors: existing?.vendors && existing.vendors.length ? existing.vendors : [''],
  }))
  const setVendorAt = (i, val) => setForm((f) => ({ ...f, vendors: f.vendors.map((v, k) => (k === i ? val : v)) }))
  const addVendorRow = () => setForm((f) => ({ ...f, vendors: [...f.vendors, ''] }))
  const removeVendorRow = (i) => setForm((f) => ({ ...f, vendors: f.vendors.filter((_, k) => k !== i).length ? f.vendors.filter((_, k) => k !== i) : [''] }))
  const [addingAirline, setAddingAirline] = useState(false)
  const [addingCat, setAddingCat] = useState(false)
  const logoRef = useRef(null)
  const hotelImgRef = useRef(null)
  const onLogo = async (e) => { const f = e.target.files?.[0]; if (f) { const url = await readImage(f, 160); setForm((s) => ({ ...s, imageUrl: url })) } e.target.value = '' }
  const onHotelImg = async (e) => { const f = e.target.files?.[0]; if (f) { const url = await readImage(f, 1000); setForm((s) => ({ ...s, imageUrl: url })) } e.target.value = '' }
  const pickExistingHotel = (key) => {
    const h = hotelRegistry.find((x) => `${x.city}|${x.name}` === key)
    if (h) setForm((s) => ({ ...s, airline: h.name, arrivalCity: h.property || s.arrivalCity, flightNo: h.roomType || s.flightNo, imageUrl: h.imageUrl || s.imageUrl }))
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setBool = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value === 'yes' }))

  // Per-record deadline override (for airline-specific contractual timelines).
  const [ovr, setOvr] = useState(() =>
    existing?.deadlineOverride
      ? { on: true, namingDeadline: existing.namingDeadline || '', releaseDeadline: existing.releaseDeadline || '', balanceDueDate: existing.balanceDueDate || '' }
      : { on: false, namingDeadline: '', releaseDeadline: '', balanceDueDate: '' },
  )
  const setOv = (k) => (e) => setOvr((o) => ({ ...o, [k]: e.target.value }))

  const dl = useMemo(() => deriveDeadlines(form.departureDate), [form.departureDate])
  // Categories come from the linked package (its hotels are this inventory), so
  // the selling grid lines up with how the package prices.
  const linkedPkg = packages.find((p) => p.id === form.packageId)
  const catOptions = linkedPkg?.categories?.length ? linkedPkg.categories : ['Standard', 'Deluxe', 'Super Deluxe']
  const canSave = form.airline && form.departureCity && (type === 'hotel' || form.arrivalCity) && form.departureDate && Number(form.totalSeats) > 0

  const save = () => {
    const sector = type === 'hotel'
      ? form.departureCity
      : `${cityCode(form.departureCity)} → ${cityCode(form.arrivalCity)}`
    const prefix = type === 'hotel'
      ? 'HT'
      : (form.airline || 'XX').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()
    // IDs are always system-generated. An existing record keeps its ID; new
    // records get a fresh one. Never entered by hand.
    const inventoryId = existing?.inventoryId ||
      `${prefix}-${cityCode(form.departureCity)}-${Math.floor(1000 + Math.random() * 9000)}`
    const values = {
      type,
      inventoryId,
      airline: form.airline,
      // Return leg can be operated by a different carrier / flight number.
      returnAirline: type === 'airline' ? (form.returnAirline || '') : '',
      departureCity: form.departureCity,
      // hotels no longer capture a separate "property" — fall back to the hotel name.
      arrivalCity: type === 'hotel' ? (form.arrivalCity || form.airline) : form.arrivalCity,
      sector,
      flightNo: type === 'hotel' ? form.flightNo : form.flightNo.toUpperCase(),
      returnFlightNo: type === 'airline' ? (form.returnFlightNo || '').toUpperCase() : '',
      departureDate: form.departureDate,
      returnDate: form.returnDate || form.departureDate,
      totalSeats: Math.max(0, Number(form.totalSeats) || 0),
      allocatedSeats: Math.max(0, Number(form.allocatedSeats) || 0),
      namesCaptured: Math.max(0, Number(form.namesCaptured) || 0),
      releasedSeats: Math.max(0, Number(form.releasedSeats) || 0),
      vendors: form.vendors.map((v) => v.trim()).filter(Boolean),
      status: form.status,
      packageId: form.packageId,
      remarks: form.remarks,
      imageUrl: form.imageUrl || '',
      // deadline override (empty strings → auto-derived by deriveDeadlines)
      deadlineOverride: ovr.on,
      namingDeadline: ovr.on ? (ovr.namingDeadline || dl.namingDeadline) : '',
      releaseDeadline: ovr.on ? (ovr.releaseDeadline || dl.releaseDeadline) : '',
    }
    // Register a newly-added airline (with its logo) so it's reusable next time.
    if (type === 'airline' && form.airline) addAirline(form.airline, form.imageUrl)
    // Register any new vendors so they're reusable next time.
    values.vendors.forEach((v) => addVendor(v))
    const invId = editing ? (updateInventory(existing.id, values), existing.id) : addInventory(values).id
    navigate(`${L.route}/${invId}`)
  }

  const placeholders = type === 'hotel'
    ? { provider: 'Taj Exotica', ref: 'Deluxe Villa', from: 'Havelock', to: 'Taj Exotica Resort' }
    : { provider: 'Air India', ref: 'AI-2378', from: 'Delhi (DEL)', to: 'Bangkok (BKK)' }

  return (
    <>
      <datalist id="oyo-cities">
        {CITY_OPTIONS.map((o) => <option key={o} value={o} />)}
      </datalist>
      <TopBar
        title={editing ? `Edit ${type === 'hotel' ? 'hotel block' : 'inventory'}` : (type === 'hotel' ? 'Add hotel block' : 'Add airline inventory')}
        subtitle={type === 'hotel' ? 'Record a bulk hotel room block.' : 'Record a bulk airline seat purchase.'}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
            <Button icon="check" disabled={!canSave} onClick={save}>{editing ? 'Save changes' : 'Create'}</Button>
          </>
        }
      />

      <div className="grid gap-6 px-4 py-5 sm:px-6 lg:grid-cols-3 lg:px-8 lg:py-6">
        <div className="grid gap-6 lg:col-span-2">
          <Card className="p-6">
            <Eyebrow className="mb-4">{type === 'hotel' ? 'Hotel & stay' : 'Flight & route'}</Eyebrow>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {type === 'airline' ? (
                <Field label="Outbound airline" required hint="Pick an airline — its logo shows on the record.">
                  {!addingAirline ? (
                    <Select
                      value={form.airline}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '__new__') { setAddingAirline(true); setForm((f) => ({ ...f, airline: '', imageUrl: '' })) }
                        else { const a = airlines.find((x) => x.name === v); setForm((f) => ({ ...f, airline: v, imageUrl: a ? (a.logoUrl || '') : f.imageUrl })) }
                      }}
                    >
                      <option value="">Select airline…</option>
                      {form.airline && !airlines.some((a) => a.name === form.airline) && <option value={form.airline}>{form.airline}</option>}
                      {airlines.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                      <option value="__new__">＋ Add new airline…</option>
                    </Select>
                  ) : (
                    <div className="grid gap-2">
                      <Input value={form.airline} onChange={set('airline')} placeholder="New airline name" />
                      <div className="flex items-center gap-2">
                        <InventoryImage inv={{ type: 'airline', airline: form.airline, imageUrl: form.imageUrl }} size={34} />
                        <input ref={logoRef} type="file" accept="image/*" hidden onChange={onLogo} />
                        <Button type="button" size="sm" variant="outline" icon="plus" onClick={() => logoRef.current?.click()}>{form.imageUrl ? 'Change logo' : 'Upload logo'}</Button>
                        <button type="button" className="text-xs font-semibold text-muted-foreground hover:underline" onClick={() => { setAddingAirline(false); setForm((f) => ({ ...f, airline: '', imageUrl: '' })) }}>Pick from list</button>
                      </div>
                    </div>
                  )}
                </Field>
              ) : (
                <Field label={L.provider} required><Input value={form.airline} onChange={set('airline')} placeholder={placeholders.provider} /></Field>
              )}
              <Field label={type === 'airline' ? 'Outbound flight no.' : L.ref}><Input value={form.flightNo} onChange={set('flightNo')} placeholder={placeholders.ref} /></Field>
              <Field label={L.from} required hint="Search a city — code fills in, e.g. Delhi (DEL).">
                <Input list="oyo-cities" value={form.departureCity} onChange={set('departureCity')} placeholder={placeholders.from} />
              </Field>
              {type === 'airline' && (
                <Field label={L.to} required hint="Search a city — code fills in.">
                  <Input list="oyo-cities" value={form.arrivalCity} onChange={set('arrivalCity')} placeholder={placeholders.to} />
                </Field>
              )}
              <Field label={L.anchor} required><Input type="date" value={form.departureDate} onChange={set('departureDate')} /></Field>
              <Field label={L.ret}><Input type="date" value={form.returnDate} onChange={set('returnDate')} /></Field>
              {type === 'airline' && (
                <Field label="Return airline" hint="Defaults to the outbound airline.">
                  <Select value={form.returnAirline} onChange={(e) => setForm((f) => ({ ...f, returnAirline: e.target.value }))}>
                    <option value="">Same as outbound</option>
                    {form.returnAirline && !airlines.some((a) => a.name === form.returnAirline) && <option value={form.returnAirline}>{form.returnAirline}</option>}
                    {airlines.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </Select>
                </Field>
              )}
              {type === 'airline' && (
                <Field label="Return flight no." hint="Defaults to the outbound flight no."><Input value={form.returnFlightNo} onChange={set('returnFlightNo')} placeholder="AI-2938" /></Field>
              )}
              <Field label="Linked package">
                <Select value={form.packageId} onChange={set('packageId')}>
                  <option value="">None</option>
                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.origin}</option>)}
                </Select>
              </Field>

              {type === 'hotel' && (
                <div className="sm:col-span-2 grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[auto_1fr]">
                  <div className="flex flex-col items-center gap-2">
                    <InventoryImage inv={{ type: 'hotel', imageUrl: form.imageUrl }} size={92} rounded="rounded-xl" />
                    <input ref={hotelImgRef} type="file" accept="image/*" hidden onChange={onHotelImg} />
                    <Button type="button" size="sm" variant="outline" icon="plus" onClick={() => hotelImgRef.current?.click()}>{form.imageUrl ? 'Change image' : 'Upload image'}</Button>
                  </div>
                  <div className="grid content-start gap-2">
                    <Field label="Use an existing property" hint={form.departureCity ? `Saved hotels in ${form.departureCity}.` : 'Type a city above to see saved hotels.'}>
                      <Select value="" onChange={(e) => e.target.value && pickExistingHotel(e.target.value)}>
                        <option value="">Select a saved property…</option>
                        {hotelRegistry
                          .filter((h) => !form.departureCity || String(h.city).toLowerCase() === form.departureCity.toLowerCase())
                          .map((h) => <option key={`${h.city}|${h.name}`} value={`${h.city}|${h.name}`}>{h.name} — {h.city}</option>)}
                      </Select>
                    </Field>
                    <p className="text-xs text-muted-foreground">Pick a hotel you've added before to reuse its name &amp; image, or upload a new one on the left.</p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <Eyebrow className="mb-4">{L.units} & allocation</Eyebrow>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label={`Total ${L.units.toLowerCase()}`} required><Input type="number" min="0" value={form.totalSeats} onChange={set('totalSeats')} placeholder="50" /></Field>
              <Field label="Allocated"><Input type="number" min="0" value={form.allocatedSeats} onChange={set('allocatedSeats')} /></Field>
              <Field label="Names captured"><Input type="number" min="0" value={form.namesCaptured} onChange={set('namesCaptured')} /></Field>
              <Field label="Released"><Input type="number" min="0" value={form.releasedSeats} onChange={set('releasedSeats')} /></Field>
            </div>
            <Field label="Status" hint="Active or Inactive. Turns Inactive automatically once the travel date passes; allocation (Available / Partially / Fully) is tracked automatically from bookings.">
              <Select value={form.status} onChange={set('status')}>
                {INVENTORY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Card>

        </div>

        <aside className="grid gap-6">
          <Card className="p-6">
            <Eyebrow className="mb-1">Vendors</Eyebrow>
            <p className="mb-3 text-xs text-muted-foreground">Suppliers / consolidators this block is sourced from. Add as many as needed.</p>
            <datalist id="oyo-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
            <div className="grid gap-2">
              {form.vendors.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input list="oyo-vendors" value={v} onChange={(e) => setVendorAt(i, e.target.value)} placeholder="Vendor name" />
                  <button type="button" onClick={() => removeVendorRow(i)} aria-label="Remove vendor"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" size="sm" variant="outline" icon="plus" className="mt-2" onClick={addVendorRow}>Add vendor</Button>

            <div className="mt-5 border-t pt-4">
              <Eyebrow className="mb-2">Notes</Eyebrow>
              <Textarea rows={3} value={form.remarks} onChange={set('remarks')} placeholder="Notes about this block…" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-3 flex items-center justify-between">
              <Eyebrow>Deadlines</Eyebrow>
              <Select value={ovr.on ? 'override' : 'auto'} onChange={(e) => setOvr((o) => ({
                on: e.target.value === 'override',
                namingDeadline: o.namingDeadline || dl.namingDeadline || '',
                releaseDeadline: o.releaseDeadline || dl.releaseDeadline || '',
              }))} className="w-36">
                <option value="auto">Auto</option>
                <option value="override">Override</option>
              </Select>
            </div>
            {ovr.on ? (
              <div className="grid gap-3">
                <p className="text-xs text-muted-foreground">Set airline/hotel-specific dates manually.</p>
                <Field label={L.naming}><Input type="date" value={ovr.namingDeadline} onChange={setOv('namingDeadline')} /></Field>
                <Field label={L.release}><Input type="date" value={ovr.releaseDeadline} onChange={setOv('releaseDeadline')} /></Field>
              </div>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted-foreground">Derived from {L.anchor.toLowerCase()} date. {L.naming} −4d · {L.release} −11d.</p>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">{L.naming}</span><span className="font-semibold">{dl.namingDeadline ? shortDate(dl.namingDeadline) : '—'}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">{L.release}</span><span className="font-semibold">{dl.releaseDeadline ? shortDate(dl.releaseDeadline) : '—'}</span></div>
                </div>
              </>
            )}
          </Card>
        </aside>
      </div>
    </>
  )
}
