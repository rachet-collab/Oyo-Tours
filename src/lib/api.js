import { supabase, hasSupabase } from './supabase.js'
import { normalizeStatus, seedAirlines } from '../store/data.js'

// --- auth ----------------------------------------------------------------
// Turn a Supabase session into the app's user object, reading name/role from
// the profiles table (source of truth for RBAC).
export async function userFromSession(session) {
  if (!session?.user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, email')
    .eq('id', session.user.id)
    .maybeSingle()
  const meta = session.user.user_metadata || {}
  return {
    id: session.user.id,
    email: profile?.email || session.user.email || '',
    name: profile?.name || meta.name || (session.user.email || '').split('@')[0],
    role: profile?.role || meta.role || 'sales',
  }
}

export async function getCurrentUser() {
  if (!hasSupabase) return null
  const { data } = await supabase.auth.getSession()
  return userFromSession(data.session)
}

export async function authSignIn(email, password) {
  if (!hasSupabase) return { error: { message: 'No backend configured' } }
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(email).trim(), password })
  if (error) return { error }
  return { user: await userFromSession(data.session) }
}

export async function authSignOut() {
  if (hasSupabase) await supabase.auth.signOut()
}

// Admin user management via the secure `admin-users` edge function (service
// role, gated to admin callers). Actions: list, create_user, set_password,
// set_role, delete_user.
export async function adminUsers(body) {
  if (!hasSupabase) return { error: { message: 'No backend configured' } }
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    let message = error.message || 'Request failed'
    try { const j = await error.context?.json?.(); if (j?.error) message = j.error } catch { /* ignore */ }
    return { error: { message } }
  }
  return data
}

// Subscribe to auth changes; returns an unsubscribe function.
export function onAuthChange(cb) {
  if (!hasSupabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    cb(await userFromSession(session))
  })
  return () => data.subscription.unsubscribe()
}

// --- mappers: DB (snake_case) <-> app (camelCase) ------------------------
const d10 = (v) => (v ? String(v).slice(0, 10) : v)

// Fallback package codes (used when the backend row has no code yet) so the
// Package ID is never blank in the UI.
const CODE_BY_ID = {
  'pkg-andaman-bom': 'PKG-1001',
  'pkg-andaman-del': 'PKG-1002',
  'pkg-phuket-del': 'PKG-1003',
  'pkg-thailand-del': 'PKG-1004',
  'pkg-vietnam-del': 'PKG-1005',
}
let CODE_SEQ = 1006
const codeFor = (r) => r.code || CODE_BY_ID[r.id] || `PKG-${CODE_SEQ++}`

const pkgFromDb = (r) => ({
  id: r.id, code: codeFor(r), name: r.name, origin: r.origin, destinationCity: r.destination_city,
  country: r.country, emoji: r.emoji, coverUrl: r.cover_url,
  durationLabel: r.duration_label, nights: r.nights, days: r.days,
  destinationsLabel: r.destinations_label, blurb: r.blurb,
  categories: r.categories || [], hotels: r.hotels || [],
  inclusions: r.inclusions || [], exclusions: r.exclusions || [],
  itinerary: r.itinerary || [], transfers: r.transfers || [],
  addOns: r.add_ons || [], payment: r.payment || {}, cancellation: r.cancellation || [],
  images: r.images || [], terms: r.terms || '', coverFocal: r.cover_focal || null,
  // active defaults to true when the column is null (legacy rows / never toggled).
  active: r.active !== false,
})
const pkgToDb = (p) => ({
  id: p.id, code: p.code, name: p.name, origin: p.origin, destination_city: p.destinationCity,
  country: p.country, emoji: p.emoji, cover_url: p.coverUrl,
  duration_label: p.durationLabel, nights: p.nights, days: p.days,
  destinations_label: p.destinationsLabel, blurb: p.blurb,
  categories: p.categories, hotels: p.hotels, inclusions: p.inclusions,
  exclusions: p.exclusions, itinerary: p.itinerary, transfers: p.transfers,
  add_ons: p.addOns, payment: p.payment, cancellation: p.cancellation,
  images: p.images || [], terms: p.terms || '', cover_focal: p.coverFocal ?? null,
  active: p.active !== false,
})

