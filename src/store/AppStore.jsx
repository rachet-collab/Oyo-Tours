import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import {
  seedPackages,
  seedDepartures,
  seedGuests,
  seedBookings,
  seedTeam,
  seedAirlineInventory,
  seedAirlines,
  seedVendors,
  deriveDeadlines,
  OCCUPANCY,
} from './data.js'
import { hasSupabase } from '../lib/supabase.js'
import { applicableRule, cancellationRules, refundFor } from '../lib/policy.js'
import { airlineCode, registerAirline } from '../lib/airlines.js'
import {
  loadAll,
  loadCore,
  getCurrentUser,
  authSignIn,
  authSignOut,
  onAuthChange,
  apiInsertPackage,
  apiUpdatePackage,
  apiDeletePackage,
  apiInsertGuest,
  apiInsertDeparture,
  apiDeleteDeparture,
  apiInsertBooking,
  apiCreateBooking,
  apiUpsertBooking,
  apiUpdateBookingStatus,
  apiUpdateDepartureSeats,
  apiUpdateDeparture,
  apiUpsertInventory,
  apiDeleteInventory,
  apiUpsertAirline,
  apiDeleteAirline,
  apiInsertVendor,
  apiUpsertTeamMember,
  apiDeleteTeamMember,
} from '../lib/api.js'

const AppContext = createContext(null)

