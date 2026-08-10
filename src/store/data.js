// ---------------------------------------------------------------------------
// OYO Tours — data model for FIXED-DEPARTURE packages.
//
// A `package` is a sellable tour product (destination + origin city, e.g.
// "Andaman Ex-Mumbai"). Against each package we capture:
//   • rich detail — duration, hotels per category, day-wise itinerary,
//     inclusions / exclusions, add-on supplements, payment & cancellation policy
//   • one or more CATEGORIES (Deluxe / Super Deluxe, or a single Standard)
//   • many `departures` — the inventory unit. Each departure has a round-trip
//     flight pair, a seat count that decrements on booking, and a per-category
//     occupancy pricing grid (Per Adult / Extra Bed / Child w-bed / Child no-bed
//     / Single).
// A `booking` captures package + category + departure + a pax mix; the amount is
// computed from the grid and the seats consumed = total pax.
//
// NOTE: This portal ships EMPTY. All seed records (packages, departures, guests,
// bookings, team, inventory, vendors) start as empty arrays so the app opens as
// a blank slate. Only the default AIRLINES registry is pre-populated so airline
// pickers/logos work out of the box. Add your own data through the UI.
// ---------------------------------------------------------------------------

export const BOOKING_STATUSES = [
  'Processing', // booked, awaiting offline payment  -> gold (proposal)
  'Confirmed', // offline payment received           -> green (won)
]

export const STATUS_TONE = {
  Processing: 'proposal',
  Confirmed: 'won',
  Cancelled: 'urgent',
}

// Booking status for display. Confirmed and Cancelled are preserved; everything
// else (legacy 'Reserved', 'Awaiting Payment', …) is treated as Processing.
export const normalizeStatus = (s) => (s === 'Confirmed' ? 'Confirmed' : s === 'Cancelled' ? 'Cancelled' : 'Processing')

// Who initiated a cancellation.
export const CANCEL_TYPES = {
  guest: 'Guest-initiated',
  operator: 'OYO / operator',
}

// The occupancy rate lines that make up a package's pricing grid.
export const OCCUPANCY = [
  { key: 'adult', label: 'Per Adult', hint: 'Twin sharing' },
  { key: 'extraBed', label: 'Extra Bed', hint: 'Adult on extra bed' },
  { key: 'cwb', label: 'Child with Bed', hint: 'CWB' },
  { key: 'cnb', label: 'Child without Bed', hint: 'CNB' },
  { key: 'single', label: 'Single', hint: 'Single occupancy' },
]

// ---------------------------------------------------------------------------
// Packages — starts empty. Create packages through the UI.
// ---------------------------------------------------------------------------
export const seedPackages = []

// ---------------------------------------------------------------------------
// Departures  (the inventory unit) — starts empty.
// ---------------------------------------------------------------------------
export const seedDepartures = []

// ---------------------------------------------------------------------------
// Guests — starts empty.
// ---------------------------------------------------------------------------
export const seedGuests = []

// ---------------------------------------------------------------------------
// Default Terms & Conditions used as the starting template on a new package.
// ---------------------------------------------------------------------------
export const DEFAULT_TERMS = `1. Booking is confirmed only after the booking amount is received and OYO Tours issues a written confirmation.
2. Prices are per person and may change until the booking is confirmed. Airfare is subject to availability at the time of ticketing.
3. Hotels listed are indicative; OYO Tours may provide a similar-category alternative if a listed hotel is unavailable.
4. Government-issued photo ID is mandatory for every traveller (including children) at check-in and while travelling.
5. Standard check-in is 2:00 PM and check-out is 11:00 AM unless stated otherwise.
6. OYO Tours is not liable for delays, cancellations or itinerary changes caused by weather, flight schedules, roadblocks, or events beyond its control.
7. Any increase in taxes, fuel surcharge or government levies before departure will be charged to the guest.
8. Cancellation and refunds are governed by the cancellation policy for this package.
9. By confirming this booking, the guest accepts these terms and conditions.`

// ---------------------------------------------------------------------------
// Team members — staff with access to this portal. Starts empty.
// ---------------------------------------------------------------------------
export const seedTeam = []

// ---------------------------------------------------------------------------
// Bookings  (pax mix -> amount from grid; seats consumed = total pax) — empty.
// ---------------------------------------------------------------------------
export const seedBookings = []

// ---------------------------------------------------------------------------
// Airline Inventory  (the operations/finance source of truth)
//
// Each record is a BULK airline seat purchase for one flight + date. Sales
// deals allocate seats against it; Finance tracks the advance/balance owed to
// the airline; Operations tracks naming & seat-release deadlines derived from
// the departure date.
// ---------------------------------------------------------------------------
// The two statuses an inventory record can HAVE: Active (live/sellable) and
// Inactive (deactivated, or auto-closed once the travel date has passed).
// Everything about allocation is derived separately.
export const INVENTORY_STATUSES = ['Active', 'Inactive']
export const INV_STATUS_TONE = {
  Active: 'won',
  Inactive: 'neutral',
  // legacy 'Draft' still renders sensibly if any old stored value exists
  Draft: 'new',
  // legacy tones kept so any old stored value still renders with a sensible color
  Available: 'new',
  'Partially Allocated': 'proposal',
  'Fully Allocated': 'won',
  'Sold Out': 'won',
  Released: 'neutral',
  Completed: 'neutral',
  Cancelled: 'urgent',
}

