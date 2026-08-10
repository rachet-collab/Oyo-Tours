import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Modal, Pill, Select, Textarea } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { INVENTORY_STATUSES } from '../store/data.js'
import { inr } from '../lib/format.js'
import { airlineFromFlightNo } from '../lib/airlines.js'

/* ---------------------------------------------------------------- columns ---
 * Every field we capture around a flight / hotel block, so a bulk upload can
 * populate a record as fully as the Add form does. `key` is the record field;
 * `label` is the column header shown in the template (per type). */
const COLUMNS = {
  airline: [
    { key: 'sector', label: 'Sector', req: true, hint: 'e.g. DEL-IXZ' },
    { key: 'flightNo', label: 'Flight Details', req: true, hint: 'e.g. AI 2937' },
    { key: 'departureDate', label: 'Departure Date', date: true, req: true },
    { key: 'returnSector', label: 'Return Sector', hint: 'e.g. IXZ-DEL' },
    { key: 'returnFlightNo', label: 'Return Flight Details', hint: 'e.g. AI 2936' },
    { key: 'returnDate', label: 'Return Departure Date', date: true },
    { key: 'totalSeats', label: 'Seats', num: true, req: true },
    { key: 'status', label: 'Status' },
    { key: 'packageRef', label: 'Package' },
    { key: 'remarks', label: 'Remarks' },
  ],
  // New hotel model: a destination made of cities; hotels listed per category;
  // one room total per city. One row per city + category.
  hotel: [
    { key: 'destinationCity', label: 'Destination City', req: true, hint: 'e.g. Andaman' },
    { key: 'departureCity', label: 'City', req: true, hint: 'e.g. Port Blair' },
    { key: 'category', label: 'Category', req: true, hint: 'Deluxe / Super Deluxe / Standard' },
    { key: 'arrivalCity', label: 'Hotels', req: true, hint: 'Hotel A / Hotel B / similar' },
    { key: 'totalSeats', label: 'Total Rooms', num: true, req: true },
    { key: 'departureDate', label: 'Check-in', date: true, req: true },
    { key: 'returnDate', label: 'Check-out', date: true },
    { key: 'packageRef', label: 'Package' },
    { key: 'status', label: 'Status' },
    { key: 'remarks', label: 'Remarks' },
  ],
}