const depFromDb = (r) => ({
  id: r.id, packageId: r.package_id, date: d10(r.date), returnDate: d10(r.return_date),
  outbound: r.outbound || {}, inbound: r.inbound || {},
  seatsTotal: r.seats_total, seatsBooked: r.seats_booked, pricing: r.pricing || {},
})
const depToDb = (d) => ({
  id: d.id, package_id: d.packageId, date: d.date, return_date: d.returnDate,
  outbound: d.outbound, inbound: d.inbound, seats_total: d.seatsTotal,
  seats_booked: d.seatsBooked, pricing: d.pricing,
})

const guestFromDb = (r) => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, city: r.city,
  company: r.company, notes: r.notes, passportNo: r.passport_no || '', createdAt: d10(r.created_at),
})
const guestToDb = (g) => ({
  id: g.id, name: g.name, email: g.email, phone: g.phone, city: g.city,
  company: g.company, notes: g.notes, passport_no: g.passportNo || '', created_at: g.createdAt,
})

// Bookings are fully columnized — every field has its own column, with JSONB
// reserved only for genuinely repeating data (pax, traveller list, add-ons,
// rooms, history). The cancellation/refund object is flattened to columns so
// Finance can query it. Nothing is dropped on save or reload.
const bookingFromDb = (r) => {
  // Reconstruct the cancellation object only if any cancel/refund field is set.
  const hasCancel = r.cancel_type || r.cancel_at || r.refund_status || r.refund_amount != null
  const cancellation = hasCancel ? {
    type: r.cancel_type || '', label: r.cancel_label || '', reason: r.cancel_reason || '',
    by: r.cancel_by || '', at: r.cancel_at || '',
    amountPaid: r.cancel_amount_paid != null ? Number(r.cancel_amount_paid) : 0,
    refundAmount: r.refund_amount != null ? Number(r.refund_amount) : 0,
    refundStatus: r.refund_status || 'none', appliedRule: r.applied_rule || '',
    refundedBy: r.refunded_by || '', refundedAt: r.refunded_at || '', refundNote: r.refund_note || '',
    refundProof: r.refund_proof || null,
  } : undefined
  // An approved payment always means the booking is Confirmed — repair any legacy
  // record that was left in Processing after its payment was approved.
  const baseStatus = normalizeStatus(r.status)
  const status = (r.payment_approved && baseStatus !== 'Cancelled') ? 'Confirmed' : baseStatus
  return {
    id: r.id, ref: r.ref, guestId: r.guest_id, packageId: r.package_id,
    departureId: r.departure_id, category: r.category, pax: r.pax || {},
    seats: r.seats, amount: Number(r.amount), status,
    agent: r.agent, paymentNote: r.payment_note, createdAt: d10(r.created_at),
    advanceAmount: r.advance_amount != null ? Number(r.advance_amount) : 0,
    advancePaid: !!r.advance_paid,
    paymentApproved: !!r.payment_approved, approvedBy: r.approved_by || '', approvedAt: r.approved_at || '',
    airlineInventoryId: r.airline_inventory_id || '', hotelInventoryId: r.hotel_inventory_id || '',
    travellerDetails: r.traveller_details || [], travellers: r.travellers || [],
    addOns: r.add_ons || [], rooms: r.rooms || [], hotelPreferences: r.hotel_preferences || [],
    history: r.history || [], paymentProof: r.payment_proof || null,
    ...(cancellation ? { cancellation } : {}),
  }
}
const bookingToDb = (b) => {
  const c = b.cancellation || {}
  return {
    id: b.id, ref: b.ref, guest_id: b.guestId, package_id: b.packageId,
    departure_id: b.departureId, category: b.category, pax: b.pax || {}, seats: b.seats,
    amount: b.amount, status: b.status, agent: b.agent, payment_note: b.paymentNote,
    created_at: b.createdAt,
    advance_amount: b.advanceAmount ?? 0, advance_paid: !!b.advancePaid,
    payment_approved: !!b.paymentApproved, approved_by: b.approvedBy || null, approved_at: b.approvedAt || null,
    airline_inventory_id: b.airlineInventoryId || null, hotel_inventory_id: b.hotelInventoryId || null,
    cancel_type: c.type || null, cancel_label: c.label || null, cancel_reason: c.reason || null,
    cancel_by: c.by || null, cancel_at: c.at || null,
    cancel_amount_paid: c.amountPaid ?? null, refund_amount: c.refundAmount ?? null,
    refund_status: c.refundStatus || null, applied_rule: c.appliedRule || null,
    refunded_by: c.refundedBy || null, refunded_at: c.refundedAt || null, refund_note: c.refundNote || null,
    refund_proof: c.refundProof || null,
    traveller_details: b.travellerDetails || [], travellers: b.travellers || [],
    add_ons: b.addOns || [], rooms: b.rooms || [], hotel_preferences: b.hotelPreferences || [],
    history: b.history || [], payment_proof: b.paymentProof || null,
  }
}

