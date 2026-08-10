import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import InventoryImage from '../components/InventoryImage.jsx'
import * as XLSX from 'xlsx'
import { Button, Card, Eyebrow, Field, Input, Modal, Pill, Select, Textarea } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { OCCUPANCY, DEFAULT_TERMS } from '../store/data.js'
import { shortDate, inr } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')
const ALL_CATEGORIES = ['Deluxe', 'Super Deluxe', 'Standard']
const MONTHS_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (key) => { const [y, m] = key.split('-'); return `${MONTHS_ABBR[+m - 1]} ${y}` }
const codeOf = (c = '') => { const m = c.match(/\(([A-Za-z]{3})\)/); return (m ? m[1] : c.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase() }
const blankFlight = { from: '', to: '', airline: '', flightNo: '' }
const blankDep = (cats) => ({
  date: '', returnDate: '', seatsTotal: '',
  airlineInventoryId: '', hotelInventoryId: '',
  outbound: { ...blankFlight }, inbound: { ...blankFlight },
  pricing: Object.fromEntries(cats.map((c) => [c, Object.fromEntries(OCCUPANCY.map((o) => [o.key, '']))])),
})

// Downscale an uploaded image and return a compact data URL (stored inline).
function fileToDataUrl(file, max = 1100, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = url
  })
}

