import { inr, shortDate, timeLabel } from './format.js'
import { airlineLogoUrl, airlineCode } from './airlines.js'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// A rich flight-leg block: airline logo (or monogram), route, carrier + flight
// no., and departure–arrival times when captured. Mirrors the portal's leg card.
const legHtml = (leg, date, tag) => {
  if (!leg || (!leg.from && !leg.to && !leg.flightNo)) return ''
  const logo = airlineLogoUrl(leg.airline)
  const mono = (airlineCode(leg.airline) || String(leg.airline || '').replace(/[^A-Za-z]/g, '').slice(0, 2) || '✈').toUpperCase()
  const badge = logo
    ? `<img class="alogo" src="${esc(logo)}" alt="${esc(leg.airline || '')}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/><span class="amono" style="display:none">${esc(mono)}</span>`
    : `<span class="amono">${esc(mono)}</span>`
  const hasTimes = leg.departTime || leg.arriveTime
  const times = hasTimes ? `${timeLabel(leg.departTime) || '—'} <span class="arw">→</span> ${timeLabel(leg.arriveTime) || '—'}` : ''
  return `<div class="leg">
    <span class="abadge">${badge}</span>
    <div class="legmeta">
      ${tag ? `<div class="legtag">${esc(tag)}</div>` : ''}
      <div class="legroute">${esc(leg.from || '')} <span class="arw">→</span> ${esc(leg.to || '')}</div>
      <div class="legsub">${esc(leg.airline || '')}${leg.flightNo ? ` · ${esc(leg.flightNo)}` : ''}</div>
    </div>
    <div class="legtimes">${times ? `<div class="ltime">${times}</div>` : ''}${date ? `<div class="ldate">${esc(shortDate(date))}</div>` : ''}</div>
  </div>`
}

// A round-trip flight card (outbound + return) for one departure.
const flightCard = (d) => {
  const out = legHtml(d.outbound, d.date, 'Outbound')
  const ret = legHtml(d.inbound, d.returnDate, 'Return')
  if (!out && !ret) return ''
  return `<div class="fcard">${out}${ret}</div>`
}