// Allocation state is AUTO-derived from bookings (not a settable status). Shown
// as a secondary label alongside the status so the booking picture stays visible.
export const ALLOCATION_LABELS = ['Available', 'Partially Allocated', 'Fully Allocated', 'Sold Out', 'Released']
export const ALLOCATION_TONE = {
  Available: 'new',
  'Partially Allocated': 'proposal',
  'Fully Allocated': 'won',
  'Sold Out': 'won',
  Released: 'neutral',
}

export const PAYMENT_STATUSES = ['Advance Pending', 'Advance Paid', 'Fully Paid', 'Overdue']
export const PAY_STATUS_TONE = {
  'Advance Pending': 'urgent',
  'Advance Paid': 'proposal',
  'Fully Paid': 'won',
  Overdue: 'urgent',
}

// Standard deadline rules — days before departure. Overridable per record.
export const DEADLINE_RULES = { naming: 4, release: 11, balance: 10 }

export function addDays(iso, n) {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
// Derive the three operational deadlines from a departure date (unless overridden).
export function deriveDeadlines(departureDate, overrides = {}) {
  return {
    namingDeadline: overrides.namingDeadline || addDays(departureDate, -DEADLINE_RULES.naming),
    releaseDeadline: overrides.releaseDeadline || addDays(departureDate, -DEADLINE_RULES.release),
    balanceDueDate: overrides.balanceDueDate || addDays(departureDate, -DEADLINE_RULES.balance),
  }
}

// Per-type wording. The record fields are shared "slots"; only the labels
// change between an airline seat block and a hotel room block. This is the
// "same architectural framework" the SOW describes for Phase-2 hotels.
export const INVENTORY_LABELS = {
  airline: {
    title: 'Airline Inventory',
    sub: 'Bulk airline seat purchases — allocation, payments & deadlines.',
    route: '/inventory', icon: 'plane', addLabel: 'Add inventory',
    provider: 'Airline', ref: 'Flight no.', stay: 'Route', anchor: 'Departure', ret: 'Return',
    unit: 'seat', units: 'Seats', from: 'From', to: 'To',
    naming: 'Passenger naming', namingDeadline: 'Passenger naming deadline',
    release: 'Seat release', releaseDeadline: 'Seat release deadline',
  },
  hotel: {
    title: 'Hotel Inventory',
    sub: 'Bulk hotel room blocks — allocation, payments & deadlines.',
    route: '/hotels', icon: 'building', addLabel: 'Add hotel block',
    provider: 'Hotel', ref: 'Room type', stay: 'Stay', anchor: 'Check-in', ret: 'Check-out',
    unit: 'room', units: 'Rooms', from: 'City', to: 'Property',
    naming: 'Rooming list', namingDeadline: 'Rooming list deadline',
    release: 'Room release', releaseDeadline: 'Room release deadline',
  },
}

// Airlines registry — name + optional uploaded logo (data URL). When no logo is
// uploaded the UI shows a generated monogram badge. New airlines can be added.
// This is the ONLY seed list that ships pre-populated.
export const seedAirlines = [
  'Air India', 'IndiGo', 'Vistara', 'SpiceJet', 'Akasa Air',
  'Emirates', 'Qatar Airways', 'Singapore Airlines', 'Thai Airways', 'VietJet Air',
].map((name) => ({ name, logoUrl: '' }))

// Vendor registry — consolidators, DMCs and suppliers. Starts empty; add through
// the UI or as inventory records are created.
export const seedVendors = []

// Shared inventory list — both airline seat blocks and hotel room blocks.
// Starts empty. Create inventory records through the UI.
export const seedInventory = []

// Back-compat alias.
export const seedAirlineInventory = seedInventory

// --- passenger / rooming manifest -----------------------------------------
const MF_FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Diya', 'Ananya', 'Ishaan', 'Kabir', 'Sara', 'Meera', 'Rohan', 'Neha', 'Riya', 'Arjun', 'Kavya', 'Dev', 'Zara', 'Vikram', 'Priya', 'Rahul', 'Nikhil', 'Tara', 'Karan', 'Isha', 'Manav', 'Pooja', 'Aryan', 'Sneha', 'Yash', 'Anaya', 'Reyansh']
const MF_LAST = ['Sharma', 'Verma', 'Iyer', 'Nair', 'Rao', 'Mehta', 'Kapoor', 'Reddy', 'Gupta', 'Singh', 'Khan', 'Das', 'Bose', 'Patel', 'Menon']
// Deterministic placeholder manifest generator. Real bookings overwrite these
// entries with captured traveller data; kept here for any code that requests a
// synthetic manifest of length n.
const pad2 = (x) => String(x).padStart(2, '0')
export function buildManifest(n, key = '') {
  const seed = [...String(key)].reduce((s, c) => s + c.charCodeAt(0), 0)
  const out = []
  for (let i = 0; i < n; i++) {
    const first = MF_FIRST[(seed + i) % MF_FIRST.length]
    const last = MF_LAST[(seed * 3 + i) % MF_LAST.length]
    const yr = 2030 + ((seed + i) % 3)
    const mo = ((seed * 2 + i) % 12) + 1
    const day = ((seed + i) % 27) + 1
    out.push({
      name: `${first} ${last}`,
      gender: (seed + i) % 2 ? 'Male' : 'Female',
      phone: `+91 ${90000 + ((seed * 7 + i * 31) % 9999)} ${10000 + ((seed * 11 + i * 53) % 89999)}`,
      email: `${first}.${last}@email.com`.toLowerCase(),
      passportNo: `M${1000000 + ((seed * 7 + i * 131) % 8999999)}`,
      passportCountry: 'India',
      passportExpiry: `${yr}-${pad2(mo)}-${pad2(day)}`,
      frequentFlyer: '',
      docs: [],
    })
  }
  return out
}
