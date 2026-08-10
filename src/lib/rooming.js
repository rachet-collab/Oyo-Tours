import * as XLSX from 'xlsx'

// Parse a "Hotel A / Hotel B / similar" options string into distinct hotel names.
export const parseHotels = (str) =>
  String(str || '').split('/').map((s) => s.trim()).filter(Boolean).filter((s) => !/similar/i.test(s))

// Cities in a hotel block, in order.
export const blockCities = (block) => (block?.cities || []).map((c) => c.city)

// Hotel choices for a given city, scoped to a booking's category when known
// (else the union across all categories for that city).
export function hotelOptionsForCity(block, city, category) {
  const c = (block?.cities || []).find((x) => String(x.city).toLowerCase() === String(city).toLowerCase())
  if (!c) return []
  const cats = c.categories || []
  const idx = cats.findIndex((x) => String(x).toLowerCase() === String(category || '').toLowerCase())
  const src = (idx >= 0 && Array.isArray(c.hotels)) ? [c.hotels[idx]] : (Array.isArray(c.hotels) ? c.hotels : [c.hotels])
  const out = []
  src.forEach((s) => parseHotels(s).forEach((h) => { if (!out.includes(h)) out.push(h) }))
  return out
}

// Which bookings feed a hotel block: linked directly, or (fallback) same package.
export const bookingsForBlock = (bookings, block) =>
  (bookings || []).filter((b) => b.status !== 'Cancelled' &&
    (b.hotelInventoryId === block?.id || (!b.hotelInventoryId && b.packageId && b.packageId === block?.packageId)))

// Flatten a block's bookings into one row per traveller, carrying their
// per-city hotel assignments (booking.travellerDetails[i].hotelByCity).
export function travellersForBlock(bookings, block) {
  if (!block) return []
  const rows = []
  bookingsForBlock(bookings, block).forEach((b) => {
    (b.travellerDetails || []).forEach((t, idx) => {
      rows.push({
        bookingId: b.id, idx, ref: b.ref, category: b.category || '',
        name: `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.name || 'Unnamed',
        hotelByCity: t.hotelByCity || {},
      })
    })
  })
  return rows
}

// Rooming-list workbook — ONE sheet per city, each listing travellers and the
// hotel assigned to them in that city.
export function roomingWorkbook(block, bookings) {
  const wb = XLSX.utils.book_new()
  const cities = blockCities(block)
  const rows = travellersForBlock(bookings, block)
  if (!cities.length) {
    const ws = XLSX.utils.aoa_to_sheet([['No cities in this block']])
    XLSX.utils.book_append_sheet(wb, ws, 'Rooming')
    return wb
  }
  cities.forEach((city) => {
    const aoa = [['Traveller', 'Booking', 'Category', 'Hotel']]
    rows.forEach((r) => aoa.push([r.name, r.ref, r.category, r.hotelByCity[city] || '']))
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 14 }, { wch: 36 }]
    // Sheet names: ≤31 chars, no special chars.
    const safe = String(city).replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'City'
    XLSX.utils.book_append_sheet(wb, ws, safe)
  })
  return wb
}

// Build + download the rooming workbook.
export function downloadRooming(block, bookings) {
  XLSX.writeFile(roomingWorkbook(block, bookings), `${block?.inventoryId || 'rooming'}-rooming.xlsx`)
}
