import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Modal, Pill } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { OCCUPANCY } from '../store/data.js'
import { airlineFromFlightNo } from '../lib/airlines.js'

const ALL_CATEGORIES = ['Deluxe', 'Super Deluxe', 'Standard']

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const cityCode = (c = '') => (String(c).match(/\(([A-Za-z]{3})\)/)?.[1] || String(c).replace(/[^A-Za-z]/g, '').slice(0, 3)).toUpperCase()
const splitSector = (s = '') => { const p = String(s).split(/[-–→>/]|to/i).map((x) => x.trim()).filter(Boolean); return { from: p[0] || '', to: p[1] || '' } }
const pad = (n) => String(n).padStart(2, '0')
function toISO(v) {
  if (v == null || v === '') return ''
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  if (typeof v === 'number' && v > 20000 && v < 90000) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/); if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`
  const d = new Date(s); return isNaN(d) ? s : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const num = (v) => { const n = Number(String(v ?? '').replace(/[₹,\s]/g, '')); return Number.isFinite(n) ? n : 0 }

function sheetObjects(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '', cellDates: true })
  if (!rows.length) return []
  const hdr = rows[0].map((h) => norm(h))
  return rows.slice(1).filter((r) => r.some((c) => String(c ?? '').trim() !== '')).map((r) => { const o = {}; hdr.forEach((k, i) => { if (k) o[k] = r[i] }); return o })
}
// Column getter tolerant of header aliases.
const pick = (o, ...keys) => { for (const k of keys) { if (o[k] != null && String(o[k]).trim() !== '') return o[k] } return '' }

// Master template: three sheets (Packages / Departures / Pricing).
function buildTemplate() {
  const wb = XLSX.utils.book_new()
  const pkg = [['Name', 'Origin', 'Destination City', 'Country', 'Nights', 'Days', 'Destinations', 'Categories', 'Short description', 'Booking Amount', 'Balance Due Days', 'TA Commission'],
    ['Bali Fixed Departure', 'Ex Delhi', 'Bali', 'Indonesia', 5, 6, '2N Ubud · 3N Kuta', 'Deluxe, Super Deluxe', 'Beaches, temples & rice terraces.', 25000, 20, 2000]]
  const dep = [['Package', 'Sector', 'Flight', 'Departure Date', 'Return Sector', 'Return Flight', 'Return Date', 'Seats'],
    ['Bali Fixed Departure', 'DEL-DPS', 'AI 2937', '2026-10-02', 'DPS-DEL', 'AI 2936', '2026-10-07', 20]]
  const price = [['Package', 'Date', 'Category', ...OCCUPANCY.map((o) => o.label)],
    ['Bali Fixed Departure', '2026-10-02', 'Deluxe', 62999, 15000, 45000, 30000, 89999],
    ['Bali Fixed Departure', '2026-10-02', 'Super Deluxe', 79999, 18000, 55000, 38000, 109999]]
  // Policy: one row per cancellation tier, keyed by package name.
  const policy = [['Package', 'Days Before Travel', 'Refund %'],
    ['Bali Fixed Departure', 30, 100],
    ['Bali Fixed Departure', 20, 50],
    ['Bali Fixed Departure', 7, 0]]
  ;[['Packages', pkg], ['Departures', dep], ['Pricing', price], ['Policy', policy]].forEach(([name, aoa]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws['!cols'] = aoa[0].map((h) => ({ wch: Math.max(12, String(h).length + 2) }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  })
  return wb
}

export default function PackageImport({ open, onClose }) {
  const { addPackage, addDeparture } = useApp()
  const [wbData, setWbData] = useState(null) // { packages, departures, pricing }
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const fileRef = useRef(null)

  const ingest = (buf, name) => {
    try {
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const find = (kw) => wb.SheetNames.find((n) => norm(n).includes(kw))
      const s = (n) => (n ? sheetObjects(wb.Sheets[n]) : [])
      const data = { packages: s(find('package')), departures: s(find('departure')), pricing: s(find('pricing')), policy: s(find('policy')) }
      if (!data.packages.length && !data.departures.length) { setError('No "Packages" or "Departures" sheet found in that workbook.'); return }
      setWbData(data); setFileName(name || ''); setError(''); setDone(null)
    } catch { setError(`Could not read "${name}". Use the master template (.xlsx).`) }
  }
  const onFile = async (e) => { const f = e.target.files?.[0]; if (!f) return; ingest(new Uint8Array(await f.arrayBuffer()), f.name); e.target.value = '' }

  const preview = useMemo(() => {
    if (!wbData) return null
    const pkgs = wbData.packages.map((p) => ({
      name: String(pick(p, 'name', 'packagename')).trim(),
      categories: String(pick(p, 'categories', 'category') || 'Standard').split(/[,/|]/).map((c) => c.trim()).filter(Boolean),
    })).filter((p) => p.name)
    return { pkgCount: pkgs.length, depCount: wbData.departures.length, priceCount: wbData.pricing.length, pkgs }
  }, [wbData])

  const runImport = () => {
    if (!wbData) return
    // Cancellation-policy map: packageName → [{ days, refundPercent }] (highest days first)
    const policyMap = {}
    ;(wbData.policy || []).forEach((r) => {
      const pk = norm(pick(r, 'package', 'packagename'))
      const daysRaw = pick(r, 'daysbeforetravel', 'days')
      if (!pk || String(daysRaw).trim() === '') return
      const days = num(daysRaw)
      const refundPercent = Math.max(0, Math.min(100, num(pick(r, 'refund', 'refundpercent'))))
      policyMap[pk] = policyMap[pk] || []
      policyMap[pk].push({ days, refundPercent })
    })
    Object.values(policyMap).forEach((tiers) => tiers.sort((a, b) => b.days - a.days))
    // Pricing maps. Primary key packageName|date → { category: {occ:price} }.
    // Also a by-date-only fallback so a name mismatch (or a single-package file)
    // still applies prices when the date+category line up.
    const priceMap = {}
    const priceByDate = {}
    wbData.pricing.forEach((r) => {
      const pk = norm(pick(r, 'package', 'packagename')); const date = toISO(pick(r, 'date', 'departuredate'))
      const cat = ALL_CATEGORIES.find((c) => c.toLowerCase() === String(pick(r, 'category')).trim().toLowerCase())
      if (!date || !cat) return
      const grid = Object.fromEntries(OCCUPANCY.map((o) => [o.key, num(r[norm(o.label)])]))
      if (pk) { const key = `${pk}|${date}`; priceMap[key] = priceMap[key] || {}; priceMap[key][cat] = grid }
      priceByDate[date] = priceByDate[date] || {}; priceByDate[date][cat] = grid
    })
    const namedPkgCount = wbData.packages.filter((p) => String(pick(p, 'name', 'packagename')).trim()).length
    // Create packages, map name → {id, categories}
    const byName = {}
    let nPkg = 0
    wbData.packages.forEach((p) => {
      const name = String(pick(p, 'name', 'packagename')).trim(); if (!name) return
      const cats = ALL_CATEGORIES.filter((c) => String(pick(p, 'categories', 'category') || 'Standard').toLowerCase().includes(c.toLowerCase()))
      const nights = num(pick(p, 'nights')); const days = num(pick(p, 'days')) || (nights ? nights + 1 : 0)
      // Payment terms + cancellation policy (from the Packages row + Policy sheet).
      const advancePerSeat = num(pick(p, 'bookingamount', 'advance', 'advanceperseat'))
      const balanceDueDays = num(pick(p, 'balanceduedays', 'balancedays'))
      const taCommission = num(pick(p, 'tacommission', 'commission'))
      const cancellation = (policyMap[norm(name)] || []).map((r) => ({
        days: r.days, refundPercent: r.refundPercent,
        timeline: `${r.days} days before travel`,
        penalty: `${r.refundPercent}% refundable`,
      }))
      const created = addPackage({
        name,
        origin: String(pick(p, 'origin') || 'Ex Delhi'),
        destinationCity: String(pick(p, 'destinationcity', 'destination', 'city') || name),
        country: String(pick(p, 'country') || 'India'),
        nights, days, durationLabel: `${nights}N / ${days}D`,
        destinationsLabel: String(pick(p, 'destinations', 'destinationslabel') || pick(p, 'destinationcity') || name),
        blurb: String(pick(p, 'shortdescription', 'blurb', 'description') || ''),
        categories: cats.length ? cats : ['Standard'],
        payment: {
          advancePerSeat, balanceDueDays, taCommission,
          bookingAmount: advancePerSeat ? `₹${advancePerSeat.toLocaleString('en-IN')} per seat` : '',
          balance: balanceDueDays ? `Balance due ${balanceDueDays} days before travel` : '',
        },
        cancellation,
      })
      byName[norm(name)] = { id: created.id, cats: cats.length ? cats : ['Standard'] }
      nPkg += 1
    })
    // Departures (with merged pricing)
    let nDep = 0
    let nUnpriced = 0
    wbData.departures.forEach((d) => {
      const pk = norm(pick(d, 'package', 'packagename')); const pkg = byName[pk]; if (!pkg) return
      const { from, to } = splitSector(pick(d, 'sector', 'outboundsector', 'route'))
      const date = toISO(pick(d, 'departuredate', 'date'))
      const flightNo = String(pick(d, 'flight', 'flightdetails', 'flightno') || '').toUpperCase()
      const retFlight = String(pick(d, 'returnflight', 'returnflightdetails', 'returnflightno') || '').toUpperCase()
      const airline = airlineFromFlightNo(flightNo) || 'Airline'
      // Prefer the package+date match; fall back to date-only pricing when the
      // Pricing sheet's package name differs or there's just one package.
      const byName2 = priceMap[`${pk}|${date}`]
      const priceForDate = byName2 || (namedPkgCount <= 1 ? (priceByDate[date] || {}) : {})
      const pricing = Object.fromEntries(pkg.cats.map((c) => [c, priceForDate[c] || Object.fromEntries(OCCUPANCY.map((o) => [o.key, 0]))]))
      const priced = pkg.cats.some((c) => Object.values(pricing[c] || {}).some((v) => Number(v) > 0))
      if (!priced) nUnpriced += 1
      addDeparture({
        packageId: pkg.id, date, returnDate: toISO(pick(d, 'returndate', 'returndeparturedate')) || date,
        outbound: { from: cityCode(from), to: cityCode(to), airline, flightNo },
        inbound: { from: cityCode(to), to: cityCode(from), airline: airlineFromFlightNo(retFlight) || airline, flightNo: retFlight || flightNo },
        seatsTotal: Math.max(0, num(pick(d, 'seats', 'totalseats'))),
        pricing,
      })
      nDep += 1
    })
    setDone({ nPkg, nDep, nUnpriced })
    setWbData(null); setFileName('')
  }

  const downloadTemplate = () => XLSX.writeFile(buildTemplate(), 'package-master-template.xlsx')
  const close = () => { setWbData(null); setFileName(''); setError(''); setDone(null); onClose?.() }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Bulk upload packages"
      subtitle="Upload one master Excel with Packages, Departures & Pricing sheets."
      width="max-w-2xl"
      footer={<>
        <Button variant="ghost" onClick={close}>Close</Button>
        <Button icon="check" disabled={!preview || (!preview.pkgCount && !preview.depCount)} onClick={runImport}>
          Import {preview ? `${preview.pkgCount} package${preview.pkgCount === 1 ? '' : 's'}` : ''}
        </Button>
      </>}
    >
      <div className="grid gap-4">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={onFile} />
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary"><Icon name="upload" size={20} /></span>
          <p className="text-sm font-semibold">Master workbook (.xlsx)</p>
          <p className="text-xs text-muted-foreground">Sheets: <span className="font-semibold">Packages</span>, <span className="font-semibold">Departures</span>, <span className="font-semibold">Pricing</span>, <span className="font-semibold">Policy</span>.</p>
          <Button size="sm" variant="outline" icon="file" className="mt-1" onClick={() => fileRef.current?.click()}>Choose file</Button>
        </div>

        {fileName && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon name="file" size={13} /> {fileName}</p>}
        {error && <div className="flex items-center gap-2 rounded-xl border border-status-urgent/30 bg-status-urgent-bg/40 p-3 text-sm text-status-urgent"><Icon name="clock" size={16} /> {error}</div>}
        {done && (
          <div className="grid gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-status-won/30 bg-status-won-bg/40 p-3 text-sm"><Icon name="check" size={16} className="text-status-won" /> Created {done.nPkg} package{done.nPkg === 1 ? '' : 's'} · {done.nDep} departure{done.nDep === 1 ? '' : 's'}.</div>
            {done.nUnpriced > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-status-proposal/30 bg-status-proposal-bg/40 p-3 text-sm text-status-proposal">
                <Icon name="clock" size={16} className="mt-0.5 shrink-0" />
                <span>{done.nUnpriced} departure{done.nUnpriced === 1 ? '' : 's'} imported with no price. Check the <span className="font-semibold">Pricing</span> sheet — the Package name and Dates must match the Departures rows exactly. You can also set prices on each package's Pricing tab.</span>
              </div>
            )}
          </div>
        )}

        {preview && (preview.pkgCount > 0 || preview.depCount > 0) && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
            <Pill tone="won">{preview.pkgCount} package{preview.pkgCount === 1 ? '' : 's'}</Pill>
            <Pill tone="new">{preview.depCount} departure{preview.depCount === 1 ? '' : 's'}</Pill>
            <Pill tone="proposal">{preview.priceCount} price row{preview.priceCount === 1 ? '' : 's'}</Pill>
            <span className="text-xs text-muted-foreground">{preview.pkgs.map((p) => p.name).slice(0, 4).join(', ')}{preview.pkgs.length > 4 ? '…' : ''}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t pt-3">
          <span className="mr-auto text-xs text-muted-foreground">Need the format? Download the master template.</span>
          <Button size="sm" variant="outline" icon="download" onClick={downloadTemplate}>Master template</Button>
        </div>
      </div>
    </Modal>
  )
}
