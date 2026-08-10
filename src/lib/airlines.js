// Map common airline names → IATA code, so we can load their logo from a public
// logo CDN at runtime (the browser fetches it; falls back to a monogram offline).
const NAME_TO_CODE = {
  'air india': 'AI',
  'indigo': '6E',
  'vistara': 'UK',
  'spicejet': 'SG',
  'akasa air': 'QP',
  'go first': 'G8',
  'alliance air': '9I',
  'emirates': 'EK',
  'qatar airways': 'QR',
  'etihad airways': 'EY',
  'singapore airlines': 'SQ',
  'thai airways': 'TG',
  'thai airasia': 'FD',
  'vietjet air': 'VJ',
  'vietnam airlines': 'VN',
  'malaysia airlines': 'MH',
  'airasia': 'AK',
  'cathay pacific': 'CX',
  'british airways': 'BA',
  'lufthansa': 'LH',
  'air france': 'AF',
  'klm': 'KL',
  'turkish airlines': 'TK',
  'sri lankan airlines': 'UL',
  'bangkok airways': 'PG',
  'scoot': 'TR',
  'batik air': 'ID',
  'oman air': 'WY',
  'flydubai': 'FZ',
}

export function airlineCode(name = '') {
  const n = String(name).trim().toLowerCase()
  if (NAME_TO_CODE[n]) return NAME_TO_CODE[n]
  // partial match (e.g. "Air India Express")
  const hit = Object.keys(NAME_TO_CODE).find((k) => n.includes(k))
  return hit ? NAME_TO_CODE[hit] : ''
}

// Reverse map (IATA code → proper airline name) for deriving the carrier from a
// flight number like "AI 2937" or "6E-1407".
const CODE_TO_NAME = Object.fromEntries(
  Object.entries(NAME_TO_CODE).map(([name, code]) => [code, name.replace(/\b\w/g, (m) => m.toUpperCase())]),
)

// Register a user-managed airline (from the backend) so its code participates in
// name↔code↔logo resolution and flight-number parsing, just like the built-ins.
export function registerAirline(name, code) {
  const n = String(name || '').trim()
  const c = String(code || '').trim().toUpperCase()
  if (!n || !c) return
  NAME_TO_CODE[n.toLowerCase()] = c
  if (!CODE_TO_NAME[c]) CODE_TO_NAME[c] = n
}
export function airlineFromFlightNo(flightNo = '') {
  const m = String(flightNo).toUpperCase().replace(/\s+/g, '').match(/^([A-Z0-9]{2})/)
  const code = m ? m[1] : ''
  return CODE_TO_NAME[code] || ''
}

// Public airline-logo CDN keyed by IATA code (Kiwi.com). Returns '' if unknown.
export function airlineLogoUrl(name = '') {
  const code = airlineCode(name)
  return code ? `https://images.kiwi.com/airlines/128/${code}.png` : ''
}