// Inventory & team persist as opaque JSONB docs (the raw app record), so their
// evolving shape survives without a column-by-column mapping.
const invFromDb = (r) => r.doc
const airlineFromDb = (r) => ({ name: r.name, logoUrl: r.logo_url || '', code: r.code || '' })

// --- reads ---------------------------------------------------------------
// Fast "first paint" load — only the small tables the Packages/Explore landing
// needs. Fetched first so the portal shows content without waiting on the
// heavier inventory/bookings payloads.
export async function loadCore() {
  if (!hasSupabase) return null
  try {
    const [pk, dep, air] = await Promise.all([
      supabase.from('packages').select('*'),
      supabase.from('departures').select('*'),
      supabase.from('airlines').select('*'),
    ])
    if (pk.error || dep.error || air.error) return null
    const data = {
      packages: pk.data.map(pkgFromDb),
      departures: dep.data.map(depFromDb),
    }
    data.airlines = air.data.length ? air.data.map(airlineFromDb) : seedAirlines
    return data
  } catch (e) {
    console.error('Supabase core load exception', e)
    return null
  }
}

export async function loadAll() {
  if (!hasSupabase) return null
  try {
    const [pk, dep, gu, bk, inv, air, ven, tm] = await Promise.all([
      supabase.from('packages').select('*'),
      supabase.from('departures').select('*'),
      supabase.from('guests').select('*').order('created_at', { ascending: false }),
      supabase.from('bookings').select('*').order('created_at', { ascending: false }),
      supabase.from('inventory').select('*'),
      supabase.from('airlines').select('*'),
      supabase.from('vendors').select('*'),
      supabase.from('team').select('*'),
    ])
    const firstError = pk.error || dep.error || gu.error || bk.error || inv.error || air.error || ven.error || tm.error
    if (firstError) {
      console.error('Supabase load error', firstError)
      return null
    }
    // Hydrate whatever the backend holds. Empty collections come back as [] and
    // correctly show a blank portal (local seeds are empty too). Airlines are
    // special: if the backend has none, keep the built-in defaults rather than
    // wiping them, by omitting the key so HYDRATE preserves state.airlines.
    const data = {
      packages: pk.data.map(pkgFromDb),
      departures: dep.data.map(depFromDb),
      guests: gu.data.map(guestFromDb),
      bookings: bk.data.map(bookingFromDb),
      inventory: inv.data.map(invFromDb),
      vendors: ven.data.map((r) => r.name),
      team: tm.data.map((r) => r.doc),
    }
    if (air.data.length) data.airlines = air.data.map(airlineFromDb)
    else data.airlines = seedAirlines // fall back to built-in defaults
    return data
  } catch (e) {
    console.error('Supabase load exception', e)
    return null
  }
}

// --- writes (fire-and-forget; UI already updated optimistically) ---------
const warn = (label) => (r) => {
  if (r?.error) console.error(`Supabase ${label} error`, r.error)
  return r
}
export const apiInsertPackage = (p) =>
  hasSupabase && supabase.from('packages').insert(pkgToDb(p)).then(warn('insert package'))

