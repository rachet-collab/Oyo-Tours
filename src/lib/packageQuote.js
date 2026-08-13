import { inr, shortDate, timeLabel } from './format.js'

// "DEL→IXZ AI 2937 (09:15–11:40)" — flight line with times when available.
const legLine = (leg) => {
  if (!leg) return ''
  const route = `${leg.from || ''}→${leg.to || ''}`.replace(/^→$/, '')
  const t = leg.departTime || leg.arriveTime ? ` (${timeLabel(leg.departTime) || '—'}–${timeLabel(leg.arriveTime) || '—'})` : ''
  return `${route} ${leg.flightNo || ''}${t}`.trim()
}

const OCC = [
  ['adult', 'Per Adult (twin sharing)'],
  ['extraBed', 'Adult on Extra Bed'],
  ['cwb', 'Child with Bed'],
  ['cnb', 'Child without Bed'],
  ['single', 'Single Occupancy'],
]
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Build a self-contained, printable HTML quotation for a package — cover image,
// pricing grid + headline amount, departures, hotels and day-wise itinerary.
export function buildPackageQuoteHtml(pkg, deps = []) {
  const cats = pkg.categories || []
  const minFor = (cat, key) => {
    let m = Infinity
    deps.forEach((d) => { const v = Number(d.pricing?.[cat]?.[key]); if (v && v < m) m = v })
    return Number.isFinite(m) ? m : null
  }
  const fromAdult = (() => {
    let m = Infinity
    cats.forEach((c) => { const v = minFor(c, 'adult'); if (v && v < m) m = v })
    return Number.isFinite(m) ? m : null
  })()

  const priceRows = OCC.map(([key, label]) => {
    const cells = cats.map((c) => { const v = minFor(c, key); return `<td class="num">${v ? esc(inr(v)) : '—'}</td>` }).join('')
    return `<tr><td>${esc(label)}</td>${cells}</tr>`
  }).join('')

  const depRows = deps.length
    ? deps.map((d) => `<tr><td>${esc(shortDate(d.date))} → ${esc(shortDate(d.returnDate))}</td><td>${esc(legLine(d.outbound))}<br/><span class="muted">${esc(legLine(d.inbound))}</span></td><td class="num">${d.seatsTotal ?? ''}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted">Departures on request.</td></tr>'

  const hotelsHtml = (pkg.hotels || []).length
    ? `<h3>Hotels</h3>${(pkg.hotels || []).map((h) => `
        <div class="hotelcat">
          <div class="hcat">${esc(h.category)}</div>
          ${(h.rows || []).map((r) => `<div class="hrow"><span class="hcity">${esc(r.city)}</span><span class="hopt">${esc(r.options)}</span></div>`).join('')}
        </div>`).join('')}`
    : ''

  const itinHtml = (pkg.itinerary || []).length
    ? `<h3>Day-wise itinerary</h3><ol class="itin">${(pkg.itinerary || []).map((it) => `
        <li><span class="dnum">Day ${it.day}</span><div class="dbody"><strong>${esc(it.title)}</strong>${it.desc ? `<p>${esc(it.desc)}</p>` : ''}</div></li>`).join('')}</ol>`
    : ''

  const listCols = (title, items) => (items && items.length
    ? `<div class="col"><h3>${title}</h3><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`
    : '')
  const inclExcl = (pkg.inclusions?.length || pkg.exclusions?.length)
    ? `<div class="two">${listCols('Inclusions', pkg.inclusions)}${listCols('Exclusions', pkg.exclusions)}</div>`
    : ''

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(pkg.code || 'Package')} — ${esc(pkg.destinationCity || 'Quotation')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{--ink:#111111;--muted:#6b7280;--line:#e5e7eb;--bg:#f7f7f8;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Public Sans',system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg);padding:32px;line-height:1.5}
  .sheet{max-width:820px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:18px;padding:44px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
  .brand{font-size:26px;font-weight:800;letter-spacing:-.5px}
  .brand span{color:var(--muted);font-weight:600;font-size:12px;display:block;letter-spacing:.14em;text-transform:uppercase;margin-top:4px}
  .badge{display:inline-block;background:#eef7f0;color:#118d57;font-weight:700;font-size:11px;padding:5px 10px;border-radius:8px;letter-spacing:.08em}
  .docno{font-size:20px;font-weight:800;margin-top:10px;text-align:right}
  .cover{width:100%;height:240px;object-fit:cover;border-radius:14px;margin:6px 0 26px;border:1px solid var(--line)}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:26px}
  .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700;margin-bottom:5px}
  h3{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:28px 0 10px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f3f4f6;text-align:left;padding:11px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  td{padding:11px 12px;border-bottom:1px solid var(--line)}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .muted{color:var(--muted)}
  .total{margin-top:24px;display:flex;justify-content:flex-end}
  .total .box{min-width:280px}
  .total .row{display:flex;justify-content:space-between;padding:8px 0}
  .total .grand{border-top:2px solid var(--ink);margin-top:6px;padding-top:12px;font-weight:800;font-size:20px}
  .hotelcat{border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px}
  .hcat{font-weight:700;font-size:13px;margin-bottom:6px}
  .hrow{display:flex;gap:12px;font-size:13px;padding:3px 0}
  .hcity{min-width:120px;color:var(--muted);font-weight:600}
  .hopt{flex:1}
  ol.itin{list-style:none;display:grid;gap:12px}
  ol.itin li{display:flex;gap:14px}
  .dnum{min-width:64px;font-weight:700;font-size:12px;color:#118d57;padding-top:2px}
  .dbody strong{font-size:13px}
  .dbody p{font-size:12.5px;color:#374151;margin-top:2px}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  ul{margin:0;padding-left:18px;font-size:12.5px;color:#374151}
  ul li{margin:3px 0}
  .foot{margin-top:32px;padding-top:18px;border-top:1px dashed var(--line);display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}
  .btn{position:fixed;top:16px;right:16px;background:#111;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer}
  @media print{body{background:#fff;padding:0}.sheet{border:0;border-radius:0}.btn{display:none}}
</style></head>
<body>
<button class="btn" onclick="window.print()">Print / Save as PDF</button>
<div class="sheet">
  <div class="top">
    <div class="brand">OYO Tours<span>Fixed-departure holidays</span></div>
    <div style="text-align:right"><span class="badge">QUOTATION</span><div class="docno">${esc(pkg.code || '')}</div></div>
  </div>

  ${pkg.coverUrl ? `<img class="cover" src="${esc(pkg.coverUrl)}" alt="${esc(pkg.destinationCity || '')}"/>` : ''}

  <div class="grid2">
    <div>
      <div class="lbl">Package</div>
      <div style="font-weight:700;font-size:16px">${esc(pkg.name || '')}</div>
      <div class="muted">${esc(pkg.destinationCity || '')}${pkg.country ? ', ' + esc(pkg.country) : ''}</div>
    </div>
    <div>
      <div class="lbl">Details</div>
      <div>${esc(pkg.origin || '')} · ${esc(pkg.durationLabel || '')}</div>
      <div class="muted">${esc(pkg.destinationsLabel || '')}</div>
    </div>
  </div>

  ${pkg.blurb ? `<p class="muted" style="font-size:13px;margin-bottom:6px">${esc(pkg.blurb)}</p>` : ''}

  <h3>Per-person pricing (from)</h3>
  <table>
    <thead><tr><th>Occupancy</th>${cats.map((c) => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${priceRows}</tbody>
  </table>

  <div class="total"><div class="box">
    <div class="row muted"><span>Starting from</span><span>per adult</span></div>
    <div class="row grand"><span>Final amount</span><span>${fromAdult ? esc(inr(fromAdult)) : 'On request'}</span></div>
  </div></div>

  <h3>Departure dates</h3>
  <table>
    <thead><tr><th>Travel window</th><th>Flight</th><th class="num">Seats</th></tr></thead>
    <tbody>${depRows}</tbody>
  </table>

  ${hotelsHtml}
  ${itinHtml}
  ${inclExcl}

  <div class="foot">
    <span>Prices are per person, subject to availability at the time of booking.</span>
    <span>OYO Tours · support@oyotours.in</span>
  </div>
</div>
</body></html>`
}

export function downloadPackageQuote(pkg, deps = []) {
  const html = buildPackageQuoteHtml(pkg, deps)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${pkg.code || 'package'}-${String(pkg.destinationCity || 'quote').replace(/\s+/g, '-')}.html`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// GUEST-SPECIFIC quote — a personalised quotation built from a checkout
// selection (a specific guest's requirements: category, date, pax mix, chosen
// hotels & add-ons) with a line-item price breakdown and the final amount.
// ---------------------------------------------------------------------------
export function buildGuestQuoteHtml(pkg, sel = {}) {
  const {
    leadName = 'Guest', category = '', departure = null,
    rooms = 1, seats = 0, pax = {}, grid = null,
    addOns = [], hotelPreferences = [], amount = 0, quoteDate = '',
  } = sel

  const lineRows = OCC
    .filter(([key]) => (pax[key] || 0) > 0 && grid)
    .map(([key, label]) => {
      const qty = pax[key] || 0
      const unit = grid[key] || 0
      return `<tr><td>${esc(label)}</td><td class="num">${qty}</td><td class="num">${esc(inr(unit))}</td><td class="num">${esc(inr(qty * unit))}</td></tr>`
    }).join('')
  const addOnRows = (addOns || [])
    .filter((a) => (a.qty || 0) > 0)
    .map((a) => `<tr><td>${esc(a.item)} <span class="muted">(add-on)</span></td><td class="num">${a.qty}</td><td class="num">${esc(inr(a.price || 0))}</td><td class="num">${esc(inr((a.qty || 0) * (a.price || 0)))}</td></tr>`)
    .join('')

  // Hotels for the chosen category, honouring any preferred-property picks.
  const catRows = (pkg.hotels || []).find((h) => h.category === category)?.rows || []
  const prefBy = Object.fromEntries((hotelPreferences || []).map((p) => [p.city, p.property]))
  const hotelsHtml = catRows.length
    ? `<h3>Hotels (${esc(category)})</h3>${catRows.map((r) => `
        <div class="hrow"><span class="hcity">${esc(r.city)}</span><span class="hopt">${esc(prefBy[r.city] || r.options)}</span></div>`).join('')}`
    : ''

  const itinHtml = (pkg.itinerary || []).length
    ? `<h3>Day-wise itinerary</h3><ol class="itin">${(pkg.itinerary || []).map((it) => `
        <li><span class="dnum">Day ${it.day}</span><div class="dbody"><strong>${esc(it.title)}</strong>${it.desc ? `<p>${esc(it.desc)}</p>` : ''}</div></li>`).join('')}</ol>`
    : ''

  const listCols = (title, items) => (items && items.length
    ? `<div class="col"><h3>${title}</h3><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`
    : '')
  const inclExcl = (pkg.inclusions?.length || pkg.exclusions?.length)
    ? `<div class="two">${listCols('Inclusions', pkg.inclusions)}${listCols('Exclusions', pkg.exclusions)}</div>`
    : ''

  const travelWindow = departure ? `${esc(shortDate(departure.date))} → ${esc(shortDate(departure.returnDate))}` : 'On request'
  const flightLine = departure
    ? `${esc(legLine(departure.outbound))} · ${esc(legLine(departure.inbound))}`
    : ''

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Quote — ${esc(leadName)} · ${esc(pkg.destinationCity || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{--ink:#111111;--muted:#6b7280;--line:#e5e7eb;--bg:#f7f7f8;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Public Sans',system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg);padding:32px;line-height:1.5}
  .sheet{max-width:820px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:18px;padding:44px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
  .brand{font-size:26px;font-weight:800;letter-spacing:-.5px}
  .brand span{color:var(--muted);font-weight:600;font-size:12px;display:block;letter-spacing:.14em;text-transform:uppercase;margin-top:4px}
  .badge{display:inline-block;background:#eef7f0;color:#118d57;font-weight:700;font-size:11px;padding:5px 10px;border-radius:8px;letter-spacing:.08em}
  .docno{font-size:15px;font-weight:700;margin-top:10px;text-align:right}
  .cover{width:100%;height:220px;object-fit:cover;border-radius:14px;margin:6px 0 26px;border:1px solid var(--line)}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:8px}
  .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700;margin-bottom:5px}
  h3{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:28px 0 10px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f3f4f6;text-align:left;padding:11px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  td{padding:11px 12px;border-bottom:1px solid var(--line)}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .muted{color:var(--muted)}
  .total{margin-top:24px;display:flex;justify-content:flex-end}
  .total .box{min-width:300px}
  .total .row{display:flex;justify-content:space-between;padding:8px 0}
  .total .grand{border-top:2px solid var(--ink);margin-top:6px;padding-top:12px;font-weight:800;font-size:22px}
  .hrow{display:flex;gap:12px;font-size:13px;padding:5px 0;border-bottom:1px solid var(--line)}
  .hcity{min-width:130px;color:var(--muted);font-weight:600}
  .hopt{flex:1}
  ol.itin{list-style:none;display:grid;gap:12px}
  ol.itin li{display:flex;gap:14px}
  .dnum{min-width:64px;font-weight:700;font-size:12px;color:#118d57;padding-top:2px}
  .dbody strong{font-size:13px}
  .dbody p{font-size:12.5px;color:#374151;margin-top:2px}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  ul{margin:0;padding-left:18px;font-size:12.5px;color:#374151}
  ul li{margin:3px 0}
  .foot{margin-top:32px;padding-top:18px;border-top:1px dashed var(--line);display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}
  .btn{position:fixed;top:16px;right:16px;background:#111;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer}
  @media print{body{background:#fff;padding:0}.sheet{border:0;border-radius:0}.btn{display:none}}
</style></head>
<body>
<button class="btn" onclick="window.print()">Print / Save as PDF</button>
<div class="sheet">
  <div class="top">
    <div class="brand">OYO Tours<span>Fixed-departure holidays</span></div>
    <div style="text-align:right"><span class="badge">QUOTATION</span><div class="docno">Prepared for ${esc(leadName)}${quoteDate ? `<br/>${esc(quoteDate)}` : ''}</div></div>
  </div>

  ${pkg.coverUrl ? `<img class="cover" src="${esc(pkg.coverUrl)}" alt="${esc(pkg.destinationCity || '')}"/>` : ''}

  <div class="grid2">
    <div>
      <div class="lbl">Package</div>
      <div style="font-weight:700;font-size:16px">${esc(pkg.name || '')}</div>
      <div class="muted">${esc(pkg.destinationCity || '')}${pkg.country ? ', ' + esc(pkg.country) : ''} · ${esc(category)}</div>
    </div>
    <div>
      <div class="lbl">Travel</div>
      <div>${travelWindow}</div>
      <div class="muted">${flightLine}</div>
    </div>
    <div>
      <div class="lbl">Guest</div>
      <div>${esc(leadName)}</div>
    </div>
    <div>
      <div class="lbl">Party</div>
      <div>${rooms} room${rooms > 1 ? 's' : ''} · ${seats} traveller${seats > 1 ? 's' : ''}</div>
    </div>
  </div>

  <h3>Price breakdown</h3>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${lineRows || ''}${addOnRows || ''}${(!lineRows && !addOnRows) ? '<tr><td colspan="4" class="muted">Pricing on request.</td></tr>' : ''}</tbody>
  </table>

  <div class="total"><div class="box">
    <div class="row muted"><span>All inclusive (per party)</span><span>${seats} pax</span></div>
    <div class="row grand"><span>Final amount</span><span>${esc(inr(amount))}</span></div>
  </div></div>

  ${hotelsHtml}
  ${itinHtml}
  ${inclExcl}

  <div class="foot">
    <span>Quote valid for 7 days · subject to availability at the time of booking.</span>
    <span>OYO Tours · support@oyotours.in</span>
  </div>
</div>
</body></html>`
}

export function downloadGuestQuote(pkg, sel = {}) {
  const html = buildGuestQuoteHtml(pkg, sel)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const who = String(sel.leadName || 'guest').replace(/\s+/g, '-').toLowerCase()
  a.download = `quote-${who}-${String(pkg.destinationCity || 'trip').replace(/\s+/g, '-')}.html`
  a.click()
  URL.revokeObjectURL(url)
}