// Accepted header aliases → record key (all normalised: lowercase, alnum only).
const ALIASES = {
  inventoryid: 'inventoryId', id: 'inventoryId',
  airline: 'airline', provider: 'airline', supplier: 'airline', vendor: 'airline',
  flightno: 'flightNo', flight: 'flightNo', flightdetails: 'flightNo', roomtype: 'flightNo', room: 'flightNo', ref: 'flightNo',
  sector: 'sector', route: 'sector', outboundsector: 'sector',
  returnsector: 'returnSector',
  returnflightno: 'returnFlightNo', returnflight: 'returnFlightNo', returnflightdetails: 'returnFlightNo',
  returndeparturedate: 'returnDate', returndeparture: 'returnDate',
  // Hotel destination + category + hotel-options
  destinationcity: 'destinationCity', destination: 'destinationCity', dest: 'destinationCity',
  category: 'category', tier: 'category', hotelcategory: 'category', roomcategory: 'category',
  from: 'departureCity', fromcity: 'departureCity', origin: 'departureCity', city: 'departureCity', staycity: 'departureCity', departurecity: 'departureCity',
  to: 'arrivalCity', tocity: 'arrivalCity', property: 'arrivalCity', properties: 'arrivalCity', arrivalcity: 'arrivalCity', hotelname: 'arrivalCity', hotel: 'arrivalCity', hotels: 'arrivalCity', options: 'arrivalCity', hoteloptions: 'arrivalCity',
  departuredate: 'departureDate', departure: 'departureDate', checkin: 'departureDate', checkindate: 'departureDate', date: 'departureDate', traveldate: 'departureDate',
  returndate: 'returnDate', return: 'returnDate', checkout: 'returnDate', checkoutdate: 'returnDate',
  nights: 'nights',
  totalseats: 'totalSeats', seats: 'totalSeats', totalrooms: 'totalSeats', rooms: 'totalSeats', qty: 'totalSeats', quantity: 'totalSeats',
  seatcost: 'seatCost', roomcost: 'seatCost', cost: 'seatCost', price: 'seatCost', rate: 'seatCost', costperseat: 'seatCost', costperroom: 'seatCost',
  allocatedseats: 'allocatedSeats', allocated: 'allocatedSeats', allocatedrooms: 'allocatedSeats',
  namescaptured: 'namesCaptured', named: 'namesCaptured', names: 'namesCaptured',
  releasedseats: 'releasedSeats', released: 'releasedSeats', releasedrooms: 'releasedSeats',
  advancepaid: 'advancePaid', advance: 'advancePaid',
  advancedate: 'advanceDate',
  balancepaid: 'balancePaid', balance: 'balancePaid',
  balancedate: 'balanceDate',
  status: 'status',
  package: 'packageRef', packageid: 'packageRef', packagename: 'packageRef', linkedpackage: 'packageRef',
  namingdeadline: 'namingDeadline', roomingdeadline: 'namingDeadline',
  releasedeadline: 'releaseDeadline',
  balanceduedate: 'balanceDueDate', balancedue: 'balanceDueDate',
  remarks: 'remarks', notes: 'remarks', remark: 'remarks',
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const cityCode = (c = '') => { const m = c.match(/\(([A-Za-z]{3})\)/); return (m ? m[1] : c.replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase() }
// "DEL-IXZ" / "DEL → IXZ" / "DEL/IXZ" → { from: 'DEL', to: 'IXZ' }
const splitSector = (s = '') => {
  const parts = String(s).split(/[-–→>/]|to/i).map((x) => x.trim()).filter(Boolean)
  return { from: parts[0] || '', to: parts[1] || '' }
}
const truthy = (v) => /^(y|yes|true|paid|done|1)$/i.test(String(v ?? '').trim())
const num = (v) => { const n = Number(String(v ?? '').replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? n : 0 }
const pad = (n) => String(n).padStart(2, '0')

// Normalise any date cell (JS Date, Excel serial, or common string formats) → YYYY-MM-DD.
function toISO(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  if (typeof v === 'number' && v > 20000 && v < 90000) {
    const d = new Date(Math.round((v - 25569) * 86400000))
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/) // YYYY-MM-DD
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/) // DD-MM-YYYY (India default)
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`
  const d = new Date(s)
  return isNaN(d) ? s : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const validISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s)

// Read any supported source into a 2-D array of rows (header row first).
function sheetToRows(input, kind) {
  const wb = kind === 'binary'
    ? XLSX.read(input, { type: 'array', cellDates: true })
    : XLSX.read(input, { type: 'string', cellDates: true, raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' })
}

export default function InventoryImport({ type = 'airline', open, onClose, asPage = false }) {
  const { inventoryView, packages, addInventory, updateInventory, vendors } = useApp()
  const [rows2d, setRows2d] = useState([])        // raw parsed rows
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [drag, setDrag] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(null) // { done, total } while importing
  // Per-row config (keyed by row signature): duplicate action + vendor/status mapping.
  const [rowCfg, setRowCfg] = useState({})
  const [applyStatus, setApplyStatus] = useState('Active')
  const [applyVendor, setApplyVendor] = useState('')
  const fileRef = useRef(null)

  const cols = COLUMNS[type]
  const existingIds = useMemo(() => new Set(inventoryView.map((i) => i.inventoryId)), [inventoryView])

  // Resolve a package reference (id, name, or "name — origin") to a package id.
  const resolvePackage = (ref) => {
    const r = String(ref ?? '').trim()
    if (!r) return ''
    const byId = packages.find((p) => p.id === r)
    if (byId) return byId.id
    const nr = norm(r)
    const byName = packages.find((p) => norm(`${p.name} ${p.origin}`) === nr || norm(p.name) === nr)
    return byName ? byName.id : ''
  }

  // Turn the raw rows into validated records.
  const parsed = useMemo(() => {
    if (!rows2d.length) return []
    // A flight sheet repeats Sector / Flight Details / Departure Date for the
    // return leg — remap the 2nd occurrence of each to its return-variant.
    const RETURN_OF = { sector: 'returnSector', flightNo: 'returnFlightNo', departureDate: 'returnDate' }
    const seen = {}
    const header = rows2d[0].map((h) => {
      let k = ALIASES[norm(h)] || norm(h)
      if (type === 'airline' && RETURN_OF[k]) {
        if (seen[k]) k = RETURN_OF[k]
        else seen[k] = true
      }
      return k
    })
    const idx = {}
    header.forEach((k, i) => { if (!(k in idx)) idx[k] = i })
    const get = (row, key) => (idx[key] != null ? row[idx[key]] : '')

    return rows2d.slice(1)
      .filter((row) => row.some((c) => String(c ?? '').trim() !== ''))
      .map((row, rowIdx) => {
        const rec = {}
        cols.forEach((c) => {
          let v = get(row, c.key)
          if (c.date) v = toISO(v)
          else if (c.num) v = num(v)
          else if (c.bool) v = truthy(v)
          else v = String(v ?? '').trim()
          rec[c.key] = v
        })
        const issues = []
        cols.filter((c) => c.req).forEach((c) => {
          const v = rec[c.key]
          if (c.num ? !(v > 0) : !String(v).trim()) issues.push(c.label)
        })
        cols.filter((c) => c.date).forEach((c) => {
          if (rec[c.key] && !validISO(rec[c.key])) issues.push(`${c.label}`)
        })
        const status = issues.length ? `Fix: ${issues.join(', ')}` : 'valid'
        // IDs are always system-generated — no manual "Inventory ID" column, so
        // duplicates are detected by natural key (date + flight + sector) below.
        const pkgId = resolvePackage(rec.packageRef)
        const pkgWarn = rec.packageRef && !pkgId
        // Detect a matching existing block — same date + flight no + sector.
        let dup = null
        if (type === 'airline' && status === 'valid') {
          const { from, to } = splitSector(rec.sector)
          const dupKey = `${rec.departureDate}|${String(rec.flightNo || '').toUpperCase()}|${cityCode(from)}-${cityCode(to)}`
          dup = inventoryView.find((iv) => (iv.type || 'airline') === 'airline'
            && `${iv.departureDate}|${String(iv.flightNo || '').toUpperCase()}|${cityCode(iv.departureCity)}-${cityCode(iv.arrivalCity)}` === dupKey) || null
        }
        const sig = `${rowIdx}|${rec.departureDate}|${String(rec.flightNo || '').toUpperCase()}|${rec.sector || ''}`
        return { rec, status, pkgId, pkgWarn, dup, sig }
      })
  }, [rows2d, cols, existingIds, packages, inventoryView, type]) // eslint-disable-line react-hooks/exhaustive-deps

  const valid = parsed.filter((r) => r.status === 'valid')
  // Effective per-row config with sensible defaults (duplicates default to "skip").
  const cfgFor = (r) => rowCfg[r.sig] || { action: r.dup ? 'skip' : 'add', vendor: '', status: '' }
  const setCfg = (sig, patch) => setRowCfg((m) => ({ ...m, [sig]: { ...(m[sig] || {}), ...patch } }))
  const applyToAll = () => setRowCfg((m) => {
    const n = { ...m }
    valid.forEach((r) => { n[r.sig] = { ...(n[r.sig] || { action: r.dup ? 'skip' : 'add' }), vendor: applyVendor, status: applyStatus } })
    return n
  })

  const ingest = (rows, name) => {
    setError('')
    if (!rows.length) { setError('No rows found in that file.'); return }
    setRows2d(rows)
    setFileName(name || '')
    setDone(null)
  }

  const onFiles = async (fileList) => {
    const f = fileList?.[0]
    if (!f) return
    try {
      const isText = /\.(csv|tsv|txt)$/i.test(f.name)
      const rows = isText
        ? sheetToRows(await f.text(), 'string')
        : sheetToRows(new Uint8Array(await f.arrayBuffer()), 'binary')
      ingest(rows, f.name)
    } catch {
      setError(`Could not read "${f.name}". Make sure it is an .xlsx, .xls or .csv file.`)
    }
  }

  const onPaste = (val) => {
    setText(val)
    setDone(null)
    if (!val.trim()) { setRows2d([]); setFileName(''); return }
    try { ingest(sheetToRows(val, 'string'), '') } catch { setError('Could not parse the pasted rows.') }
  }

  const rid = () => Math.floor(1000 + Math.random() * 9000)
  // Import one validated row → true if a record was created/merged, false if skipped.
  const importRow = (r) => {
      const { rec, pkgId, dup } = r
      const cfg = cfgFor(r)
      const vlist = cfg.vendor ? [cfg.vendor] : []
      const rowStatus = cfg.status || rec.status
      // Duplicate handling (flights): skip, or merge seats into the existing block.
      if (type === 'airline' && dup) {
        if (cfg.action === 'skip') return false
        if (cfg.action === 'merge') {
          updateInventory(dup.id, { totalSeats: (dup.totalSeats || 0) + Math.max(0, rec.totalSeats || 0) })
          return true
        }
        // 'add' → fall through and create a separate block
      }
      if (type === 'hotel') {
        const from = rec.departureCity
        const options = rec.arrivalCity // hotel options string, e.g. "Hotel A / Hotel B / similar"
        const property = String(options || '').split('/')[0].trim() || from
        const inventoryId = `HT-${cityCode(from)}-${rid()}`
        addInventory({
          type: 'hotel', inventoryId,
          airline: property, flightNo: 'Room',
          departureCity: from, arrivalCity: options || property,
          destinationCity: rec.destinationCity || '',
          category: rec.category || '',
          sector: `${from} · stay`,
          departureDate: rec.departureDate, returnDate: rec.returnDate || rec.departureDate,
          totalSeats: Math.max(0, rec.totalSeats || 0),
          status: INVENTORY_STATUSES.includes(rowStatus) ? rowStatus : 'Active',
          vendors: vlist,
          packageId: pkgId, remarks: rec.remarks || 'Bulk uploaded',
        })
      } else {
        // Flights: derive from/to from the Sector and the carrier from the flight no.
        const { from, to } = splitSector(rec.sector)
        const airline = airlineFromFlightNo(rec.flightNo) || 'Airline'
        const returnAirline = airlineFromFlightNo(rec.returnFlightNo) || ''
        const prefix = (airline.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()) || 'XX'
        const inventoryId = `${prefix}-${cityCode(from)}-${rid()}`
        addInventory({
          type: 'airline', inventoryId,
          airline, returnAirline,
          flightNo: String(rec.flightNo || '').toUpperCase(),
          returnFlightNo: String(rec.returnFlightNo || '').toUpperCase(),
          departureCity: from, arrivalCity: to, sector: `${cityCode(from)} → ${cityCode(to)}`,
          departureDate: rec.departureDate, returnDate: rec.returnDate || rec.departureDate,
          totalSeats: Math.max(0, rec.totalSeats || 0),
          status: INVENTORY_STATUSES.includes(rowStatus) ? rowStatus : 'Active',
          vendors: vlist,
          packageId: pkgId, remarks: rec.remarks || 'Bulk uploaded',
        })
      }
      return true
  }
  // Group hotel rows into ONE block per destination + package (cities nested).
  const buildHotelBlocks = (list) => {
    const groups = {}
    list.forEach((r) => {
      const rec = r.rec
      const cfg = cfgFor(r)
      const dest = String(rec.destinationCity || '').trim() || 'Destination'
      const gk = `${dest.toLowerCase()}|${r.pkgId || ''}`
      if (!groups[gk]) groups[gk] = { dest, pkgId: r.pkgId, status: cfg.status || rec.status, vendor: cfg.vendor, rooms: 0, byCity: {}, departureDate: '', returnDate: '', remarks: '' }
      const g = groups[gk]
      const city = String(rec.departureCity || '').trim()
      if (city) {
        const ck = city.toLowerCase()
        if (!g.byCity[ck]) g.byCity[ck] = { city, categories: [], hotels: [] }
        if (rec.arrivalCity) g.byCity[ck].hotels.push(String(rec.arrivalCity).trim())
        if (rec.category && !g.byCity[ck].categories.includes(rec.category)) g.byCity[ck].categories.push(rec.category)
      }
      const rm = Math.max(0, rec.totalSeats || 0)
      if (rm > g.rooms) g.rooms = rm
      if (rec.departureDate && !g.departureDate) g.departureDate = rec.departureDate
      if (rec.returnDate && !g.returnDate) g.returnDate = rec.returnDate
      if (rec.remarks && !g.remarks) g.remarks = rec.remarks
    })
    return Object.values(groups).map((g) => {
      const cities = Object.values(g.byCity).map((c) => ({ city: c.city, categories: c.categories, hotels: c.hotels, rooms: g.rooms }))
      return {
        type: 'hotel',
        inventoryId: `HT-${cityCode(g.dest)}-${rid()}`,
        airline: g.dest, departureCity: g.dest, arrivalCity: cities.map((c) => c.city).join(', '),
        destinationCity: g.dest, cities,
        sector: `${g.dest} · stay`, flightNo: `${cities.length} ${cities.length === 1 ? 'city' : 'cities'}`,
        departureDate: g.departureDate, returnDate: g.returnDate || g.departureDate,
        totalSeats: g.rooms, status: INVENTORY_STATUSES.includes(g.status) ? g.status : 'Active',
        vendors: g.vendor ? [g.vendor] : [],
        packageId: g.pkgId, remarks: g.remarks || 'Bulk uploaded',
      }
    })
  }

  // Chunked import so the user sees a live progress bar + a final summary.
  const runImport = () => {
    const list = valid
    if (!list.length) return
    setDone(null)
    // Hotels: collapse the rows into destination blocks first, then create those.
    const units = type === 'hotel' ? buildHotelBlocks(list) : list
    setProgress({ done: 0, total: units.length })
    let idx = 0
    let n = 0
    const step = () => {
      const end = Math.min(idx + 3, units.length)
      for (; idx < end; idx += 1) {
        if (type === 'hotel') { addInventory(units[idx]); n += 1 }
        else if (importRow(units[idx])) n += 1
      }
      setProgress({ done: idx, total: units.length })
      if (idx < units.length) { setTimeout(step, 45); return }
      setDone({ imported: n, skipped: type === 'hotel' ? (parsed.length - list.length) : (list.length - n) })
      setProgress(null); setRows2d([]); setText(''); setFileName('')
    }
    setTimeout(step, 45)
  }

  // Template with a couple of sample rows (column order matches COLUMNS).
  const SAMPLE = {
    airline: [
      ['', 'DEL-IXZ', 'AI 2937', '2026-10-02', 'IXZ-DEL', 'AI 2936', '2026-10-07', 12, 'Active', '', 'Festive block'],
      ['', 'BOM-BKK', '6E 1407', '2026-11-18', 'BKK-BOM', '6E 1408', '2026-11-23', 30, 'Active', '', ''],
    ],
    hotel: [
      ['Andaman', 'Port Blair', 'Deluxe', 'Blue Mmerlin / J Hotel / similar', 50, '2026-12-05', '2026-12-07', 'PKG-1002', 'Active', ''],
      ['Andaman', 'Havelock', 'Super Deluxe', 'Sands Marina / Symphony Palms / similar', 50, '2026-12-07', '2026-12-09', 'PKG-1002', 'Active', ''],
    ],
  }

  const sheetName = type === 'hotel' ? 'Hotel blocks' : 'Airline inventory'
  const buildWorkbook = () => {
    const header = cols.map((c) => c.label)
    const ws = XLSX.utils.aoa_to_sheet([header, ...SAMPLE[type]])
    ws['!cols'] = header.map((h) => ({ wch: Math.max(12, h.length + 2) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    return wb
  }
  const downloadExcel = () => XLSX.writeFile(buildWorkbook(), `${type}-inventory-template.xlsx`)
  const downloadCsv = () => {
    const csv = XLSX.utils.sheet_to_csv(buildWorkbook().Sheets[sheetName])
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = `${type}-inventory-template.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const reset = () => { setRows2d([]); setText(''); setFileName(''); setError(''); setDone(null); setShowPaste(false) }
  const close = () => { reset(); onClose?.() }

  const unit = type === 'hotel' ? 'block' : 'record'

  const footer = (
    <>
      {!asPage && <Button variant="ghost" onClick={close}>Close</Button>}
      <Button icon="check" disabled={!valid.length || !!progress} onClick={runImport}>
        {progress ? 'Importing…' : `Import ${valid.length} valid`}
      </Button>
    </>
  )
  const body = (
      <div className="grid gap-4">
        <p className="text-xs text-muted-foreground">{cols.length} columns · {cols.filter((c) => c.req).length} required</p>

        {/* Drag-and-drop upload zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}
          className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${drag ? 'border-primary bg-muted' : 'border-border'}`}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary"><Icon name="upload" size={20} /></span>
          <p className="text-sm font-semibold">Drag &amp; drop a file here</p>
          <p className="text-xs text-muted-foreground">Excel (.xlsx, .xls) or CSV — the first sheet is used.</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" hidden onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
          <Button size="sm" variant="outline" icon="file" className="mt-1" onClick={() => fileRef.current?.click()}>Choose file</Button>
        </div>

        <button className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => setShowPaste((s) => !s)}>
          <Icon name={showPaste ? 'chevronDown' : 'chevronRight'} size={14} /> Or paste rows (CSV / tab-separated)
        </button>
        {showPaste && (
          <Textarea rows={4} value={text} onChange={(e) => onPaste(e.target.value)}
            placeholder={`${cols.map((c) => c.label).join(',')}\n${(SAMPLE[type][0] || []).join(',')}`} className="font-mono text-xs" />
        )}

        {fileName && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon name="file" size={13} /> {fileName} · {parsed.length} row{parsed.length === 1 ? '' : 's'} read</p>}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-status-urgent/30 bg-status-urgent-bg/40 p-3 text-sm text-status-urgent">
            <Icon name="clock" size={16} /> {error}
          </div>
        )}
        {progress && (
          <div className="grid gap-1.5 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5"><Icon name="upload" size={14} /> Importing…</span>
              <span className="tabular-nums">{progress.done} / {progress.total}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
            </div>
          </div>
        )}
        {done && (
          <div className="flex items-center gap-2 rounded-xl border border-status-won/30 bg-status-won-bg/40 p-3 text-sm">
            <Icon name="check" size={16} className="text-status-won" />
            Imported {done.imported} {unit}{done.imported === 1 ? '' : 's'}{done.skipped ? ` · ${done.skipped} skipped` : ''}.
          </div>
        )}

        {parsed.length > 0 && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Pill tone="won">{valid.length} ready</Pill>
              {parsed.length - valid.length > 0 && <Pill tone="urgent">{parsed.length - valid.length} with issues</Pill>}
              {parsed.some((r) => r.dup) && <Pill tone="proposal">{parsed.filter((r) => r.dup).length} duplicate</Pill>}
            </div>

            {/* Vendor / status mapping — apply to all */}
            <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-muted/30 p-3">
              <div className="min-w-[160px]">
                <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Vendor</span>
                <Select value={applyVendor} onChange={(e) => setApplyVendor(e.target.value)}>
                  <option value="">No vendor</option>
                  {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
              </div>
              <div className="min-w-[140px]">
                <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Status</span>
                <Select value={applyStatus} onChange={(e) => setApplyStatus(e.target.value)}>
                  {INVENTORY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>
              <Button size="sm" variant="outline" onClick={applyToAll}>Apply to all</Button>
            </div>

            <div className="max-h-72 overflow-auto rounded-xl border">
              <table className="w-full min-w-[880px] text-xs">
                <thead className="sticky top-0 bg-muted/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{type === 'hotel' ? 'Hotels' : 'Airline'}</th>
                    <th className="px-3 py-2">{type === 'hotel' ? 'Destination · City · Category' : 'Route'}</th>
                    <th className="px-3 py-2">{type === 'hotel' ? 'Check-in' : 'Departure'}</th>
                    <th className="px-3 py-2 text-right">{type === 'hotel' ? 'Rooms' : 'Seats'}</th>
                    <th className="px-3 py-2">Vendor</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Row</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((r, i) => {
                    const cfg = cfgFor(r)
                    const airlineName = type === 'hotel' ? (r.rec.arrivalCity || '—') : (airlineFromFlightNo(r.rec.flightNo) || r.rec.airline || '—')
                    const route = type === 'hotel'
                      ? [r.rec.destinationCity, r.rec.departureCity, r.rec.category].filter(Boolean).join(' · ')
                      : (r.rec.sector || '—')
                    return (
                      <tr key={i} className="border-t align-top">
                        <td className="px-3 py-2 font-medium">{airlineName}<div className="text-[10px] text-muted-foreground">{type === 'hotel' ? '' : r.rec.flightNo}</div></td>
                        <td className="px-3 py-2 text-muted-foreground">{route}</td>
                        <td className="px-3 py-2">{r.rec.departureDate || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.rec.totalSeats || '—'}</td>
                        <td className="px-3 py-2">
                          {r.status === 'valid' ? (
                            <Select value={cfg.vendor} onChange={(e) => setCfg(r.sig, { vendor: e.target.value })} className="h-8 text-xs">
                              <option value="">No vendor</option>
                              {vendors.map((v) => <option key={v} value={v}>{v}</option>)}
                            </Select>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {r.status === 'valid' ? (
                            <Select value={cfg.status || r.rec.status || 'Active'} onChange={(e) => setCfg(r.sig, { status: e.target.value })} className="h-8 text-xs">
                              {INVENTORY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                            </Select>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {r.status !== 'valid' ? (
                            <Pill tone="urgent">{r.status}</Pill>
                          ) : r.dup ? (
                            <div className="grid gap-1">
                              <Pill tone="proposal">Duplicate</Pill>
                              <Select value={cfg.action} onChange={(e) => setCfg(r.sig, { action: e.target.value })} className="h-8 text-xs">
                                <option value="skip">Skip</option>
                                <option value="merge">Add seats to existing</option>
                                <option value="add">Add as separate</option>
                              </Select>
                            </div>
                          ) : (
                            <Pill tone="won">Ready</Pill>
                          )}
                          {r.pkgWarn && <div className="mt-0.5 text-[10px] text-status-proposal">package not matched</div>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Templates — bottom-right */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          <span className="mr-auto text-xs text-muted-foreground">Need the format? Download a template.</span>
          <Button size="sm" variant="outline" icon="download" onClick={downloadExcel}>Excel template</Button>
          <Button size="sm" variant="outline" icon="download" onClick={downloadCsv}>CSV template</Button>
        </div>
      </div>
  )
  if (asPage) {
    return (
      <>
        {body}
        <div className="mt-4 flex items-center justify-end gap-2 border-t pt-3">{footer}</div>
      </>
    )
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title={`Bulk upload ${type === 'hotel' ? 'hotel blocks' : 'airline inventory'}`}
      subtitle="Upload an Excel or CSV file — or paste rows. Every column the Add form captures is supported."
      width="max-w-4xl"
      footer={footer}
    >
      {body}
    </Modal>
  )
}