// Map a partial package patch (camelCase) to DB columns for updates.
const PKG_COL = {
  code: 'code', name: 'name', origin: 'origin', destinationCity: 'destination_city',
  country: 'country', emoji: 'emoji', coverUrl: 'cover_url',
  durationLabel: 'duration_label', nights: 'nights',
  destinationsLabel: 'destinations_label', blurb: 'blurb',
  categories: 'categories', hotels: 'hotels', inclusions: 'inclusions',
  exclusions: 'exclusions', itinerary: 'itinerary', transfers: 'transfers',
  addOns: 'add_ons', payment: 'payment', cancellation: 'cancellation',
  images: 'images', active: 'active', terms: 'terms', days: 'days', coverFocal: 'cover_focal',
}
export const apiUpdatePackage = (id, patch) => {
  if (!hasSupabase) return
  const dbPatch = {}
  for (const k in patch) if (PKG_COL[k]) dbPatch[PKG_COL[k]] = patch[k]
  return supabase.from('packages').update(dbPatch).eq('id', id).then(warn('update package'))
}
// Delete a package and its departures (bookings, if any, are kept as history).
export const apiDeletePackage = (id) => {
  if (!hasSupabase) return
  return Promise.all([
    supabase.from('departures').delete().eq('package_id', id).then(warn('delete departures')),
    supabase.from('packages').delete().eq('id', id).then(warn('delete package')),
  ])
}
export const apiInsertGuest = (g) =>
  hasSupabase && supabase.from('guests').insert(guestToDb(g)).then(warn('insert guest'))
export const apiInsertDeparture = (d) =>
  hasSupabase && supabase.from('departures').insert(depToDb(d)).then(warn('insert departure'))
export const apiDeleteDeparture = (id) =>
  hasSupabase && supabase.from('departures').delete().eq('id', id).then(warn('delete departure'))
export const apiInsertBooking = (b) =>
  hasSupabase && supabase.from('bookings').insert(bookingToDb(b)).then(warn('insert booking'))
// Upsert the FULL booking record (doc + flat columns). Every booking mutation
// — status, cancellation/refund, traveller capture, approval — routes here so
// nothing is lost. Replaces the old status-only writer.
export const apiUpsertBooking = (b) =>
  hasSupabase && supabase.from('bookings').upsert(bookingToDb(b)).then(warn('upsert booking'))
export const apiUpdateBookingStatus = (id, status, paymentNote) =>
  hasSupabase &&
  supabase.from('bookings').update({ status, payment_note: paymentNote }).eq('id', id).then(warn('update booking'))
export const apiUpdateDepartureSeats = (id, seatsBooked) =>
  hasSupabase &&
  supabase.from('departures').update({ seats_booked: seatsBooked }).eq('id', id).then(warn('update seats'))

// General departure update (pricing, flights, dates, seats) → persist the patch.
const DEP_COL = {
  packageId: 'package_id', date: 'date', returnDate: 'return_date',
  outbound: 'outbound', inbound: 'inbound', seatsTotal: 'seats_total',
  seatsBooked: 'seats_booked', pricing: 'pricing',
}
export const apiUpdateDeparture = (id, patch) => {
  if (!hasSupabase) return
  const dbPatch = {}
  for (const k in patch) if (DEP_COL[k]) dbPatch[DEP_COL[k]] = patch[k]
  if (!Object.keys(dbPatch).length) return
  return supabase.from('departures').update(dbPatch).eq('id', id).then(warn('update departure'))
}

// --- inventory / airlines / vendors / team -------------------------------
// Inventory records are stored as a whole JSONB doc, upserted on every change
// so create/update/release/payment all persist. Pass the FULL raw record.
export const apiUpsertInventory = (record) =>
  hasSupabase &&
  supabase.from('inventory').upsert({ id: record.id, doc: record }).then(warn('upsert inventory'))
export const apiDeleteInventory = (id) =>
  hasSupabase && supabase.from('inventory').delete().eq('id', id).then(warn('delete inventory'))

export const apiUpsertAirline = (airline) =>
  hasSupabase &&
  supabase.from('airlines').upsert({ name: airline.name, logo_url: airline.logoUrl || '', code: airline.code || '' }).then(warn('upsert airline'))
export const apiDeleteAirline = (name) =>
  hasSupabase && supabase.from('airlines').delete().eq('name', name).then(warn('delete airline'))

export const apiInsertVendor = (name) =>
  hasSupabase &&
  supabase.from('vendors').upsert({ name }).then(warn('insert vendor'))

export const apiUpsertTeamMember = (member) =>
  hasSupabase &&
  supabase.from('team').upsert({ id: member.id, doc: member }).then(warn('upsert team member'))
export const apiDeleteTeamMember = (id) =>
  hasSupabase && supabase.from('team').delete().eq('id', id).then(warn('delete team member'))