const OCC = [
  ['adult', 'Per Adult (twin sharing)'],
  ['extraBed', 'Adult on Extra Bed'],
  ['cwb', 'Child with Bed'],
  ['cnb', 'Child without Bed'],
  ['single', 'Single Occupancy'],
]

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

  // Each departure → a travel-window header + a round-trip flight card.
  const depCards = deps.length
    ? deps.map((d) => `<div class="depblock">
        <div class="dephdr">
          <span class="depwin">${esc(shortDate(d.date))} <span class="arw">→</span> ${esc(shortDate(d.returnDate))}</span>
          ${d.seatsTotal != null ? `<span class="depseats">${esc(d.seatsTotal)} seats</span>` : ''}
        </div>
        ${flightCard(d) || '<p class="muted" style="font-size:12.5px;padding:2px 0">Flight details on request.</p>'}
      </div>`).join('')
    : '<p class="muted">Departures on request.</p>'

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
  .deps{display:grid;gap:12px}
  .depblock{border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .dephdr{display:flex;justify-content:space-between;align-items:center;background:#f9fafb;border-bottom:1px solid var(--line);padding:10px 14px}
  .depwin{font-weight:700;font-size:13px}
  .depseats{font-size:11px;font-weight:700;color:var(--muted);background:#eef2f5;border-radius:20px;padding:3px 10px}
  .fcard{display:grid}
  .leg{display:flex;align-items:center;gap:12px;padding:11px 14px}
  .leg + .leg{border-top:1px dashed var(--line)}
  .abadge{width:34px;height:34px;flex:0 0 34px;display:flex;align-items:center;justify-content:center}
  .alogo{width:34px;height:34px;object-fit:contain;border-radius:8px;border:1px solid var(--line);background:#fff}
  .amono{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:#111;color:#fff;font-weight:800;font-size:11px}
  .legmeta{flex:1;min-width:0}
  .legtag{font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700}
  .legroute{font-weight:700;font-size:14px;letter-spacing:.02em}
  .legsub{font-size:11.5px;color:var(--muted)}
  .legtimes{text-align:right;white-space:nowrap}
  .ltime{font-weight:700;font-size:13px;font-variant-numeric:tabular-nums}
  .ldate{font-size:11px;color:var(--muted)}
  .arw{color:var(--muted);font-weight:600}
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

  ${pkg.blurb && pkg.blurb.trim().length <= 260 ? `<p class="muted" style="font-size:13px;margin-bottom:6px">${esc(pkg.blurb)}</p>` : ''}

  <h3>Per-person pricing (from)</h3>
  <table>
    <thead><tr><th>Occupancy</th>${cats.map((c) => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${priceRows}</tbody>
  </table>

  <div class="total"><div class="box">
    <div class="row muted"><span>Starting from</span><span>per adult</span></div>
    <div class="row grand"><span>Final amount</span><span>${fromAdult ? esc(inr(fromAdult)) : 'On request'}</span></div>
  </div></div>

  <h3>Departures &amp; flights</h3>
  <div class="deps">${depCards}</div>

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
  const flightsHtml = departure && flightCard(departure)
    ? `<h3>Flights</h3><div class="depblock">${flightCard(departure)}</div>`
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
  .depblock{border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .fcard{display:grid}
  .leg{display:flex;align-items:center;gap:12px;padding:11px 14px}
  .leg + .leg{border-top:1px dashed var(--line)}
  .abadge{width:34px;height:34px;flex:0 0 34px;display:flex;align-items:center;justify-content:center}
  .alogo{width:34px;height:34px;object-fit:contain;border-radius:8px;border:1px solid var(--line);background:#fff}
  .amono{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:#111;color:#fff;font-weight:800;font-size:11px}
  .legmeta{flex:1;min-width:0}
  .legtag{font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700}
  .legroute{font-weight:700;font-size:14px}
  .legsub{font-size:11.5px;color:var(--muted)}
  .legtimes{text-align:right;white-space:nowrap}
  .ltime{font-weight:700;font-size:13px;font-variant-numeric:tabular-nums}
  .ldate{font-size:11px;color:var(--muted)}
  .arw{color:var(--muted);font-weight:600}
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
      <div class="muted">${esc(pkg.durationLabel || '')}</div>
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

  ${flightsHtml}
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

// ---------------------------------------------------------------------------
// BOOKING VOUCHER — a structured, printable confirmation for one booking:
// trip + flights + occupancy/rooms + travellers + hotels + payment summary.
// ---------------------------------------------------------------------------
export function buildBookingVoucherHtml(b, { pkg = {}, guest = {}, departure = null, hotelBlock = null } = {}) {
  const rooms = Math.ceil((Number(b.pax?.adult) || 0) / 2) + (Number(b.pax?.single) || 0)
  const collected = b.amountCollected != null ? b.amountCollected : (b.advanceAmount || 0)
  const balance = Math.max(0, (b.amount || 0) - collected)
  const statusTone = b.status === 'Cancelled' ? '#b71d18' : b.status === 'Confirmed' ? '#118d57' : '#b76e00'
  const statusBg = b.status === 'Cancelled' ? '#fdeceb' : b.status === 'Confirmed' ? '#eef7f0' : '#fff4e5'

  const occRows = OCC.filter(([k]) => (b.pax?.[k] || 0) > 0)
    .map(([k, label]) => `<tr><td>${esc(label)}</td><td class="num">${b.pax[k]}</td></tr>`).join('')
  const addOnRows = (b.addOns || []).filter((a) => (a.qty || 0) > 0)
    .map((a) => `<tr><td>${esc(a.item)} <span class="muted">(add-on)</span></td><td class="num">${a.qty}</td></tr>`).join('')

  const travRows = (b.travellerDetails || []).map((t, i) => {
    const name = `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name || 'Unnamed'
    return `<tr><td>${i + 1}. ${esc(name)}${i === 0 ? ' <span class="muted">· lead</span>' : ''}</td><td>${esc(t.gender || '—')}</td><td>${esc(t.passportNo || '—')}</td></tr>`
  }).join('')

  const cities = hotelBlock ? (hotelBlock.cities || []).map((c) => c.city) : []
  const allocated = (b.travellerDetails || []).some((t) => t.hotelByCity && Object.values(t.hotelByCity).some(Boolean))
  let hotelsHtml = ''
  if (cities.length && allocated) {
    hotelsHtml = `<h3>Hotels</h3>` + cities.map((city) => `
      <div class="hcard"><div class="hcat">${esc(city)}</div>${(b.travellerDetails || []).map((t) => {
        const name = `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name || 'Guest'
        return `<div class="hrow"><span class="hcity">${esc(name)}</span><span class="hopt">${esc(t.hotelByCity?.[city] || 'Not allocated')}</span></div>`
      }).join('')}</div>`).join('')
  } else {
    const offer = (pkg.hotels || []).find((h) => h.category === b.category)?.rows || []
    if (offer.length) {
      hotelsHtml = `<h3>Hotels (${esc(b.category)})</h3><p class="muted" style="font-size:12px;margin-bottom:8px">Properties from the package — final hotel confirmed before travel.</p>`
        + offer.map((r) => `<div class="hrow"><span class="hcity">${esc(r.city)}</span><span class="hopt">${esc(r.options)}</span></div>`).join('')
    }
  }
  const prefHtml = (b.hotelPreferences || []).length
    ? `<h3>Preferred hotels</h3>${(b.hotelPreferences || []).map((h) => `<div class="hrow"><span class="hcity">${esc(h.city)}</span><span class="hopt">${esc(h.property)}</span></div>`).join('')}`
    : ''

  const cancelHtml = b.status === 'Cancelled' && b.cancellation
    ? `<h3>Cancellation &amp; refund</h3>
       <div class="two">
         <div class="col"><div class="row muted"><span>Collected</span><span>${esc(inr(b.cancellation.amountPaid || 0))}</span></div>
           <div class="row"><span class="muted">Booking amount (non-refundable)</span><span style="color:#b71d18">− ${esc(inr(b.cancellation.nonRefundable || 0))}</span></div>
           <div class="row grand" style="font-size:15px"><span>Refund due</span><span style="color:#118d57">${esc(inr(b.cancellation.refundAmount || 0))}</span></div></div>
         <div class="col"><div class="row muted"><span>Reason</span><span>${esc(b.cancellation.reason || '—')}</span></div>
           <div class="row muted"><span>Status</span><span>${esc(b.cancellation.refundStatus === 'refunded' ? 'Refunded' : b.cancellation.refundStatus === 'pending' ? 'Refund pending' : 'No refund')}</span></div></div>
       </div>` : ''

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(b.ref || 'Booking')} — ${esc(pkg.destinationCity || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{--ink:#111111;--muted:#6b7280;--line:#e5e7eb;--bg:#f7f7f8;}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Public Sans',system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg);padding:32px;line-height:1.5}
  .sheet{max-width:820px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:18px;padding:44px}
  .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}
  .brand{font-size:24px;font-weight:800;letter-spacing:-.5px}
  .brand span{color:var(--muted);font-weight:600;font-size:12px;display:block;letter-spacing:.14em;text-transform:uppercase;margin-top:4px}
  .badge{display:inline-block;font-weight:700;font-size:11px;padding:5px 10px;border-radius:8px;letter-spacing:.06em}
  .docno{font-size:18px;font-weight:800;margin-top:10px;text-align:right}
  .cover{width:100%;height:200px;object-fit:cover;border-radius:14px;margin:6px 0 24px;border:1px solid var(--line)}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px 24px;margin-bottom:14px}
  .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700;margin-bottom:4px}
  h3{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:26px 0 10px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  td{padding:9px 12px;border-bottom:1px solid var(--line)}
  th{background:#f3f4f6;text-align:left;padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .muted{color:var(--muted)}
  .depblock{border:1px solid var(--line);border-radius:14px;overflow:hidden}
  .fcard{display:grid}
  .leg{display:flex;align-items:center;gap:12px;padding:11px 14px}
  .leg + .leg{border-top:1px dashed var(--line)}
  .abadge{width:34px;height:34px;flex:0 0 34px;display:flex;align-items:center;justify-content:center}
  .alogo{width:34px;height:34px;object-fit:contain;border-radius:8px;border:1px solid var(--line);background:#fff}
  .amono{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:#111;color:#fff;font-weight:800;font-size:11px}
  .legmeta{flex:1;min-width:0}.legtag{font-size:9.5px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700}
  .legroute{font-weight:700;font-size:14px}.legsub{font-size:11.5px;color:var(--muted)}
  .legtimes{text-align:right;white-space:nowrap}.ltime{font-weight:700;font-size:13px;font-variant-numeric:tabular-nums}.ldate{font-size:11px;color:var(--muted)}.arw{color:var(--muted)}
  .hcard{border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px}.hcat{font-weight:700;font-size:13px;margin-bottom:6px}
  .hrow{display:flex;gap:12px;font-size:13px;padding:5px 0;border-bottom:1px solid var(--line)}.hrow:last-child{border-bottom:0}
  .hcity{min-width:150px;color:var(--muted);font-weight:600}.hopt{flex:1}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  .row{display:flex;justify-content:space-between;padding:6px 0;font-size:13px}
  .grand{border-top:2px solid var(--ink);margin-top:4px;padding-top:10px;font-weight:800}
  .foot{margin-top:30px;padding-top:16px;border-top:1px dashed var(--line);display:flex;justify-content:space-between;font-size:12px;color:var(--muted)}
  .btn{position:fixed;top:16px;right:16px;background:#111;color:#fff;border:0;border-radius:10px;padding:10px 16px;font-family:inherit;font-weight:700;font-size:13px;cursor:pointer}
  @media print{body{background:#fff;padding:0}.sheet{border:0;border-radius:0}.btn{display:none}}
</style></head>
<body>
<button class="btn" onclick="window.print()">Print / Save as PDF</button>
<div class="sheet">
  <div class="top">
    <div class="brand">OYO Tours<span>Booking confirmation</span></div>
    <div style="text-align:right"><span class="badge" style="background:${statusBg};color:${statusTone}">${esc(b.status || '')}</span><div class="docno">${esc(b.ref || '')}</div></div>
  </div>
  ${pkg.coverUrl ? `<img class="cover" src="${esc(pkg.coverUrl)}" alt=""/>` : ''}
  <div class="grid2">
    <div><div class="lbl">Package</div><div style="font-weight:700;font-size:16px">${esc(pkg.name || '')}</div><div class="muted">${esc(pkg.origin || '')} · ${esc(b.category || '')} · ${esc(pkg.durationLabel || '')}</div></div>
    <div><div class="lbl">Guest</div><div style="font-weight:600">${esc(guest.name || '')}</div><div class="muted">${esc(guest.phone || '')}</div></div>
    <div><div class="lbl">Travel date</div><div>${departure?.date ? esc(shortDate(departure.date)) : 'On request'}${departure?.returnDate ? ` → ${esc(shortDate(departure.returnDate))}` : ''}</div></div>
    <div><div class="lbl">Party</div><div>${b.seats} traveller${b.seats > 1 ? 's' : ''} · ${rooms} room${rooms > 1 ? 's' : ''}</div></div>
    <div><div class="lbl">Booked on</div><div>${esc(shortDate(b.createdAt))}</div></div>
    <div><div class="lbl">Booked by</div><div>${esc(b.agent || '—')}</div></div>
  </div>

  ${departure && flightCard(departure) ? `<h3>Flights</h3><div class="depblock">${flightCard(departure)}</div>` : ''}

  ${occRows || addOnRows ? `<h3>Occupancy</h3><table><tbody>${occRows}${addOnRows}</tbody></table>` : ''}

  ${travRows ? `<h3>Travellers</h3><table><thead><tr><th>Name</th><th>Gender</th><th>Passport</th></tr></thead><tbody>${travRows}</tbody></table>` : ''}

  ${hotelsHtml}
  ${prefHtml}

  <h3>Payment</h3>
  <div style="max-width:320px;margin-left:auto">
    <div class="row"><span class="muted">Total</span><span style="font-weight:700">${esc(inr(b.amount || 0))}</span></div>
    <div class="row"><span class="muted">Collected</span><span style="font-weight:700;color:#118d57">${esc(inr(collected))}</span></div>
    <div class="row grand" style="font-size:16px"><span>Balance due</span><span style="color:${balance > 0 ? '#b71d18' : '#118d57'}">${balance > 0 ? esc(inr(balance)) : 'Paid'}</span></div>
  </div>
  ${cancelHtml}

  <div class="foot"><span>This is a system-generated booking confirmation.</span><span>OYO Tours · support@oyotours.in</span></div>
</div>
</body></html>`
}

export function downloadBookingVoucher(b, ctx = {}) {
  const html = buildBookingVoucherHtml(b, ctx)
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${b.ref || 'booking'}.html`
  a.click()
  URL.revokeObjectURL(url)
}