const genId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`
// Tracks flight/hotel signatures already mirrored into inventory this session so
// a bulk upload doesn't create duplicate inventory blocks for the same flight+date.
const autoInvKeys = new Set()
const normFlight = (f) => String(f || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const genRef = () => `OYO-${Math.floor(20000 + Math.random() * 79999)}`
const today = () => new Date().toISOString().slice(0, 10)
// Full timestamp (date + time) for activity-log entries.
const stamp = () => new Date().toISOString()
const roleLabel = (role) => ({ admin: 'Admin', operations: 'Operations', sales: 'Sales' }[role] || 'Sales')
const daysUntil = (iso) =>
  iso ? Math.round((new Date(iso + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000) : null

// Enrich a raw airline-inventory record with all derived financial / allocation /
// deadline values the UI needs.
export function computeInventory(inv) {
  const totalUnits = inv.totalSeats || 0
  const releasedUnits = inv.releasedSeats || 0
  const available = Math.max(0, (inv.totalSeats || 0) - (inv.allocatedSeats || 0) - (inv.releasedSeats || 0))
  const utilization = inv.totalSeats ? Math.round((inv.allocatedSeats / inv.totalSeats) * 100) : 0
  // Manifest (captured names) is the source of truth for naming progress.
  const namesCaptured = inv.manifest ? inv.manifest.length : (inv.namesCaptured || 0)
  const namesPending = Math.max(0, (inv.allocatedSeats || 0) - namesCaptured)
  const namingPct = inv.allocatedSeats ? Math.round((namesCaptured / inv.allocatedSeats) * 100) : 0
  // Trip lifecycle vs. date. Once the trip's end (return, or departure if one-way)
  // has passed, the record auto-closes to Inactive.
  const tripEnd = inv.returnDate || inv.departureDate
  const tripDaysLeft = daysUntil(tripEnd)
  const isPast = tripDaysLeft != null && tripDaysLeft < 0
  // Allocation state is AUTO — derived purely from bookings/release, shown as a
  // secondary label. It is NOT the record's status.
  const allocationLabel =
    (inv.releasedSeats || 0) > 0 && available <= 0 ? 'Released'
      : (inv.allocatedSeats || 0) <= 0 ? 'Available'
        : available <= 0 ? ((inv.allocatedSeats || 0) >= (inv.totalSeats || 0) ? 'Fully Allocated' : 'Sold Out')
          : 'Partially Allocated'
  // Status is one of exactly two: Active or Inactive. It auto-flips to Inactive
  // once the travel date has passed OR once the whole block has been released
  // (nothing left to sell); a manual Inactive is kept; any other value
  // (including legacy 'Draft') resolves to Active.
  const fullyReleased = totalUnits > 0 && releasedUnits >= totalUnits
  const raw = inv.status
  const status = isPast ? 'Inactive'
    : (raw === 'Inactive' || raw === 'Cancelled' || raw === 'Completed') ? 'Inactive'
      : fullyReleased ? 'Inactive'
        : 'Active'
  const dl = deriveDeadlines(inv.departureDate, inv)
  const releaseDaysLeft = daysUntil(dl.releaseDeadline)
  const namingDaysLeft = daysUntil(dl.namingDeadline)
  return {
    ...inv,
    status, allocationLabel, namesCaptured,
    vendors: inv.vendors || [],
    available, utilization, namesPending, namingPct,
    namingDeadline: dl.namingDeadline, releaseDeadline: dl.releaseDeadline,
    releaseDaysLeft, namingDaysLeft,
    tripEnd, tripDaysLeft, isPast, fullyReleased,
  }
}

export const totalPax = (pax = {}) =>
  OCCUPANCY.reduce((s, o) => s + (Number(pax[o.key]) || 0), 0)

export const priceFor = (grid = {}, pax = {}) =>
  OCCUPANCY.reduce((s, o) => s + (Number(pax[o.key]) || 0) * (grid[o.key] || 0), 0)

// Reusable Terms & Conditions templates, persisted locally so they survive
// across package creations (and reloads) without touching the backend.
const TERMS_TPL_KEY = 'oyo.termsTemplates'
function loadTermsTemplates() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(TERMS_TPL_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
function saveTermsTemplates(list) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(TERMS_TPL_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

const initialState = {
  user: null,
  authReady: !hasSupabase, // true once the initial session check has resolved
  hydrated: !hasSupabase, // when no backend, seeds are the source of truth
  backend: hasSupabase ? 'supabase' : 'local',
  packages: seedPackages,
  departures: seedDepartures,
  guests: seedGuests,
  bookings: seedBookings,
  team: seedTeam,
  inventory: seedAirlineInventory,
  airlines: seedAirlines,
  vendors: seedVendors,
  termsTemplates: loadTermsTemplates(),
}

// --- pure booking transforms, shared by the reducer AND the action creators
// so what we dispatch is exactly what we persist (no drift). --------------
const manifestEntries = (booking, details, names) =>
  (details && details.length)
    ? details.map((d) => ({
        name: `${d.firstName || ''} ${d.lastName || ''}`.trim(),
        gender: d.gender || '', phone: d.phone || '', email: d.email || '',
        passportNo: d.passportNo || '', passportCountry: d.passportCountry || '',
        passportExpiry: d.passportExpiry || '', frequentFlyer: d.frequentFlyer || '',
        // Only keep lightweight doc references on the inventory manifest — NEVER
        // the base64 file blobs (they can be many MB each and bloat the row until
        // `select *` on inventory times out). The actual files stay on the booking.
        docs: (d.docs || []).map((doc) => ({ name: doc.name || 'Document' })),
        bookingId: booking.id, bookingRef: booking.ref, guestId: booking.guestId,
      }))
    : (names || []).map((n) => ({ name: n, bookingId: booking.id, bookingRef: booking.ref, guestId: booking.guestId }))
const withStatus = (x, { status, paymentNote, proof, cancellation, by, at }) => ({
  ...x, status,
  paymentNote: paymentNote ?? x.paymentNote,
  paymentProof: proof ?? x.paymentProof,
  cancellation: cancellation ?? x.cancellation,
  history: [...(x.history || []), { status, note: paymentNote || '', by: by || 'System', at: at || '', proofName: proof?.name || '' }],
})
const withTravellers = (x, { details, names, by, at }) => ({
  ...x, travellerDetails: details, travellers: names,
  history: [...(x.history || []), { status: x.status, note: 'Traveller details updated', by: by || 'System', at: at || '' }],
})
// Approving the payment confirms the booking (unless it was cancelled).
const withApproved = (x, { by, at }) => {
  const status = x.status === 'Cancelled' ? x.status : 'Confirmed'
  const confirmed = status === 'Confirmed' && x.status !== 'Confirmed'
  return {
    ...x, paymentApproved: true, approvedBy: by, approvedAt: at, status,
    history: confirmed
      ? [...(x.history || []), { status: 'Confirmed', note: 'Payment approved — booking confirmed', by: by || 'System', at: at || '' }]
      : (x.history || []),
  }
}
const withRefunded = (x, { by, at, note, proof }) => ({ ...x, cancellation: { ...(x.cancellation || {}), refundStatus: 'refunded', refundedBy: by, refundedAt: at, refundNote: note, refundProof: proof || (x.cancellation || {}).refundProof || null } })
// Record collection of the outstanding balance — the booking is now paid in
// full (amountCollected = total). Logged in the booking history.
const withBalance = (x, { note, proof, by, at }) => ({
  ...x, amountCollected: x.amount || 0, paymentNote: note || x.paymentNote,
  balanceProof: proof || x.balanceProof || null,
  history: [...(x.history || []), { status: x.status, note: note || 'Balance payment collected', by: by || 'System', at: at || '' }],
})
// Roll a booking's seats + manifest into a linked inventory record.
const allocateInto = (inv, booking) => ({
  ...inv,
  allocatedSeats: (inv.allocatedSeats || 0) + booking.seats,
  manifest: [...(inv.manifest || []), ...manifestEntries(booking, booking.travellerDetails, booking.travellerNames)],
})
const resyncManifest = (inv, booking, details, names) => ({
  ...inv,
  manifest: [...(inv.manifest || []).filter((m) => m.bookingId !== booking.id), ...manifestEntries(booking, details, names)],
})
// Reverse of allocateInto: return a booking's seats/rooms to the block and drop
// its manifest entries (used when a booking is cancelled).
const deallocateFrom = (inv, booking) => ({
  ...inv,
  allocatedSeats: Math.max(0, (inv.allocatedSeats || 0) - (booking.seats || 0)),
  manifest: (inv.manifest || []).filter((m) => m.bookingId !== booking.id),
})

function reducer(state, action) {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, user: action.user, authReady: true }
    case 'LOGOUT':
      // Drop the user and any loaded data so a different sign-in starts clean.
      return { ...state, user: null, authReady: true }
    case 'AUTH_READY':
      return { ...state, authReady: true }
    case 'HYDRATE':
      return { ...state, ...action.data, hydrated: true }

    case 'ADD_PACKAGE':
      return { ...state, packages: [action.pkg, ...state.packages] }

    case 'UPDATE_PACKAGE':
      return {
        ...state,
        packages: state.packages.map((p) =>
          p.id === action.id ? { ...p, ...action.patch } : p,
        ),
      }

    case 'DELETE_PACKAGE':
      return {
        ...state,
        packages: state.packages.filter((p) => p.id !== action.id),
        departures: state.departures.filter((d) => d.packageId !== action.id),
      }

    case 'ADD_DEPARTURE':
      return { ...state, departures: [action.departure, ...state.departures] }

    case 'UPDATE_DEPARTURE':
      return {
        ...state,
        departures: state.departures.map((d) => (d.id === action.id ? { ...d, ...action.patch } : d)),
      }

    case 'DELETE_DEPARTURE':
      return { ...state, departures: state.departures.filter((d) => d.id !== action.id) }

    case 'ADD_GUEST':
      return { ...state, guests: [action.guest, ...state.guests] }

    case 'ADD_TEAM_MEMBER':
      return { ...state, team: [action.member, ...state.team] }

    case 'REMOVE_TEAM_MEMBER':
      return { ...state, team: state.team.filter((m) => m.id !== action.id) }

    case 'ADD_AIRLINE': {
      // Upsert by name so codes/logos can be edited, not just appended.
      const exists = state.airlines.some((a) => a.name.toLowerCase() === action.airline.name.toLowerCase())
      return {
        ...state,
        airlines: exists
          ? state.airlines.map((a) => (a.name.toLowerCase() === action.airline.name.toLowerCase() ? { ...a, ...action.airline } : a))
          : [...state.airlines, action.airline],
      }
    }
    case 'REMOVE_AIRLINE':
      return { ...state, airlines: state.airlines.filter((a) => a.name.toLowerCase() !== String(action.name).toLowerCase()) }

    case 'ADD_VENDOR':
      return state.vendors.includes(action.name)
        ? state
        : { ...state, vendors: [...state.vendors, action.name] }

    case 'ADD_INVENTORY':
      return { ...state, inventory: [action.inventory, ...state.inventory] }

    case 'UPDATE_INVENTORY':
      return {
        ...state,
        inventory: state.inventory.map((i) =>
          i.id === action.id ? { ...i, ...action.patch } : i,
        ),
      }

    case 'DELETE_INVENTORY':
      return { ...state, inventory: state.inventory.filter((i) => i.id !== action.id) }

    case 'SET_TERMS_TEMPLATES':
      return { ...state, termsTemplates: action.templates }

    case 'ADD_BOOKING':
      return {
        ...state,
        departures: state.departures.map((d) =>
          d.id === action.booking.departureId
            ? { ...d, seatsBooked: d.seatsBooked + action.booking.seats }
            : d,
        ),
        // Roll the booking's seats/rooms + captured names into the airline and
        // hotel inventory records it was allocated against.
        inventory: state.inventory.map((i) =>
          (i.id === action.booking.airlineInventoryId || i.id === action.booking.hotelInventoryId)
            ? allocateInto(i, action.booking)
            : i),
        bookings: [action.booking, ...state.bookings],
      }

    case 'SET_BOOKING_STATUS': {
      const { bookingId, status, paymentNote, proof, cancellation, by, at } = action
      const bk = state.bookings.find((x) => x.id === bookingId)
      const wasC = bk?.status === 'Cancelled'
      const nowC = status === 'Cancelled'
      const invIds = [bk?.airlineInventoryId, bk?.hotelInventoryId].filter(Boolean)
      // Cancelling returns the seats/rooms to inventory + the departure; a rare
      // un-cancel re-allocates them.
      let departures = state.departures
      let inventory = state.inventory
      if (bk && !wasC && nowC) {
        departures = departures.map((d) => (d.id === bk.departureId ? { ...d, seatsBooked: Math.max(0, d.seatsBooked - bk.seats) } : d))
        inventory = inventory.map((i) => (invIds.includes(i.id) ? deallocateFrom(i, bk) : i))
      } else if (bk && wasC && !nowC) {
        departures = departures.map((d) => (d.id === bk.departureId ? { ...d, seatsBooked: d.seatsBooked + bk.seats } : d))
        inventory = inventory.map((i) => (invIds.includes(i.id) ? allocateInto(i, bk) : i))
      }
      return {
        ...state,
        departures,
        inventory,
        bookings: state.bookings.map((x) =>
          x.id === bookingId ? withStatus(x, { status, paymentNote, proof, cancellation, by, at }) : x),
      }
    }

    case 'SET_BOOKING_TRAVELLERS': {
      const { bookingId, details, names, by, at } = action
      const bk = state.bookings.find((x) => x.id === bookingId)
      const invIds = [bk?.airlineInventoryId, bk?.hotelInventoryId].filter(Boolean)
      return {
        ...state,
        bookings: state.bookings.map((x) =>
          x.id === bookingId ? withTravellers(x, { details, names, by, at }) : x),
        // Re-sync this booking's entries in any linked inventory manifest.
        inventory: invIds.length
          ? state.inventory.map((i) => (invIds.includes(i.id) ? resyncManifest(i, bk, details, names) : i))
          : state.inventory,
      }
    }

    case 'APPROVE_BOOKING_PAYMENT':
      return {
        ...state,
        bookings: state.bookings.map((x) =>
          x.id === action.bookingId ? withApproved(x, { by: action.by, at: action.at }) : x),
      }

    case 'MARK_REFUNDED':
      return {
        ...state,
        bookings: state.bookings.map((x) =>
          x.id === action.bookingId ? withRefunded(x, { by: action.by, at: action.at, note: action.note, proof: action.proof }) : x),
      }

    case 'COLLECT_BALANCE':
      return {
        ...state,
        bookings: state.bookings.map((x) =>
          x.id === action.bookingId ? withBalance(x, { note: action.note, proof: action.proof, by: action.by, at: action.at }) : x),
      }

    default:
      return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Auth + data hydration. Data is fetched only once a user is signed in
  // (RLS requires an authenticated session), then in three stages for fast
  // first paint: cached snapshot → small core tables → full payload.
  useEffect(() => {
    let active = true
    if (!hasSupabase) return

    const CORE_KEY = 'oyo.coreCache'
    const cacheCore = (d) => {
      try { localStorage.setItem(CORE_KEY, JSON.stringify({ packages: d.packages, departures: d.departures, airlines: d.airlines })) } catch { /* quota — skip */ }
    }

    const hydrateData = () => {
      // 1) Instant paint from the previous session's cached core.
      try {
        const cached = localStorage.getItem(CORE_KEY)
        if (cached) {
          const d = JSON.parse(cached)
          if (d && Array.isArray(d.packages)) dispatch({ type: 'HYDRATE', data: d })
        }
      } catch { /* ignore bad cache */ }
      // 2) Fast core, then 3) full payload.
      loadCore().then((core) => { if (active && core) { dispatch({ type: 'HYDRATE', data: core }); cacheCore(core) } })
      loadAll().then((data) => { if (active && data) { dispatch({ type: 'HYDRATE', data }); cacheCore(data) } })
    }

    // Resolve the current session on mount, then react to sign-in / sign-out.
    getCurrentUser().then((user) => {
      if (!active) return
      if (user) { dispatch({ type: 'LOGIN', user }); hydrateData() }
      else dispatch({ type: 'AUTH_READY' })
    })

    let signedInId = null
    const unsub = onAuthChange((event, user) => {
      if (!active) return
      if (user) {
        if (user.id !== signedInId) { signedInId = user.id; dispatch({ type: 'LOGIN', user }); hydrateData() }
      } else if (event === 'SIGNED_OUT') {
        // Only a genuine sign-out clears the session/cache. Transient null
        // sessions (e.g. during INITIAL_SESSION / token refresh) are ignored so
        // they can't wipe a signed-in user's loaded data on refresh.
        signedInId = null
        try { localStorage.removeItem(CORE_KEY) } catch { /* ignore */ }
        dispatch({ type: 'LOGOUT' })
      }
    })

    return () => { active = false; unsub() }
  }, [])

  // Keep the flight-number ↔ airline resolver aware of every saved airline's code.
  useEffect(() => {
    state.airlines.forEach((a) => registerAirline(a.name, a.code || airlineCode(a.name)))
  }, [state.airlines])

  const value = useMemo(() => {
    const packageById = (id) => state.packages.find((p) => p.id === id)
    const departureById = (id) => state.departures.find((d) => d.id === id)
    const guestById = (id) => state.guests.find((g) => g.id === id)
    const departuresForPackage = (pid) =>
      state.departures.filter((d) => d.packageId === pid)
    const available = (d) => Math.max(0, d.seatsTotal - d.seatsBooked)

    const fromPrice = (pkg) => {
      let min = Infinity
      departuresForPackage(pkg.id).forEach((d) =>
        Object.values(d.pricing).forEach((g) => {
          if (g.adult && g.adult < min) min = g.adult
        }),
      )
      return min === Infinity ? null : min
    }
    const pkgSeats = (pkg) => {
      const deps = departuresForPackage(pkg.id)
      return {
        total: deps.reduce((s, d) => s + d.seatsTotal, 0),
        avail: deps.reduce((s, d) => s + available(d), 0),
        departures: deps.length,
      }
    }

    // Mirror a package's hotels into Inventory as ONE hotel block for the whole
    // destination — the group travels together, so the room total is a single
    // block that applies to every city. Each city (with its category + hotel
    // options) is nested under `cities`, shown when you open the block.
    const autoInventoryFromHotels = (pkg) => {
      const byCity = {}
      ;(pkg.hotels || []).forEach((cat) => {
        ;(cat.rows || []).forEach((row) => {
          const city = String(row.city || '').trim()
          if (!city) return
          const k = city.toLowerCase()
          if (!byCity[k]) byCity[k] = { city, rooms: 0, roomsByCategory: {}, hotels: [], categories: [] }
          const rooms = Math.max(0, Number(row.rooms) || 0)
          if (row.options) byCity[k].hotels.push(String(row.options).trim())
          if (cat.category && !byCity[k].categories.includes(cat.category)) {
            byCity[k].categories.push(cat.category)
            // Rooms are bifurcated per category; the city total is their sum.
            byCity[k].roomsByCategory[cat.category] = rooms
          }
        })
      })
      // Finalise each city's total = sum of its per-category rooms.
      Object.values(byCity).forEach((c) => {
        c.rooms = Object.values(c.roomsByCategory).reduce((s, n) => s + (Number(n) || 0), 0)
      })
      // One block for the group: the per-city total (max across cities).
      const blockRooms = Object.values(byCity).reduce((m, c) => Math.max(m, c.rooms), 0)
      const cities = Object.values(byCity)
      if (!cities.length) return
      const dest = pkg.destinationCity || 'Destination'
      const existing = state.inventory.find((i) => i.type === 'hotel' && i.packageId === pkg.id)
      const values = {
        type: 'hotel',
        inventoryId: existing?.inventoryId || `HT-${(dest.replace(/[^A-Za-z]/g, '').slice(0, 3) || 'DST').toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
        airline: dest, // block name = destination
        departureCity: dest,
        arrivalCity: cities.map((c) => c.city).join(', '),
        destinationCity: pkg.destinationCity || '',
        cities, // nested per-city detail
        sector: `${dest} · stay`,
        flightNo: `${cities.length} ${cities.length === 1 ? 'city' : 'cities'}`,
        totalSeats: blockRooms,
        status: 'Active',
        packageId: pkg.id,
        remarks: 'Auto-created from package hotels.',
      }
      if (existing) { updateInventory(existing.id, values); return }
      // Never auto-create from a not-yet-hydrated state. If inventory hasn't
      // finished loading (or a load failed), we can't see that a block already
      // exists in the backend — adding one here spawns duplicate hotel blocks for
      // the same package. Only create once the inventory set is actually loaded.
      if (!state.hydrated) return
      const key = `hotel|pkg|${pkg.id}`
      if (autoInvKeys.has(key)) return
      autoInvKeys.add(key)
      addInventory(values)
    }

    // --- action creators: update UI immediately + write through to backend
    const addPackage = (pkg) => {
      // Auto-assign the next sequential package code (PKG-1001, PKG-1002, …).
      const maxCode = state.packages.reduce((m, p) => {
        const n = parseInt(String(p.code || '').replace(/\D/g, ''), 10)
        return Number.isFinite(n) && n > m ? n : m
      }, 1000)
      const full = {
        hotels: [],
        inclusions: [],
        exclusions: [],
        itinerary: [],
        transfers: [],
        addOns: [],
        payment: {},
        cancellation: [],
        active: true,
        code: `PKG-${maxCode + 1}`,
        ...pkg,
        id: genId('pkg'),
      }
      dispatch({ type: 'ADD_PACKAGE', pkg: full })
      apiInsertPackage(full)
      autoInventoryFromHotels(full)
      return full
    }
    const updatePackage = (id, patch) => {
      dispatch({ type: 'UPDATE_PACKAGE', id, patch })
      apiUpdatePackage(id, patch)
      if (patch.hotels) autoInventoryFromHotels({ id, ...patch })
    }
    const deletePackage = (id) => {
      dispatch({ type: 'DELETE_PACKAGE', id })
      apiDeletePackage(id)
    }
    const addGuest = (guest) => {
      const full = { id: genId('gst'), createdAt: today(), ...guest }
      dispatch({ type: 'ADD_GUEST', guest: full })
      apiInsertGuest(full)
      return full
    }
    const addTeamMember = (member) => {
      const full = { id: genId('tm'), status: 'Invited', createdAt: today(), ...member }
      dispatch({ type: 'ADD_TEAM_MEMBER', member: full })
      apiUpsertTeamMember(full)
      return full
    }
    const removeTeamMember = (id) => {
      dispatch({ type: 'REMOVE_TEAM_MEMBER', id })
      apiDeleteTeamMember(id)
    }
    // Mirror a package departure's outbound flight into Inventory as a seat block,
    // so flights added to a package show up as inventory too. Skips if a matching
    // block (same flight no. + date) already exists.
    const autoInventoryFromDeparture = (dep) => {
      const ob = dep.outbound || {}
      const ib = dep.inbound || {}
      if (!ob.flightNo && !ob.airline) return
      const key = `air|${normFlight(ob.flightNo)}|${dep.date}`
      const dup = state.inventory.some((i) => (i.type || 'airline') === 'airline' && `air|${normFlight(i.flightNo)}|${i.departureDate}` === key)
      if (dup || autoInvKeys.has(key)) return
      autoInvKeys.add(key)
      const code = normFlight(ob.flightNo).slice(0, 2) || 'XX'
      const rnd = Math.floor(1000 + Math.random() * 9000)
      addInventory({
        type: 'airline',
        inventoryId: `${code}-${ob.from || '---'}-${rnd}`,
        airline: ob.airline || '',
        departureCity: ob.from || '', arrivalCity: ob.to || '',
        sector: `${ob.from || ''} → ${ob.to || ''}`,
        flightNo: ob.flightNo || '',
        departureDate: dep.date, returnDate: dep.returnDate || '',
        departTime: ob.departTime || '', arriveTime: ob.arriveTime || '',
        returnDepartTime: ib.departTime || '', returnArriveTime: ib.arriveTime || '',
        totalSeats: dep.seatsTotal || 0,
        status: 'Active',
        packageId: dep.packageId,
        remarks: 'Auto-created from package departure.',
        fromDepartureId: dep.id,
      })
    }
    const addDeparture = (departure) => {
      const full = { id: genId('dep'), seatsBooked: 0, ...departure }
      dispatch({ type: 'ADD_DEPARTURE', departure: full })
      apiInsertDeparture(full)
      autoInventoryFromDeparture(full)
      return full
    }
    const updateDeparture = (id, patch) => {
      dispatch({ type: 'UPDATE_DEPARTURE', id, patch })
      apiUpdateDeparture(id, patch)
    }
    // Delink (remove) a departure from its package. Any flight block that was
    // auto-created from this departure is unlinked too — its packageId is
    // cleared so it stops showing as tied to the package in Flight Inventory.
    const deleteDeparture = (id) => {
      dispatch({ type: 'DELETE_DEPARTURE', id })
      apiDeleteDeparture(id)
      state.inventory
        .filter((i) => i.fromDepartureId === id && i.packageId)
        .forEach((i) => updateInventory(i.id, { packageId: '' }))
    }
    const addBooking = async (booking) => {
      const seats = totalPax(booking.pax)
      const agent = state.user
        ? `${state.user.name} (${roleLabel(state.user.role)})`
        : 'Sales'
      const full = {
        id: genId('bkg'),
        ref: genRef(),
        status: 'Processing',
        createdAt: today(),
        paymentNote: '',
        seats,
        agent,
        history: [{ status: 'Processing', note: 'Booking created', by: agent, at: stamp() }],
        ...booking,
      }
      // Persist atomically & server-validated first — the DB rejects overselling,
      // past/closed departures, etc. Only then reflect it locally.
      const res = await apiCreateBooking(full)
      if (res?.error) return { error: res.error }
      const saved = res.booking || full
      dispatch({ type: 'ADD_BOOKING', booking: saved })
      // Roll captured names into the linked blocks' manifests (allocation counts
      // are maintained by DB triggers, so we only persist the manifest here).
      ;[saved.airlineInventoryId, saved.hotelInventoryId].filter(Boolean).forEach((invId) => {
        const inv = state.inventory.find((i) => i.id === invId)
        if (inv) apiUpsertInventory(resyncManifest(inv, saved, saved.travellerDetails, saved.travellerNames))
      })
      return { booking: saved }
    }
    // --- airline inventory ------------------------------------------------
    const inventoryView = state.inventory.map(computeInventory)
    const inventoryById = (id) => {
      const inv = state.inventory.find((i) => i.id === id)
      return inv ? computeInventory(inv) : null
    }
    // Find the airline + hotel inventory a package/date books against.
    const inventoryForBooking = (packageId, departureDate) => {
      const pick = (t) => {
        const matches = state.inventory.filter((i) => (i.type || 'airline') === t && i.packageId === packageId)
        if (!matches.length) return null
        const exact = matches.find((i) => i.departureDate === departureDate)
        return computeInventory(exact || matches[0])
      }
      return { airline: pick('airline'), hotel: pick('hotel') }
    }
    // A departure is only sellable if its flight block isn't Inactive. Inactive
    // seat blocks stay visible in the Inventory > Inactive tab, but their travel
    // dates are hidden from the booking flow (checkout) and customer views.
    const inactiveFlightKeys = new Set(
      inventoryView
        .filter((i) => (i.type || 'airline') === 'airline' && i.status === 'Inactive' && i.flightNo && i.departureDate)
        .map((i) => `${normFlight(i.flightNo)}|${i.departureDate}`)
    )
    const isDepartureBookable = (d) =>
      !inactiveFlightKeys.has(`${normFlight(d.outbound?.flightNo)}|${d.date}`)
    const bookableDeparturesForPackage = (pid) =>
      departuresForPackage(pid).filter(isDepartureBookable)
    const addInventory = (inv) => {
      const full = {
        id: genId('inv'),
        allocatedSeats: 0, releasedSeats: 0, namesCaptured: 0,
        advancePaid: false, balancePaid: false, status: 'Active',
        ...inv,
      }
      dispatch({ type: 'ADD_INVENTORY', inventory: full })
      apiUpsertInventory(full)
      return full
    }
    // Airlines registry + a hotel registry derived from existing hotel inventory,
    // so both can be reused (with their logo/image) when creating new records.
    const airlineByName = (name) => state.airlines.find((a) => a.name.toLowerCase() === String(name || '').toLowerCase())
    // addAirline(name) | addAirline(name, logoUrl) | addAirline(name, { code, logoUrl }).
    // Codes make new carriers recognisable in flight-number parsing.
    const addAirline = (name, opts = '') => {
      const clean = String(name || '').trim()
      if (!clean) return null
      const o = typeof opts === 'string' ? { logoUrl: opts } : (opts || {})
      const existing = airlineByName(clean)
      // Derive a code when none is given, so flight-no matching still works.
      const code = String(o.code || existing?.code || airlineCode(clean) || '').trim().toUpperCase()
      const logoUrl = o.logoUrl || existing?.logoUrl || ''
      const full = { name: clean, logoUrl, code }
      if (existing && existing.logoUrl === logoUrl && (existing.code || '') === code) return existing
      dispatch({ type: 'ADD_AIRLINE', airline: full })
      apiUpsertAirline(full)
      if (code) registerAirline(clean, code)
      return full
    }
    const deleteAirline = (name) => {
      dispatch({ type: 'REMOVE_AIRLINE', name })
      apiDeleteAirline(name)
    }
    // Vendor registry — plain names, reusable across inventory records.
    const addVendor = (name) => {
      const clean = String(name || '').trim()
      if (!clean) return null
      dispatch({ type: 'ADD_VENDOR', name: clean })
      apiInsertVendor(clean)
      return clean
    }
    const inventoryForVendor = (name) =>
      inventoryView.filter((i) => (i.vendors || []).some((v) => v.toLowerCase() === String(name || '').toLowerCase()))
    const hotelRegistry = (() => {
      const seen = new Map()
      state.inventory.filter((i) => i.type === 'hotel').forEach((i) => {
        const key = `${String(i.departureCity || '').toLowerCase()}|${String(i.airline || '').toLowerCase()}`
        if (!seen.has(key)) seen.set(key, { name: i.airline, property: i.arrivalCity, city: i.departureCity, imageUrl: i.imageUrl || '', roomType: i.flightNo || '' })
        else if (!seen.get(key).imageUrl && i.imageUrl) seen.get(key).imageUrl = i.imageUrl
      })
      return [...seen.values()]
    })()
    const updateInventory = (id, patch) => {
      dispatch({ type: 'UPDATE_INVENTORY', id, patch })
      // Persist the full merged raw record so the JSONB doc stays complete.
      const current = state.inventory.find((i) => i.id === id)
      if (current) apiUpsertInventory({ ...current, ...patch })
    }
    const deleteInventory = (id) => {
      dispatch({ type: 'DELETE_INVENTORY', id })
      apiDeleteInventory(id)
    }
    // Terms & Conditions templates (persisted to localStorage).
    const saveTermsTemplate = (name, text) => {
      const clean = String(name || '').trim()
      if (!clean || !String(text || '').trim()) return
      const existing = state.termsTemplates.find((t) => t.name.toLowerCase() === clean.toLowerCase())
      const next = existing
        ? state.termsTemplates.map((t) => (t === existing ? { ...t, text } : t))
        : [{ id: `tpl-${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${state.termsTemplates.length + 1}`, name: clean, text }, ...state.termsTemplates]
      saveTermsTemplates(next)
      dispatch({ type: 'SET_TERMS_TEMPLATES', templates: next })
    }
    const deleteTermsTemplate = (id) => {
      const next = state.termsTemplates.filter((t) => t.id !== id)
      saveTermsTemplates(next)
      dispatch({ type: 'SET_TERMS_TEMPLATES', templates: next })
    }
    // Mark an inventory advance/balance as paid. Requires a free-text note and a
    // proof-of-payment file; records an audit-log entry of who did it and when.
    const recordPayment = (id, which, details = {}) => {
      const inv = state.inventory.find((i) => i.id === id)
      if (!inv) return
      const c = computeInventory(inv)
      const amount = which === 'advance' ? c.advanceAmount : c.balanceAmount
      const by = state.user ? `${state.user.name} (${roleLabel(state.user.role)})` : 'System'
      const entry = {
        which,
        label: which === 'advance' ? 'Advance (20%)' : 'Balance (80%)',
        amount,
        note: (details.note || '').trim(),
        proofName: details.proof?.name || '',
        proofUrl: details.proof?.url || '',
        by,
        at: today(),
      }
      const patch = which === 'advance'
        ? { advancePaid: true, advanceDate: today() }
        : { balancePaid: true, balanceDate: today() }
      patch.paymentLog = [...(inv.paymentLog || []), entry]
      updateInventory(id, patch)
    }
    // Reverse a payment that was marked paid (e.g. entered by mistake / for a test),
    // clearing the paid flag and recording a reversal entry in the audit log.
    const reversePayment = (id, which, reason) => {
      const inv = state.inventory.find((i) => i.id === id)
      if (!inv) return
      const c = computeInventory(inv)
      const amount = which === 'advance' ? c.advanceAmount : c.balanceAmount
      const by = state.user ? `${state.user.name} (${roleLabel(state.user.role)})` : 'System'
      const entry = {
        which,
        label: which === 'advance' ? 'Advance (20%)' : 'Balance (80%)',
        amount,
        note: (reason || '').trim(),
        by,
        at: today(),
        reversed: true,
      }
      const patch = which === 'advance'
        ? { advancePaid: false, advanceDate: '' }
        : { balancePaid: false, balanceDate: '' }
      patch.paymentLog = [...(inv.paymentLog || []), entry]
      updateInventory(id, patch)
    }
    const releaseSeats = (id, n, note = '') => {
      const inv = state.inventory.find((i) => i.id === id)
      if (!inv) return
      const rel = Math.max(0, Math.min(n, inv.totalSeats - inv.allocatedSeats - (inv.releasedSeats || 0)))
      if (rel <= 0) return
      const unit = (inv.type || 'airline') === 'hotel' ? 'room' : 'seat'
      const by = state.user ? `${state.user.name} (${roleLabel(state.user.role)})` : 'System'
      // Releasing seats is an allocation action, not a status change — the record
      // stays Active (its allocation label auto-updates to "Released"). Logged.
      updateInventory(id, {
        releasedSeats: (inv.releasedSeats || 0) + rel,
        history: [
          ...(inv.history || []),
          { action: 'release', note: (`Released ${rel} ${unit}${rel > 1 ? 's' : ''} back to ${(inv.type || 'airline') === 'hotel' ? 'hotel' : 'airline'}` + (note ? ` — ${note.trim()}` : '')), qty: rel, by, at: stamp() },
        ],
      })
    }
    const setInventoryStatus = (id, status) => updateInventory(id, { status })

    // Ops / management roll-ups for dashboards.
    const opsStats = {
      records: inventoryView.length,
      seatsPurchased: inventoryView.reduce((s, i) => s + i.totalSeats, 0),
      seatsAllocated: inventoryView.reduce((s, i) => s + i.allocatedSeats, 0),
      seatsAvailable: inventoryView.reduce((s, i) => s + i.available, 0),
      seatsReleased: inventoryView.reduce((s, i) => s + (i.releasedSeats || 0), 0),
      namesPending: inventoryView.reduce((s, i) => s + i.namesPending, 0),
      // records needing a release decision: unsold seats with the release window ≤ 3 days out
      releaseAlerts: inventoryView.filter(
        (i) => i.available > 0 && i.releaseDaysLeft != null && i.releaseDaysLeft <= 3 &&
          i.status === 'Active',
      ),
      namingAlerts: inventoryView.filter(
        (i) => i.namesPending > 0 && i.namingDaysLeft != null && i.namingDaysLeft <= 5 &&
          i.status === 'Active',
      ),
    }
    opsStats.avgUtilization = inventoryView.length
      ? Math.round(inventoryView.reduce((s, i) => s + i.utilization, 0) / inventoryView.length)
      : 0

    const setBookingStatus = (bookingId, status, paymentNote, proof, extra) => {
      const b = state.bookings.find((x) => x.id === bookingId)
      const by = state.user ? `${state.user.name} (${roleLabel(state.user.role)})` : 'System'
      const at = stamp()
      // Keep only serializable proof metadata (a raw File can't be stored as JSON).
      const proofMeta = proof && proof.name ? { name: proof.name, size: proof.size || 0, type: proof.type || '' } : proof
      dispatch({ type: 'SET_BOOKING_STATUS', bookingId, status, paymentNote, proof: proofMeta, cancellation: extra?.cancellation, by, at })
      // Persist the whole updated booking (status, note, proof metadata,
      // cancellation/refund object, history) — not just status.
      if (b) apiUpsertBooking(withStatus(b, { status, paymentNote, proof: proofMeta, cancellation: extra?.cancellation, by, at }))
      // Departure seats + inventory allocatedSeats are recomputed by DB triggers
      // whenever the booking's status changes — no client-side count writes needed.
    }

    // Cancel a booking, tagging who initiated it (guest vs OYO/operator) and why.
    // Releases the held seats (via setBookingStatus) and records the reason.
    const cancelBooking = (bookingId, type, reason) => {
      const label = type === 'operator' ? 'OYO / operator' : 'Guest'
      const by = state.user ? `${state.user.name} (${roleLabel(state.user.role)})` : 'System'
      // Compute the refund owed from the package cancellation policy vs days-to-travel.
      const b = state.bookings.find((x) => x.id === bookingId)
      const pkg = b ? state.packages.find((p) => p.id === b.packageId) : null
      const dep = b ? state.departures.find((d) => d.id === b.departureId) : null
      const daysToTravel = dep?.date ? daysUntil(dep.date) : null
      // RULE: the booking amount (the advance collected to confirm the seat) is
      // NON-REFUNDABLE. Only amounts paid ABOVE the booking amount are subject to
      // the cancellation-policy tiers. So if only the booking amount was paid,
      // the refund is always ₹0.
      const bookingAmount = b?.advanceAmount ?? 0 // non-refundable
      const collected = Math.max(bookingAmount, b?.amountCollected ?? bookingAmount)
      const refundableBase = Math.max(0, collected - bookingAmount)
      const rule = pkg ? applicableRule(cancellationRules(pkg), daysToTravel) : null
      const refundAmount = refundableBase > 0 ? refundFor(rule, refundableBase, b?.seats || 1) : 0
      setBookingStatus(
        bookingId,
        'Cancelled',
        `Cancelled by ${label}${reason ? ` — ${reason}` : ''}`,
        undefined,
        {
          cancellation: {
            type, label, reason: reason || '', by, at: today(),
            amountPaid: collected,
            nonRefundable: bookingAmount, // booking amount never refunded
            refundableBase, // amount paid above the booking amount
            refundAmount,
            refundStatus: refundAmount > 0 ? 'pending' : 'none',
            appliedRule: refundableBase > 0 && rule ? `${rule.timeline} · ${rule.penalty}` : 'Booking amount is non-refundable',
          },
        },
      )
    }
    // Finance/ops marks a due refund as paid out.
    const markRefunded = (bookingId, note, proof = null) => {
      const b = state.bookings.find((x) => x.id === bookingId)
      const by = state.user ? `${state.user.name} (${roleLabel(state.user.role)})` : 'System'
      const at = stamp()
      dispatch({ type: 'MARK_REFUNDED', bookingId, note: note || '', by, at, proof })
      if (b) apiUpsertBooking(withRefunded(b, { by, at, note: note || '', proof }))
    }
    // Record the outstanding balance being collected — marks the booking paid in
    // full. Requires a payment reference note; proof is optional.
    const collectBalance = (bookingId, note, proof = null) => {
      const b = state.bookings.find((x) => x.id === bookingId)
      const by = state.user ? `${state.user.name} (${roleLabel(state.user.role)})` : 'System'
      const at = stamp()
      const proofMeta = proof && proof.name ? { name: proof.name, size: proof.size || 0, type: proof.type || '' } : proof
      const balanceAmt = Math.max(0, (b?.amount || 0) - (b?.amountCollected ?? b?.advanceAmount ?? 0))
      const fullNote = `Balance ₹${balanceAmt.toLocaleString('en-IN')} collected${note ? ` — ${note}` : ''}`
      dispatch({ type: 'COLLECT_BALANCE', bookingId, note: fullNote, proof: proofMeta, by, at })
      if (b) apiUpsertBooking(withBalance(b, { note: fullNote, proof: proofMeta, by, at }))
    }

    // Capture / update the traveller name list + details for a booking (e.g. to
    // complete the naming allocation before the travel/naming deadline).
    const setBookingTravellers = (bookingId, rawDetails) => {
      const b = state.bookings.find((x) => x.id === bookingId)
      // Never capture more travellers than the booking has seats.
      const cap = b?.seats ?? rawDetails.length
      const details = rawDetails.slice(0, cap)
      const names = details.map((d) => `${d.firstName || ''} ${d.lastName || ''}`.trim()).filter(Boolean)
      const by = state.user ? `${state.user.name} (${roleLabel(state.user.role)})` : 'System'
      const at = stamp()
      dispatch({ type: 'SET_BOOKING_TRAVELLERS', bookingId, details, names, by, at })
      if (b) {
        apiUpsertBooking(withTravellers(b, { details, names, by, at }))
        // Persist the re-synced manifest on the linked flight/hotel blocks.
        ;[b.airlineInventoryId, b.hotelInventoryId].filter(Boolean).forEach((invId) => {
          const inv = state.inventory.find((i) => i.id === invId)
          if (inv) apiUpsertInventory(resyncManifest(inv, b, details, names))
        })
      }
    }

    // Finance approves a payment/transaction a sales agent logged against a booking.
    const approveBookingPayment = (bookingId) => {
      const b = state.bookings.find((x) => x.id === bookingId)
      const by = state.user ? `${state.user.name} (${roleLabel(state.user.role)})` : 'System'
      const at = stamp()
      dispatch({ type: 'APPROVE_BOOKING_PAYMENT', bookingId, by, at })
      if (b) apiUpsertBooking(withApproved(b, { by, at }))
    }

    const stats = {
      packages: state.packages.length,
      departures: state.departures.length,
      totalSeats: state.departures.reduce((s, d) => s + d.seatsTotal, 0),
      availableSeats: state.departures.reduce((s, d) => s + available(d), 0),
      activeBookings: state.bookings.length,
      processing: state.bookings.filter((b) => b.status === 'Processing').length,
      confirmed: state.bookings.filter((b) => b.status === 'Confirmed').length,
      revenue: state.bookings
        .filter((b) => b.status === 'Confirmed')
        .reduce((s, b) => s + b.amount, 0),
      pipeline: state.bookings
        .filter((b) => b.status === 'Processing')
        .reduce((s, b) => s + b.amount, 0),
    }

    // Auth actions. With a backend these call Supabase Auth (the onAuthChange
    // listener updates state); without one, they fall back to the local mock.
    const login = async (email, password) => {
      if (!hasSupabase) { dispatch({ type: 'LOGIN', user: { email, name: String(email).split('@')[0], role: 'admin' } }); return {} }
      const res = await authSignIn(email, password)
      return res
    }
    const logout = async () => {
      await authSignOut()
      dispatch({ type: 'LOGOUT' })
    }

    return {
      ...state,
      dispatch,
      login,
      logout,
      packageById,
      departureById,
      guestById,
      departuresForPackage,
      deleteDeparture,
      bookableDeparturesForPackage,
      isDepartureBookable,
      available,
      fromPrice,
      pkgSeats,
      addPackage,
      updatePackage,
      deletePackage,
      addGuest,
      addTeamMember,
      removeTeamMember,
      addDeparture,
      updateDeparture,
      addBooking,
      setBookingStatus,
      setBookingTravellers,
      cancelBooking,
      markRefunded,
      collectBalance,
      approveBookingPayment,
      stats,
      // airline inventory
      inventoryView,
      inventoryById,
      inventoryForBooking,
      addInventory,
      updateInventory,
      deleteInventory,
      termsTemplates: state.termsTemplates,
      saveTermsTemplate,
      deleteTermsTemplate,
      recordPayment,
      reversePayment,
      airlines: state.airlines,
      addAirline,
      deleteAirline,
      airlineByName,
      vendors: state.vendors,
      addVendor,
      inventoryForVendor,
      hotelRegistry,
      releaseSeats,
      setInventoryStatus,
      opsStats,
    }
  }, [state])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