export default function PackageForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { packageById, addPackage, updatePackage, addDeparture, departuresForPackage, updateInventory, termsTemplates, saveTermsTemplate, deleteTermsTemplate } = useApp()
  const existing = id ? packageById(id) : null
  const editing = Boolean(existing)

  const [form, setForm] = useState(() => ({
    name: existing?.name || '',
    origin: existing?.origin || 'Ex Delhi',
    destinationCity: existing?.destinationCity || '',
    country: existing?.country || 'India',
    coverUrl: existing?.coverUrl || '',
    nights: existing?.nights ?? '',
    days: existing?.days ?? (existing?.nights != null ? existing.nights + 1 : ''),
    destinationsLabel: existing?.destinationsLabel || '',
    blurb: existing?.blurb || '',
  }))
  const [categories, setCategories] = useState(existing?.categories?.length ? existing.categories : ['Standard'])
  const [deps, setDeps] = useState([]) // new departures to create on save
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('details') // 'details' | 'configuration' | 'content'
  const [focal, setFocal] = useState(() => existing?.coverFocal || { x: 50, y: 50 }) // cover crop anchor (%)
  const coverInput = useRef(null)
  // Click anywhere on the cover to set the focal point used when the image is
  // cropped at different aspect ratios (list card, hero banner).
  const setFocalFromClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)))
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)))
    setFocal({ x, y })
  }

  // Rich content editors
  const [hotels, setHotels] = useState(existing?.hotels || [])
  const [itinerary, setItinerary] = useState(existing?.itinerary || [])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const bulkFileRef = useRef(null)
  // Parse pasted / uploaded rows into itinerary days. One day per line; split
  // the title & description with a Tab or a colon. A leading "Day N" is dropped.
  const parseItineraryText = (text) => {
    const stripDay = (s) => s.replace(/^\s*(day\s*\d+|d\s*\d+|\d+)\s*[.:)\-–]?\s*/i, '').trim()
    return String(text || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((raw) => {
        const l = stripDay(raw)
        let title = l, desc = ''
        const ti = l.indexOf('\t')
        if (ti >= 0) { title = l.slice(0, ti).trim(); desc = l.slice(ti + 1).replace(/\t/g, ' ').trim() }
        else { const ci = l.indexOf(': '); if (ci >= 0) { title = l.slice(0, ci).trim(); desc = l.slice(ci + 2).trim() } }
        return { title, desc }
      })
      .filter((d) => d.title && !/^(title|day)$/i.test(d.title))
  }
  const onBulkFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      setBulkText(ws ? XLSX.utils.sheet_to_csv(ws, { FS: '\t' }) : '')
    } catch { /* ignore unreadable file */ }
    e.target.value = ''
  }
  const downloadItineraryTemplate = (kind) => {
    const rows = [
      ['Title', 'Description'],
      ['Arrival & Bangkok city tour', 'Airport pickup, hotel check-in, evening at Asiatique.'],
      ['Full-day Coral Island', 'Speedboat, lunch, water sports.'],
      ['Departure', 'Breakfast and transfer to airport.'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 34 }, { wch: 60 }]
    if (kind === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      const a = document.createElement('a'); a.href = url; a.download = 'itinerary-template.csv'; a.click(); URL.revokeObjectURL(url)
    } else {
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Itinerary')
      XLSX.writeFile(wb, 'itinerary-template.xlsx')
    }
  }
  const applyBulkItinerary = () => {
    const rows = parseItineraryText(bulkText)
    if (!rows.length) return
    setItinerary((list) => [...list, ...rows.map((r, i) => ({ day: list.length + i + 1, title: r.title, desc: r.desc }))])
    setBulkText(''); setBulkOpen(false)
  }
  const [inclusions, setInclusions] = useState(existing?.inclusions || [])
  const [exclusions, setExclusions] = useState(existing?.exclusions || [])
  const [addOns, setAddOns] = useState(existing?.addOns || [])
  const [cancellation, setCancellation] = useState(() =>
    (existing?.cancellation || []).map((r) => ({
      days: r.days ?? '',
      refundPercent: r.refundPercent ?? (r.full ? 0 : ''),
      timeline: r.timeline || '',
      penalty: r.penalty || '',
    })))
  const [payment, setPayment] = useState(() => {
    const p = existing?.payment || {}
    return {
      ...p,
      advancePerSeat: p.advancePerSeat ?? '',
      balanceDueDays: p.balanceDueDays ?? '',
      taCommission: p.taCommission ?? '',
    }
  })
  const [terms, setTerms] = useState(existing?.terms || DEFAULT_TERMS)
  const [tplName, setTplName] = useState('')
  const [tplMgrOpen, setTplMgrOpen] = useState(false)
  const setPay = (k) => (e) => setPayment((p) => ({ ...p, [k]: e.target.value }))

  // --- Cancellation-policy bulk upload (paste or file) --------------------
  const [polBulkOpen, setPolBulkOpen] = useState(false)
  const [polBulkText, setPolBulkText] = useState('')
  const polBulkFileRef = useRef(null)
  // One tier per line: "days before travel <tab/comma/colon> refund %". A header
  // row (no number in the first cell) is skipped.
  const parsePolicyRows = (text) => String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\t|,|;|:/).map((s) => s.trim()))
    .filter((c) => c.length >= 2 && /\d/.test(c[0]))
    .map((c) => ({
      days: parseInt(String(c[0]).replace(/[^\d]/g, ''), 10),
      refundPercent: Math.max(0, Math.min(100, parseInt(String(c[1]).replace(/[^\d]/g, ''), 10) || 0)),
    }))
    .filter((r) => Number.isFinite(r.days))
  const onPolBulkFile = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const buf = new Uint8Array(await f.arrayBuffer())
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      setPolBulkText(ws ? XLSX.utils.sheet_to_csv(ws, { FS: '\t' }) : '')
    } catch { /* ignore unreadable file */ }
    e.target.value = ''
  }
  const downloadPolicyTemplate = (kind) => {
    const rows = [['Days before travel', 'Refund %'], [30, 100], [20, 50], [7, 0]]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 22 }, { wch: 12 }]
    if (kind === 'csv') {
      const csv = XLSX.utils.sheet_to_csv(ws)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      const a = document.createElement('a'); a.href = url; a.download = 'cancellation-policy-template.csv'; a.click(); URL.revokeObjectURL(url)
    } else {
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Cancellation')
      XLSX.writeFile(wb, 'cancellation-policy-template.xlsx')
    }
  }
  const applyPolicyBulk = () => {
    const rows = parsePolicyRows(polBulkText)
    if (!rows.length) return
    // Replace any empty starter rows, then append the imported tiers (highest
    // days first so the closer-refunds-less ordering reads naturally).
    const sorted = [...rows].sort((a, b) => b.days - a.days)
    setCancellation((list) => [
      ...list.filter((r) => r.days !== '' || r.refundPercent !== ''),
      ...sorted.map((r) => ({ days: r.days, refundPercent: r.refundPercent, timeline: '', penalty: '' })),
    ])
    setPolBulkText(''); setPolBulkOpen(false)
  }

  // Hotel rows for a given category (kept in sync with the categories selected above)
  const hotelRows = (cat) => hotels.find((h) => h.category === cat)?.rows || []
  const setHotelRows = (cat, rows) =>
    setHotels((hs) => {
      const others = hs.filter((h) => h.category !== cat)
      return [...others, { category: cat, rows }]
    })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggleCat = (c) =>
    setCategories((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))

  const onCover = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const url = await fileToDataUrl(file)
      setForm((f) => ({ ...f, coverUrl: url }))
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }
  const canSave = form.name && form.destinationCity && categories.length > 0

  const cats = ALL_CATEGORIES.filter((c) => categories.includes(c))

  const save = () => {
    const nights = Number(form.nights) || 0
    const days = Number(form.days) || (nights ? nights + 1 : 0)
    const values = {
      ...form,
      coverFocal: focal,
      nights,
      days,
      durationLabel: `${nights}N / ${days}D`,
      destinationsLabel: form.destinationsLabel || form.destinationCity,
      categories: cats,
      // rich content
      hotels: cats
        .map((c) => ({ category: c, rows: hotelRows(c).filter((r) => r.city || r.options) }))
        .filter((h) => h.rows.length),
      itinerary: itinerary
        .filter((it) => it.title || it.desc)
        .map((it, i) => ({ day: i + 1, title: it.title || '', desc: it.desc || '' })),
      inclusions: inclusions.map((s) => s.trim()).filter(Boolean),
      exclusions: exclusions.map((s) => s.trim()).filter(Boolean),
      addOns: addOns
        .filter((a) => a.item)
        .map((a) => ({ item: a.item, price: Math.max(0, Number(a.price) || 0) })),
      cancellation: cancellation
        .filter((c) => c.days !== '' && c.days != null)
        .map((c) => {
          const days = Math.max(0, Number(c.days) || 0)
          const pct = Math.max(0, Math.min(100, Number(c.refundPercent) || 0))
          return {
            days,
            refundPercent: pct,
            timeline: `${days} days before travel`,
            penalty: pct > 0 ? `${pct}% refundable` : 'Non-refundable',
          }
        }),
      payment: {
        ...payment,
        advancePerSeat: Math.max(0, Number(payment.advancePerSeat) || 0),
        balanceDueDays: Math.max(0, Number(payment.balanceDueDays) || 0),
        taCommission: Math.max(0, Number(payment.taCommission) || 0),
        bookingAmount: payment.advancePerSeat ? `₹${Number(payment.advancePerSeat).toLocaleString('en-IN')} per seat` : (payment.bookingAmount || ''),
        balance: payment.balanceDueDays ? `Balance due ${Number(payment.balanceDueDays)} days before travel` : (payment.balance || ''),
      },
      terms,
    }
    const pkgId = editing ? (updatePackage(existing.id, values), existing.id) : addPackage(values).id
    // create any departures captured in the form
    const upFlight = (f) => ({
      ...f,
      from: f.from.toUpperCase(),
      to: f.to.toUpperCase(),
      flightNo: f.flightNo.toUpperCase(),
    })
    deps.forEach((d) => {
      addDeparture({
        packageId: pkgId,
        date: d.date,
        returnDate: d.returnDate || d.date,
        outbound: upFlight(d.outbound),
        inbound: upFlight(d.inbound),
        seatsTotal: Math.max(0, Number(d.seatsTotal) || 0),
        airlineInventoryId: d.airlineInventoryId || undefined,
        hotelInventoryId: d.hotelInventoryId || undefined,
        pricing: Object.fromEntries(
          cats.map((c) => [c, Object.fromEntries(OCCUPANCY.map((o) => [o.key, Math.max(0, Number(d.pricing?.[c]?.[o.key]) || 0)]))]),
        ),
      })
      // Link the chosen inventory blocks to this package so bookings allocate
      // against them and Finance rolls up under the package.
      if (d.airlineInventoryId) updateInventory(d.airlineInventoryId, { packageId: pkgId })
      if (d.hotelInventoryId) updateInventory(d.hotelInventoryId, { packageId: pkgId })
    })
    navigate(`/packages/${pkgId}`)
  }

  return (
    <>
      <TopBar
        title={editing ? 'Edit package' : 'Add a package'}
        subtitle={editing ? 'Update this package’s details.' : 'Create a new fixed-departure product.'}
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button icon="check" disabled={!canSave || busy} onClick={save}>
              {editing ? 'Save changes' : 'Create package'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b">
          {[
            ['details', 'Package details'],
            ['departures', 'Departures'],
            ['pricing', 'Pricing'],
            ['hotels', 'Hotels'],
            ['itinerary', 'Itinerary'],
            ['inclusions', 'Inclusions'],
            ['addons', 'Add-ons'],
            ['policy', 'Policy'],
            ['terms', 'Terms & Conditions'],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cx(
                'relative -mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors',
                tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'details' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Details */}
          <Card className="p-6 lg:col-span-2">
            <Eyebrow className="mb-4">Package details</Eyebrow>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Package name" required>
                  <Input value={form.name} onChange={set('name')} placeholder="Bali Fixed Departure" />
                </Field>
              </div>
              <Field label="Origin">
                <Input value={form.origin} onChange={set('origin')} placeholder="Ex Delhi" />
              </Field>
              <Field label="Destination city" required hint="Used for display.">
                <Input value={form.destinationCity} onChange={set('destinationCity')} placeholder="Bali" />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={set('country')} placeholder="Indonesia" />
              </Field>
              <div />
              <Field label="Nights">
                <Input type="number" min="0" value={form.nights} onChange={set('nights')} placeholder="5" />
              </Field>
              <Field label="Days" hint="Duration shows as e.g. 5N / 6D.">
                <Input type="number" min="0" value={form.days} onChange={set('days')} placeholder="6" />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Destinations" hint="e.g. 2N Ubud · 3N Kuta">
                  <Input value={form.destinationsLabel} onChange={set('destinationsLabel')} placeholder="2N Ubud · 3N Kuta" />
                </Field>
              </div>
            </div>

            <div className="mt-5">
              <Field label="Categories" required hint="Pricing tiers offered for this package.">
                <div className="flex flex-wrap gap-2">
                  {ALL_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCat(c)}
                      className={cx(
                        'rounded-xl border px-3 py-1.5 text-[13px] font-semibold transition-colors',
                        categories.includes(c)
                          ? 'border-primary bg-secondary text-secondary-foreground'
                          : 'hover:bg-muted',
                      )}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Card>

          {/* Media */}
          <Card className="p-6">
            <Eyebrow className="mb-3">Cover image</Eyebrow>
            <div
              onClick={form.coverUrl ? setFocalFromClick : undefined}
              className={cx('relative aspect-[16/10] w-full overflow-hidden rounded-xl border bg-secondary', form.coverUrl && 'cursor-crosshair')}
            >
              {form.coverUrl ? (
                <>
                  <img src={form.coverUrl} alt="cover" style={{ objectPosition: `${focal.x}% ${focal.y}%` }} className="h-full w-full object-cover" />
                  {/* Focal-point marker */}
                  <span
                    className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-2 ring-black/40"
                    style={{ left: `${focal.x}%`, top: `${focal.y}%` }}
                  />
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Icon name="mapPin" size={26} />
                  <span className="text-xs font-semibold">No cover · a placeholder will be shown</span>
                </div>
              )}
            </div>
            {form.coverUrl && (
              <p className="mt-2 text-xs text-muted-foreground">Click the image to set the focal point — it stays in view when the cover is cropped to different sizes.</p>
            )}
            {form.coverUrl && (
              <div className="mt-3">
                <Eyebrow className="mb-1.5">Hero crop preview</Eyebrow>
                <div className="h-16 w-full overflow-hidden rounded-lg border bg-secondary">
                  <img src={form.coverUrl} alt="wide crop preview" style={{ objectPosition: `${focal.x}% ${focal.y}%` }} className="h-full w-full object-cover" />
                </div>
              </div>
            )}
            <input ref={coverInput} type="file" accept="image/*" hidden onChange={onCover} />
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" icon="plus" onClick={() => coverInput.current?.click()}>
                Upload cover
              </Button>
              {form.coverUrl && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setFocal({ x: 50, y: 50 })}>Center focal</Button>
                  <Button variant="ghost" size="sm" onClick={() => setForm((f) => ({ ...f, coverUrl: '' }))}>
                    Remove
                  </Button>
                </>
              )}
            </div>
            {busy && <p className="mt-4 text-xs text-muted-foreground">Processing image…</p>}
          </Card>
        </div>
        )}

        {(tab === 'departures' || tab === 'pricing') && (
        <DeparturesEditor
          view={tab}
          cats={cats}
          deps={deps}
          setDeps={setDeps}
          existingDepartures={editing ? departuresForPackage(existing.id) : []}
        />
        )}

        {tab === 'hotels' && (
          <div className="grid gap-6">
            {/* Hotels */}
            <Card className="p-6">
              <SectionHead icon="building" title="Hotels" hint="Hotel options per city, for each selected category." />
              {cats.length === 0 ? (
                <p className="text-sm text-muted-foreground">Select at least one category in Package details first.</p>
              ) : (
                <div className="grid gap-4">
                  {cats.map((c) => (
                    <div key={c} className="rounded-xl border p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Pill tone={c === 'Super Deluxe' ? 'proposal' : 'neutral'}>{c}</Pill>
                        <span className="text-xs text-muted-foreground">hotels</span>
                      </div>
                      <div className="grid gap-2">
                        {hotelRows(c).map((r, i) => (
                          <div key={i} className="flex flex-col gap-2 sm:flex-row">
                            <Input className="sm:w-40" value={r.city} placeholder="City"
                              onChange={(e) => setHotelRows(c, hotelRows(c).map((x, k) => (k === i ? { ...x, city: e.target.value } : x)))} />
                            <Input className="flex-1" value={r.options} placeholder="Hotel A / Hotel B / similar 4-star"
                              onChange={(e) => setHotelRows(c, hotelRows(c).map((x, k) => (k === i ? { ...x, options: e.target.value } : x)))} />
                            <button type="button" onClick={() => setHotelRows(c, hotelRows(c).filter((_, k) => k !== i))}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:text-status-urgent"><Icon name="x" size={15} /></button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button variant="ghost" size="sm" icon="plus" onClick={() => setHotelRows(c, [...hotelRows(c), { city: '', options: '' }])}>Add city</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {tab === 'itinerary' && (
          <div className="grid gap-6">
            {/* Itinerary */}
            <Card className="p-6">
              <SectionHead icon="calendar" title="Itinerary" hint="Day-by-day plan. Days are numbered automatically." />
              <div className="grid gap-3">
                {itinerary.map((it, i) => (
                  <div key={i} className="rounded-xl border p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                      <button type="button" onClick={() => setItinerary(itinerary.filter((_, k) => k !== i))} className="text-xs font-semibold text-status-urgent hover:underline">Remove</button>
                    </div>
                    <Field label="Title">
                      <Input value={it.title} placeholder="Arrival & city tour"
                        onChange={(e) => setItinerary(itinerary.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
                    </Field>
                    <div className="mt-2">
                      <Field label="Description">
                        <Textarea rows={2} value={it.desc} placeholder="What happens on this day…"
                          onChange={(e) => setItinerary(itinerary.map((x, k) => (k === i ? { ...x, desc: e.target.value } : x)))} />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" icon="plus" onClick={() => setItinerary([...itinerary, { day: itinerary.length + 1, title: '', desc: '' }])}>Add day</Button>
                <Button variant="ghost" size="sm" icon="upload" onClick={() => setBulkOpen(true)}>Bulk upload</Button>
              </div>
            </Card>

            <Modal
              open={bulkOpen}
              onClose={() => setBulkOpen(false)}
              title="Bulk upload itinerary"
              subtitle="Paste rows or upload a CSV / Excel — one day per line."
              width="max-w-2xl"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setBulkOpen(false)}>Cancel</Button>
                  <Button icon="plus" disabled={parseItineraryText(bulkText).length === 0} onClick={applyBulkItinerary}>
                    Add {parseItineraryText(bulkText).length || ''} day{parseItineraryText(bulkText).length === 1 ? '' : 's'}
                  </Button>
                </>
              }
            >
              <div className="grid gap-3">
                <input ref={bulkFileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden onChange={onBulkFile} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" icon="upload" onClick={() => bulkFileRef.current?.click()}>Choose file</Button>
                  <span className="mr-auto text-xs text-muted-foreground">.xlsx, .csv or .txt — first column = title, second = description.</span>
                  <Button variant="outline" size="sm" icon="download" onClick={() => downloadItineraryTemplate('xlsx')}>Excel template</Button>
                  <Button variant="outline" size="sm" icon="download" onClick={() => downloadItineraryTemplate('csv')}>CSV template</Button>
                </div>
                <Textarea
                  rows={10}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={'One day per line. Separate the title & description with a Tab or a colon:\n\nArrival & Bangkok city tour: Airport pickup, hotel check-in, evening at Asiatique.\nFull-day Coral Island: Speedboat, lunch, water sports.\nDeparture: Breakfast and transfer to airport.'}
                />
                {parseItineraryText(bulkText).length > 0 && (
                  <div className="rounded-xl border">
                    <p className="border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview · {parseItineraryText(bulkText).length} days</p>
                    <div className="max-h-52 overflow-y-auto">
                      {parseItineraryText(bulkText).map((d, i) => (
                        <div key={i} className="flex gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
                          <div className="min-w-0">
                            <p className="font-semibold">{d.title}</p>
                            {d.desc && <p className="text-xs text-muted-foreground">{d.desc}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Modal>
          </div>
        )}

        {tab === 'inclusions' && (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Inclusions */}
            <Card className="p-6">
              <SectionHead icon="check" title="Inclusions" hint="What's covered in the package price." />
              <ListEditor items={inclusions} setItems={setInclusions} placeholder="e.g. Return airfare in economy" addLabel="Add inclusion" />
            </Card>
            {/* Exclusions */}
            <Card className="p-6">
              <SectionHead icon="x" title="Exclusions" hint="What's not covered and payable separately." />
              <ListEditor items={exclusions} setItems={setExclusions} placeholder="e.g. Travel insurance" addLabel="Add exclusion" />
            </Card>
          </div>
        )}

        {tab === 'addons' && (
          <div className="grid gap-6">
            {/* Add-ons */}
            <Card className="p-6">
              <SectionHead icon="sparkle" title="Add-ons" hint="Optional supplements guests can choose during checkout, priced per person." />
              {addOns.length > 0 && (
                <div className="mb-1 flex gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="flex-1">Add-on name</span>
                  <span className="w-36">Price (₹ / person)</span>
                  <span className="w-10" />
                </div>
              )}
              <div className="grid gap-2">
                {addOns.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input value={a.item} placeholder="e.g. Coral Island Tour"
                        onChange={(e) => setAddOns(addOns.map((x, k) => (k === i ? { ...x, item: e.target.value } : x)))} />
                    </div>
                    <div className="w-36">
                      <Input type="number" min="0" value={a.price} placeholder="2500"
                        onChange={(e) => setAddOns(addOns.map((x, k) => (k === i ? { ...x, price: e.target.value } : x)))} />
                    </div>
                    <button type="button" onClick={() => setAddOns(addOns.filter((_, k) => k !== i))}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:text-status-urgent"><Icon name="x" size={15} /></button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" icon="plus" className="mt-3" onClick={() => setAddOns([...addOns, { item: '', price: '' }])}>Add add-on</Button>
            </Card>
          </div>
        )}

        {tab === 'policy' && (
          <div className="grid gap-6">
            {/* Policy */}
            <Card className="p-6">
              <SectionHead icon="wallet" title="Policy" hint="Payment terms and cancellation rules." />
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Booking amount (₹ / seat)" hint="Advance collected per seat to confirm a booking.">
                  <Input type="number" min="0" value={payment.advancePerSeat} onChange={setPay('advancePerSeat')} placeholder="25000" />
                </Field>
                <Field label="Balance due (days before travel)">
                  <Input type="number" min="0" value={payment.balanceDueDays} onChange={setPay('balanceDueDays')} placeholder="20" />
                </Field>
                <Field label="TA commission (₹)"><Input type="number" min="0" value={payment.taCommission} onChange={setPay('taCommission')} placeholder="2000" /></Field>
              </div>
              <div className="mb-1 mt-5 flex flex-wrap items-center justify-between gap-2">
                <Eyebrow>Cancellation policy</Eyebrow>
                <Button variant="outline" size="sm" icon="upload" onClick={() => setPolBulkOpen(true)}>Bulk upload</Button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">Each tier: cancel this many days before travel → this % of the amount paid is refunded. Closer tiers should refund less.</p>
              <div className="grid gap-2">
                <div className="hidden gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
                  <span className="flex-1">Days before travel</span>
                  <span className="flex-1">Refund %</span>
                  <span className="w-10" />
                </div>
                {cancellation.map((cn, i) => (
                  <div key={i} className="flex gap-2">
                    <Input className="flex-1" type="number" min="0" value={cn.days} placeholder="20"
                      onChange={(e) => setCancellation(cancellation.map((x, k) => (k === i ? { ...x, days: e.target.value } : x)))} />
                    <Input className="flex-1" type="number" min="0" max="100" value={cn.refundPercent} placeholder="50"
                      onChange={(e) => setCancellation(cancellation.map((x, k) => (k === i ? { ...x, refundPercent: e.target.value } : x)))} />
                    <button type="button" onClick={() => setCancellation(cancellation.filter((_, k) => k !== i))}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:text-status-urgent"><Icon name="x" size={15} /></button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" icon="plus" className="mt-3" onClick={() => setCancellation([...cancellation, { days: '', refundPercent: '' }])}>Add rule</Button>

              <Modal
                open={polBulkOpen}
                onClose={() => setPolBulkOpen(false)}
                title="Bulk upload cancellation tiers"
                subtitle="Paste rows or upload a file — one tier per line: days before travel, refund %."
                width="max-w-xl"
                footer={
                  <>
                    <Button variant="ghost" onClick={() => setPolBulkOpen(false)}>Cancel</Button>
                    <Button icon="plus" disabled={parsePolicyRows(polBulkText).length === 0} onClick={applyPolicyBulk}>
                      Add {parsePolicyRows(polBulkText).length || ''} tier{parsePolicyRows(polBulkText).length === 1 ? '' : 's'}
                    </Button>
                  </>
                }
              >
                <div className="grid gap-3">
                  <input ref={polBulkFileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden onChange={onPolBulkFile} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" icon="upload" onClick={() => polBulkFileRef.current?.click()}>Upload file</Button>
                    <Button variant="outline" size="sm" icon="download" onClick={() => downloadPolicyTemplate('xlsx')}>Excel template</Button>
                    <Button variant="outline" size="sm" icon="download" onClick={() => downloadPolicyTemplate('csv')}>CSV template</Button>
                  </div>
                  <Textarea rows={6} value={polBulkText} onChange={(e) => setPolBulkText(e.target.value)}
                    placeholder={'Days before travel\tRefund %\n30\t100\n20\t50\n7\t0'} />
                  {parsePolicyRows(polBulkText).length > 0 && (
                    <div className="overflow-hidden rounded-xl border">
                      <p className="border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview · {parsePolicyRows(polBulkText).length} tiers</p>
                      <div className="grid gap-1 p-3 text-sm">
                        {parsePolicyRows(polBulkText).map((r, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span>Cancel ≥ {r.days} day{r.days === 1 ? '' : 's'} before travel</span>
                            <span className="font-semibold tabular-nums">{r.refundPercent}% refund</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Modal>
            </Card>
          </div>
        )}

        {tab === 'terms' && (
          tplMgrOpen ? (
            /* Full-page Terms & Conditions templates manager */
            <div className="grid gap-6">
              <Card className="p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                  <div>
                    <button type="button" onClick={() => setTplMgrOpen(false)}
                      className="mb-1 inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
                      <span aria-hidden="true">←</span> Back to terms
                    </button>
                    <h2 className="text-lg font-bold">Terms &amp; Conditions templates</h2>
                    <p className="text-sm text-muted-foreground">Preview, apply or remove your saved T&amp;C templates.</p>
                  </div>
                  <Button variant="outline" onClick={() => setTplMgrOpen(false)}>Done</Button>
                </div>

                {(!termsTemplates || termsTemplates.length === 0) ? (
                  <p className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
                    No templates yet. Go back to the terms editor, type your terms, then “Save as template”.
                  </p>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {termsTemplates.map((t) => (
                      <div key={t.id} className="flex flex-col rounded-xl border p-4">
                        <div className="mb-2.5 flex items-center justify-between gap-2">
                          <h4 className="text-sm font-bold">{t.name}</h4>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" icon="check" onClick={() => { setTerms(t.text); setTplMgrOpen(false) }}>Use</Button>
                            <button type="button" onClick={() => deleteTermsTemplate(t.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-status-urgent hover:underline"><Icon name="x" size={13} />Delete</button>
                          </div>
                        </div>
                        <p className="max-h-64 flex-1 overflow-y-auto whitespace-pre-line rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">{t.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          ) : (
          <div className="grid gap-6">
            {/* Terms */}
            <Card className="p-6">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <SectionHead icon="ticket" title="Terms & conditions" hint="Shown to guests on the package's Terms tab." />
                <Button variant="outline" size="sm" icon="ticket" onClick={() => setTplMgrOpen(true)}>Manage templates{termsTemplates?.length ? ` (${termsTemplates.length})` : ''}</Button>
              </div>

              {/* Quick-apply a saved template */}
              {termsTemplates?.length > 0 && (
                <div className="mb-3 rounded-xl border bg-muted/30 p-3">
                  <div className="max-w-md">
                    <Field label="Use a saved template" hint="Or open “Manage templates” to preview & organise them.">
                      <Select
                        value=""
                        onChange={(e) => {
                          const t = termsTemplates.find((x) => x.id === e.target.value)
                          if (t) setTerms(t.text)
                        }}
                      >
                        <option value="">Select a template…</option>
                        {termsTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    </Field>
                  </div>
                </div>
              )}

              <Textarea rows={10} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Enter the terms & conditions…" />

              {/* Save current text as a reusable template */}
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                <div className="min-w-[220px] flex-1">
                  <Field label="Save as template" hint="Reuse these terms on other packages.">
                    <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="e.g. Standard OYO Tours T&C" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (tplName.trim()) { saveTermsTemplate(tplName, terms); setTplName('') } } }} />
                  </Field>
                </div>
                <Button variant="outline" size="sm" icon="check" disabled={!tplName.trim() || !terms.trim()} onClick={() => { saveTermsTemplate(tplName, terms); setTplName('') }}>
                  Save template
                </Button>
              </div>
            </Card>
          </div>
          )
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------- departures editor --- */
function DeparturesEditor({ view = 'departures', cats, deps, setDeps, existingDepartures = [] }) {
  const { inventoryView, updateDeparture, deleteDeparture, airlines } = useApp()
  // Bulk delink: pick multiple departures, then confirm to remove them all.
  const [delinkMode, setDelinkMode] = useState(false)
  const [delinkSel, setDelinkSel] = useState([]) // keys: existing id, or `s-<idx>`
  const toggleDelink = (key) => setDelinkSel((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]))
  const exitDelink = () => { setDelinkMode(false); setDelinkSel([]) }
  const confirmDelink = () => {
    const stagedIdx = delinkSel.filter((k) => String(k).startsWith('s-')).map((k) => Number(k.slice(2)))
    delinkSel.filter((k) => !String(k).startsWith('s-')).forEach((id) => deleteDeparture(id))
    if (stagedIdx.length) setDeps((ds) => ds.filter((_, i) => !stagedIdx.includes(i)))
    exitDelink()
  }
  const [draft, setDraft] = useState(() => blankDep(cats))
  const [editId, setEditId] = useState(null)
  const [edit, setEdit] = useState(null) // { seatsTotal, pricing }
  const startEdit = (d) => {
    setEditId(d.id)
    setEdit({
      seatsTotal: String(d.seatsTotal ?? ''),
      pricing: Object.fromEntries(cats.map((c) => [c, Object.fromEntries(OCCUPANCY.map((o) => [o.key, String(d.pricing?.[c]?.[o.key] ?? '')]))])),
    })
  }
  const setEditPrice = (c, k) => (e) => { const v = e.target.value; setEdit((s) => ({ ...s, pricing: { ...s.pricing, [c]: { ...s.pricing[c], [k]: v } } })) }
  const saveEdit = (id) => {
    updateDeparture(id, {
      seatsTotal: Math.max(0, Number(edit.seatsTotal) || 0),
      pricing: Object.fromEntries(cats.map((c) => [c, Object.fromEntries(OCCUPANCY.map((o) => [o.key, Math.max(0, Number(edit.pricing[c]?.[o.key]) || 0)]))])),
    })
    setEditId(null); setEdit(null)
  }

  // Available flight inventory to link against — live blocks with seats left.
  const liveOf = (t) => inventoryView.filter((i) => (i.type || 'airline') === t && i.status !== 'Inactive' && i.available > 0)
  const flightAll = liveOf('airline')

  // "Choose from inventory" vs "Enter manually", and multi-select of blocks.
  const [mode, setMode] = useState('inventory')
  const [selected, setSelected] = useState([])
  const [showNew, setShowNew] = useState(false) // the "New departure" picker is hidden until asked for
  const toggleSel = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  // City / month filters for the inventory picker.
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [fMonth, setFMonth] = useState('')
  const fromOpts = [...new Set(flightAll.map((i) => i.departureCity).filter(Boolean))].sort()
  const toOpts = [...new Set(flightAll.map((i) => i.arrivalCity).filter(Boolean))].sort()
  const monthOpts = [...new Set(flightAll.map((i) => i.departureDate).filter(Boolean).map((d) => d.slice(0, 7)))].sort()
  const flightFiltered = flightAll.filter((i) => (!fFrom || i.departureCity === fFrom) && (!fTo || i.arrivalCity === fTo) && (!fMonth || (i.departureDate || '').slice(0, 7) === fMonth))
  // Departure detail editor (works for saved and staged departures).
  const [depEditKey, setDepEditKey] = useState(null)
  const [depEdit, setDepEdit] = useState(null)
  const startDepEdit = (key, d) => {
    setDepEditKey(key)
    setDepEdit({ date: d.date || '', returnDate: d.returnDate || '', seatsTotal: String(d.seatsTotal ?? ''), outbound: { ...blankFlight, ...(d.outbound || {}) }, inbound: { ...blankFlight, ...(d.inbound || {}) } })
  }
  const setDepEditField = (path) => (e) => {
    const v = e.target.value
    setDepEdit((s) => { const n = { ...s }; if (path.length === 1) n[path[0]] = v; else n[path[0]] = { ...n[path[0]], [path[1]]: v }; return n })
  }
  const saveDepEdit = () => {
    const patch = { date: depEdit.date, returnDate: depEdit.returnDate || depEdit.date, seatsTotal: Math.max(0, Number(depEdit.seatsTotal) || 0), outbound: { ...depEdit.outbound }, inbound: { ...depEdit.inbound } }
    if (String(depEditKey).startsWith('s-')) { const idx = Number(depEditKey.slice(2)); setDeps((ds) => ds.map((d, i) => (i === idx ? { ...d, ...patch } : d))) }
    else { updateDeparture(depEditKey, patch) }
    setDepEditKey(null); setDepEdit(null)
  }
  // Build a staged departure from an inventory block (flights/dates/seats auto-filled).
  const depFromInv = (inv) => ({
    date: inv.departureDate || '',
    returnDate: inv.returnDate || inv.departureDate || '',
    seatsTotal: String(inv.available || inv.totalSeats || ''),
    airlineInventoryId: inv.id,
    hotelInventoryId: '',
    outbound: { from: codeOf(inv.departureCity), to: codeOf(inv.arrivalCity), airline: inv.airline, flightNo: inv.flightNo },
    inbound: { from: codeOf(inv.arrivalCity), to: codeOf(inv.departureCity), airline: inv.returnAirline || inv.airline, flightNo: inv.returnFlightNo || inv.flightNo },
    pricing: Object.fromEntries(cats.map((c) => [c, Object.fromEntries(OCCUPANCY.map((o) => [o.key, '']))])),
  })
  const addSelected = () => {
    const picks = flightAll.filter((i) => selected.includes(i.id))
    if (!picks.length) return
    setDeps((ds) => [...ds, ...picks.map(depFromInv)])
    setSelected([])
  }
  // Keep the draft's pricing grid in sync with the categories selected in Package details.
  useEffect(() => {
    setDraft((d) => ({
      ...d,
      pricing: Object.fromEntries(
        cats.map((c) => [c, d.pricing[c] || Object.fromEntries(OCCUPANCY.map((o) => [o.key, '']))]),
      ),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats.join(',')])
  const setD = (path) => (e) => {
    const v = e.target.value
    setDraft((d) => {
      const n = { ...d }
      if (path.length === 1) n[path[0]] = v
      else if (path[0] === 'outbound' || path[0] === 'inbound') n[path[0]] = { ...n[path[0]], [path[1]]: v }
      else if (path[0] === 'pricing') n.pricing = { ...n.pricing, [path[1]]: { ...n.pricing[path[1]], [path[2]]: v } }
      return n
    })
  }
  const add = () => {
    if (!draft.date || !draft.seatsTotal || !draft.outbound.flightNo) return
    setDeps((ds) => [...ds, draft])
    setDraft(blankDep(cats))
  }
  // Edit pricing for a not-yet-saved (staged) departure.
  const setDepPrice = (i, c, k) => (e) => {
    const v = e.target.value
    setDeps((ds) => ds.map((d, idx) => (idx === i ? { ...d, pricing: { ...d.pricing, [c]: { ...(d.pricing[c] || {}), [k]: v } } } : d)))
  }

  const allDeps = [
    ...existingDepartures.map((d) => ({ ...d, _staged: false })),
    ...deps.map((d, i) => ({ ...d, _staged: true, _idx: i })),
  ]

  // ---- Pricing bulk import (Date · Category · per-occupancy prices) ----
  const [priceBulkOpen, setPriceBulkOpen] = useState(false)
  const [priceBulkText, setPriceBulkText] = useState('')
  const priceFileRef = useRef(null)
  const catOf = (s) => ALL_CATEGORIES.find((c) => c.toLowerCase() === String(s || '').trim().toLowerCase())
  const normDate = (s) => {
    const t = String(s || '').trim()
    let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/); if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
    m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
    const d = new Date(t); return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  // Supports BOTH layouts:
  //  • per-category tables — a line with just a category name ("Deluxe") starts a
  //    section, then rows are Date + the 5 occupancy prices (no Category column).
  //  • legacy flat table — rows are Date, Category, then the 5 occupancy prices.
  const parsePriceRows = (text) => {
    const out = []
    let section = null
    String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map((x) => x.trim())
      // Section header: a lone category name.
      if (cells.filter((c) => c !== '').length === 1 && catOf(cells[0])) { section = catOf(cells[0]); return }
      if (/^date$/i.test(cells[0])) return // column header row
      const date = normDate(cells[0])
      if (!date) return
      // Flat layout has a category in column 2; otherwise use the current section.
      const inlineCat = catOf(cells[1])
      const category = inlineCat || section
      if (!category) return
      const start = inlineCat ? 2 : 1
      const pricing = Object.fromEntries(OCCUPANCY.map((o, i) => [o.key, Math.max(0, Number(String(cells[start + i] || '').replace(/[₹,\s]/g, '')) || 0)]))
      out.push({ date, category, pricing })
    })
    return out
  }
  const priceBulkPreview = parsePriceRows(priceBulkText)
  const onPriceFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    try {
      const wb = XLSX.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' })
      // One sheet per category → stitch into sectioned text. Fall back to the
      // first sheet (legacy flat layout) when no sheet is named after a category.
      const catSheets = wb.SheetNames.filter((n) => catOf(n))
      let text
      if (catSheets.length) {
        text = catSheets.map((n) => `${catOf(n)}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: '\t' })}`).join('\n\n')
      } else {
        const ws = wb.Sheets[wb.SheetNames[0]]
        text = ws ? XLSX.utils.sheet_to_csv(ws, { FS: '\t' }) : ''
      }
      setPriceBulkText(text)
    } catch { /* ignore */ }
    e.target.value = ''
  }
  const applyPriceBulk = () => {
    const rows = parsePriceRows(priceBulkText)
    if (!rows.length) return
    const byId = {}
    const staged = []
    rows.forEach((r) => {
      const ex = existingDepartures.find((d) => d.date === r.date)
      if (ex) { byId[ex.id] = byId[ex.id] || { ...(ex.pricing || {}) }; byId[ex.id][r.category] = r.pricing; return }
      const si = deps.findIndex((d) => d.date === r.date)
      if (si >= 0) staged.push({ idx: si, category: r.category, pricing: r.pricing })
    })
    Object.entries(byId).forEach(([id, pricing]) => updateDeparture(id, { pricing }))
    if (staged.length) {
      setDeps((ds) => ds.map((d, i) => {
        const ups = staged.filter((u) => u.idx === i)
        if (!ups.length) return d
        const pricing = { ...(d.pricing || {}) }
        ups.forEach((u) => { pricing[u.category] = u.pricing })
        return { ...d, pricing }
      }))
    }
    setPriceBulkText(''); setPriceBulkOpen(false)
  }
  const downloadPriceTemplate = (kind) => {
    // One table per category: Deluxe first, then Super Deluxe, then Standard —
    // whichever this package uses. Columns: Date + the 5 occupancy prices.
    const header = ['Date', ...OCCUPANCY.map((o) => o.label)]
    const catList = cats.length ? cats : ['Deluxe']
    const dates = allDeps.length ? [...new Set(allDeps.map((d) => d.date || '2026-10-02'))] : ['2026-10-02']
    if (kind === 'csv') {
      // Stacked sections: a category-name line, the column header, then date rows.
      const blocks = catList.map((c) => [c, header.join(','), ...dates.map((dt) => [dt, 0, 0, 0, 0, 0].join(','))].join('\n'))
      const csv = blocks.join('\n\n')
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      const a = document.createElement('a'); a.href = url; a.download = 'pricing-template.csv'; a.click(); URL.revokeObjectURL(url)
    } else {
      const wb = XLSX.utils.book_new()
      catList.forEach((c) => {
        const rows = dates.map((dt) => [dt, 0, 0, 0, 0, 0])
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
        ws['!cols'] = header.map((h) => ({ wch: Math.max(12, h.length + 2) }))
        // Sheet name is the category (Excel caps names at 31 chars).
        XLSX.utils.book_append_sheet(wb, ws, String(c).slice(0, 31))
      })
      XLSX.writeFile(wb, 'pricing-template.xlsx')
    }
  }

  return (
    <div className="mt-6 grid gap-6">
      {/* ---------------- Departures configuration ---------------- */}
      {view === 'departures' && (
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Icon name="plane" size={18} className="text-primary" />
          <h2 className="text-base font-bold">Departures configuration</h2>
          {(existingDepartures.length > 0 || deps.length > 0) && (
            <div className="ml-auto flex items-center gap-2">
              {!delinkMode ? (
                <Button variant="outline" size="sm" icon="unlink" onClick={() => setDelinkMode(true)}>Delink</Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={exitDelink}>Cancel</Button>
                  <Button variant="danger" size="sm" icon="unlink" disabled={!delinkSel.length} onClick={confirmDelink}>
                    Delink {delinkSel.length || ''} selected
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {delinkMode
            ? 'Select the departures to remove from this package, then confirm.'
            : 'Add travel dates with their round-trip flights & seats. Set the prices in Pricing configuration below.'}
        </p>

        {/* Current departures — enhanced cards, editable */}
        {(existingDepartures.length > 0 || deps.length > 0) ? (
          <div className="mt-4 grid gap-2">
            {[...existingDepartures.map((d) => ({ d, key: d.id, staged: false })), ...deps.map((d, i) => ({ d, key: `s-${i}`, staged: true, idx: i }))].map(({ d, key, staged, idx }) => (
              <div key={key}
                onClick={delinkMode ? () => toggleDelink(key) : undefined}
                className={cx('rounded-xl border px-4 py-3 transition-colors',
                  staged ? 'bg-card' : 'bg-muted/30',
                  delinkMode && 'cursor-pointer hover:bg-muted',
                  delinkMode && delinkSel.includes(key) && 'border-status-urgent ring-2 ring-status-urgent/20')}>
                <div className="flex flex-wrap items-center gap-3">
                  {delinkMode && (
                    <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2',
                      delinkSel.includes(key) ? 'border-status-urgent bg-status-urgent text-white' : 'border-border')}>
                      {delinkSel.includes(key) && <Icon name="check" size={13} />}
                    </span>
                  )}
                  <InventoryImage inv={{ type: 'airline', airline: d.outbound?.airline }} size={34} rounded="rounded-lg" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {d.date ? shortDate(d.date) : 'New departure'} <Icon name="arrowRight" size={12} className="text-muted-foreground" /> {shortDate(d.returnDate)}
                      {staged && <span className="rounded-md bg-status-proposal-bg px-1.5 text-[11px] font-semibold text-status-proposal">new</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{d.outbound?.from}→{d.outbound?.to} · {d.outbound?.airline} {d.outbound?.flightNo} · {d.seatsTotal} seats</p>
                  </div>
                  {!delinkMode && (
                    <>
                      <button type="button" onClick={() => (depEditKey === key ? setDepEditKey(null) : startDepEdit(key, d))}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        <Icon name={depEditKey === key ? 'x' : 'edit'} size={13} />{depEditKey === key ? 'Close' : 'Edit'}
                      </button>
                      {staged && <button type="button" onClick={() => setDeps((ds) => ds.filter((_, i2) => i2 !== idx))} className="text-muted-foreground hover:text-status-urgent"><Icon name="x" size={15} /></button>}
                    </>
                  )}
                </div>
                {depEditKey === key && depEdit && (
                  <div className="mt-3 grid gap-3 border-t pt-3">
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Departure date"><Input type="date" value={depEdit.date} onChange={setDepEditField(['date'])} /></Field>
                      <Field label="Return date"><Input type="date" value={depEdit.returnDate} onChange={setDepEditField(['returnDate'])} /></Field>
                      <Field label="Total seats"><Input type="number" min="0" value={depEdit.seatsTotal} onChange={setDepEditField(['seatsTotal'])} /></Field>
                    </div>
                    <datalist id="oyo-airlines">{airlines.map((a) => <option key={a.name} value={a.name} />)}</datalist>
                    <FlightRow title="Outbound flight" f={depEdit.outbound} on={(k) => setDepEditField(['outbound', k])} />
                    <FlightRow title="Return flight" f={depEdit.inbound} on={(k) => setDepEditField(['inbound', k])} />
                    <div className="flex items-center gap-2">
                      <Button size="sm" icon="check" onClick={saveDepEdit}>Save departure</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setDepEditKey(null); setDepEdit(null) }}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No departures yet. Add one below.</p>
        )}

        {/* Add-departures toggle */}
        {!showNew ? (
          <div className="mt-4">
            <Button variant="outline" size="sm" icon="plus" onClick={() => setShowNew(true)}>Add departures</Button>
          </div>
        ) : (
        <div className="mt-4 rounded-xl border bg-muted/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Eyebrow>New departure</Eyebrow>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg border bg-card p-0.5">
                {[['inventory', 'Choose from inventory'], ['manual', 'Enter manually']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setMode(k)}
                    className={cx('rounded-md px-2.5 py-1 text-xs font-semibold transition-colors', mode === k ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                    {l}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setShowNew(false)} className="text-muted-foreground hover:text-foreground"><Icon name="x" size={16} /></button>
            </div>
          </div>

          {mode === 'inventory' ? (
            /* Multi-select flight inventory → one departure per selected block */
            <div className="rounded-xl border border-primary/20 bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Icon name="boxes" size={16} className="text-primary" />
                <h4 className="text-sm font-bold">Link flight inventory</h4>
                <span className="text-xs text-muted-foreground">select one or more blocks</span>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <div className="w-28"><Select value={fFrom} onChange={(e) => setFFrom(e.target.value)}><option value="">From — all</option>{fromOpts.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
                  <div className="w-28"><Select value={fTo} onChange={(e) => setFTo(e.target.value)}><option value="">To — all</option>{toOpts.map((c) => <option key={c} value={c}>{c}</option>)}</Select></div>
                  <div className="w-28"><Select value={fMonth} onChange={(e) => setFMonth(e.target.value)}><option value="">All months</option>{monthOpts.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</Select></div>
                </div>
              </div>
              {flightFiltered.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">No matching flight inventory. Adjust the filters, add it under Inventory, or switch to “Enter manually”.</p>
              ) : (
                <div className="grid max-h-64 gap-1.5 overflow-y-auto">
                  {flightFiltered.map((i) => {
                    const on = selected.includes(i.id)
                    return (
                      <button key={i.id} type="button" onClick={() => toggleSel(i.id)}
                        className={cx('flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors', on ? 'border-primary bg-secondary' : 'hover:bg-muted')}>
                        <span className={cx('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>
                          {on && <Icon name="check" size={11} />}
                        </span>
                        <InventoryImage inv={{ type: 'airline', airline: i.airline }} size={26} rounded="rounded-md" className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium"><span className="font-mono text-xs text-muted-foreground">{i.inventoryId}</span> · {i.sector}</p>
                          <p className="text-xs text-muted-foreground">{shortDate(i.departureDate)} · {i.available} seats left</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{selected.length} selected</span>
                <Button variant="outline" size="sm" icon="plus" disabled={!selected.length} onClick={addSelected}>
                  Add {selected.length || ''} departure{selected.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          ) : (
            /* Manual entry — one departure at a time */
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Departure date"><Input type="date" value={draft.date} onChange={setD(['date'])} /></Field>
                <Field label="Return date"><Input type="date" value={draft.returnDate} onChange={setD(['returnDate'])} /></Field>
                <Field label="Total seats"><Input type="number" min="1" value={draft.seatsTotal} onChange={setD(['seatsTotal'])} placeholder="12" /></Field>
              </div>

              <datalist id="oyo-airlines">{airlines.map((a) => <option key={a.name} value={a.name} />)}</datalist>
              <FlightRow title="Outbound flight" f={draft.outbound} on={(k) => setD(['outbound', k])} />
              <FlightRow title="Return flight" f={draft.inbound} on={(k) => setD(['inbound', k])} />

              <div className="mt-3 flex justify-end">
                <Button variant="outline" size="sm" icon="plus" onClick={add} disabled={!draft.date || !draft.seatsTotal || !draft.outbound.flightNo}>
                  Add this departure
                </Button>
              </div>
            </>
          )}
        </div>
        )}
      </Card>
      )}

      {/* ---------------- Pricing configuration ---------------- */}
      {view === 'pricing' && (
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Icon name="building" size={18} className="text-primary" />
          <h2 className="text-base font-bold">Pricing configuration</h2>
          <Button variant="outline" size="sm" icon="upload" className="ml-auto" onClick={() => setPriceBulkOpen(true)}>Bulk import</Button>
        </div>
        <p className="text-xs text-muted-foreground">Per-person price for each hotel type, set against every departure date.</p>

        <Modal
          open={priceBulkOpen}
          onClose={() => setPriceBulkOpen(false)}
          title="Bulk import pricing"
          subtitle="One row per departure date & category — Date, Category, then the per-occupancy prices."
          width="max-w-2xl"
          footer={<>
            <Button variant="ghost" onClick={() => setPriceBulkOpen(false)}>Cancel</Button>
            <Button icon="check" disabled={!priceBulkPreview.length} onClick={applyPriceBulk}>Apply {priceBulkPreview.length || ''} row{priceBulkPreview.length === 1 ? '' : 's'}</Button>
          </>}
        >
          <div className="grid gap-3">
            <input ref={priceFileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden onChange={onPriceFile} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" icon="upload" onClick={() => priceFileRef.current?.click()}>Choose file</Button>
              <span className="mr-auto text-xs text-muted-foreground">Columns: Date, Category, {OCCUPANCY.map((o) => o.label).join(', ')}.</span>
              <Button variant="outline" size="sm" icon="download" onClick={() => downloadPriceTemplate('xlsx')}>Excel template</Button>
              <Button variant="outline" size="sm" icon="download" onClick={() => downloadPriceTemplate('csv')}>CSV template</Button>
            </div>
            <Textarea rows={9} value={priceBulkText} onChange={(e) => setPriceBulkText(e.target.value)} className="font-mono text-xs"
              placeholder={`Deluxe\nDate, ${OCCUPANCY.map((o) => o.label).join(', ')}\n2026-10-02, 7000, 1500, 5000, 3500, 9000\n\nSuper Deluxe\nDate, ${OCCUPANCY.map((o) => o.label).join(', ')}\n2026-10-02, 9000, 2000, 6500, 4500, 12000`} />
            {priceBulkPreview.length > 0 && (
              <div className="max-h-52 overflow-auto rounded-xl border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-3 py-1.5">Date</th><th className="px-3 py-1.5">Category</th><th className="px-3 py-1.5 text-right">Adult</th><th className="px-3 py-1.5">Match</th></tr>
                  </thead>
                  <tbody>
                    {priceBulkPreview.map((r, i) => {
                      const matched = allDeps.some((d) => d.date === r.date)
                      return (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5">{shortDate(r.date)}</td>
                          <td className="px-3 py-1.5">{r.category}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.pricing.adult ? inr(r.pricing.adult) : '—'}</td>
                          <td className="px-3 py-1.5">{matched ? <Pill tone="won">departure found</Pill> : <Pill tone="urgent">no departure</Pill>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>

        {allDeps.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Add a departure above to set its pricing.</p>
        ) : (
          <div className="mt-4 grid gap-2">
            {/* Existing (saved) departures — expandable pricing editor */}
            {existingDepartures.map((d) => (
              <div key={d.id} className="rounded-xl border bg-muted/30 px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Icon name="calendar" size={15} className="text-primary" />
                  <span className="font-semibold">{shortDate(d.date)} → {shortDate(d.returnDate)}</span>
                  <span className="text-muted-foreground">{cats[0] && d.pricing?.[cats[0]]?.adult ? `from ${inr(Number(d.pricing[cats[0]].adult))}` : 'no pricing set'}</span>
                  <button type="button" onClick={() => (editId === d.id ? setEditId(null) : startEdit(d))}
                    className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                    <Icon name={editId === d.id ? 'x' : 'edit'} size={13} />{editId === d.id ? 'Close' : 'Edit pricing'}
                  </button>
                </div>
                {editId === d.id && edit && (
                  <div className="mt-3 grid gap-3 border-t pt-3">
                    <div>
                      <Eyebrow>Total seats</Eyebrow>
                      <p className="mt-1 text-sm font-bold tabular-nums">{d.seatsTotal} <span className="text-xs font-normal text-muted-foreground">— set in Departures</span></p>
                    </div>
                    {cats.map((c) => (
                      <div key={c} className="rounded-xl border bg-card p-3">
                        <p className="mb-2 text-sm font-bold">{c} <span className="text-xs font-normal text-muted-foreground">— per person (₹)</span></p>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                          {OCCUPANCY.map((o) => (
                            <Field key={o.key} label={o.label}>
                              <Input type="number" min="0" value={edit.pricing[c]?.[o.key] ?? ''} onChange={setEditPrice(c, o.key)} placeholder="0" />
                            </Field>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <Button size="sm" icon="check" onClick={() => saveEdit(d.id)}>Save pricing</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditId(null); setEdit(null) }}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {/* Newly-added (unsaved) departures — inline pricing grid */}
            {deps.map((d, i) => (
              <div key={`np-${i}`} className="rounded-xl border px-4 py-3 text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Icon name="calendar" size={15} className="text-primary" />
                  <span className="font-semibold">{d.date ? shortDate(d.date) : 'New departure'}</span>
                  <span className="rounded-md bg-status-proposal-bg px-1.5 text-[11px] font-semibold text-status-proposal">new</span>
                </div>
                {cats.map((c) => (
                  <div key={c} className="mt-2 rounded-xl border bg-card p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <Pill tone={c === 'Super Deluxe' ? 'proposal' : 'neutral'}>{c}</Pill>
                      <span className="text-xs font-medium text-muted-foreground">per person (₹)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {OCCUPANCY.map((o) => (
                        <Field key={o.key} label={o.label}>
                          <Input type="number" min="0" value={d.pricing[c]?.[o.key] ?? ''} onChange={setDepPrice(i, c, o.key)} placeholder="0" />
                        </Field>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </Card>
      )}
    </div>
  )
}

function SectionHead({ icon, title, hint }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <Icon name={icon} size={17} className="text-primary" />
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ListEditor({ items, setItems, placeholder, addLabel }) {
  return (
    <div>
      <div className="grid gap-2">
        {items.map((val, i) => (
          <div key={i} className="flex gap-2">
            <Input className="flex-1" value={val} placeholder={placeholder}
              onChange={(e) => setItems(items.map((x, k) => (k === i ? e.target.value : x)))} />
            <button type="button" onClick={() => setItems(items.filter((_, k) => k !== i))}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:text-status-urgent"><Icon name="x" size={15} /></button>
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground">Nothing added yet.</p>}
      </div>
      <Button variant="outline" size="sm" icon="plus" className="mt-3" onClick={() => setItems([...items, ''])}>{addLabel}</Button>
    </div>
  )
}

function FlightRow({ title, f, on }) {
  return (
    <div className="mt-3 rounded-xl border bg-card p-3">
      <p className="mb-2 text-sm font-bold">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="From"><Input value={f.from} onChange={on('from')} placeholder="BOM" /></Field>
        <Field label="To"><Input value={f.to} onChange={on('to')} placeholder="IXZ" /></Field>
        <Field label="Airline"><Input list="oyo-airlines" value={f.airline} onChange={on('airline')} placeholder="Indigo" /></Field>
        <Field label="Flight no."><Input value={f.flightNo} onChange={on('flightNo')} placeholder="6E-802" /></Field>
      </div>
    </div>
  )
}
