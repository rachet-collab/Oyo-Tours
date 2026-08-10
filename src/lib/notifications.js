import { inr } from './format.js'

// Notification types — each can be toggled on/off by an admin.
export const NOTIF_TYPES = [
  { key: 'payment', label: 'Payment approvals', hint: 'Payments logged and awaiting finance approval', icon: 'wallet', tone: 'proposal' },
  { key: 'release', label: 'Release deadlines', hint: 'Unsold inventory nearing its release date', icon: 'clock', tone: 'urgent' },
  { key: 'naming', label: 'Rooming / names pending', hint: 'Allocated seats or rooms without traveller names', icon: 'users', tone: 'new' },
  { key: 'refund', label: 'Refunds pending', hint: 'Cancelled bookings with a refund still due', icon: 'logout', tone: 'urgent' },
]

const on = (prefs, key) => prefs?.[key] !== false // default enabled

// Derive the live notification list from app state, honouring the admin's
// per-type on/off preferences.
export function buildNotifications({ inventoryView = [], bookings = [] }, prefs = {}) {
  const out = []
  const invLink = (i) => `${i.type === 'hotel' ? '/hotels' : '/inventory'}/${i.id}`

  if (on(prefs, 'payment')) {
    bookings.filter((b) => b.paymentNote && !b.paymentApproved && b.status !== 'Cancelled').forEach((b) => {
      out.push({ id: `pay-${b.id}`, type: 'payment', icon: 'wallet', tone: 'proposal', title: 'Payment awaiting approval', desc: `${b.ref} · ${inr(b.amount)}`, to: `/bookings/${b.id}` })
    })
  }
  if (on(prefs, 'release')) {
    inventoryView.filter((i) => i.status === 'Active' && i.available > 0 && i.releaseDaysLeft != null && i.releaseDaysLeft <= 3).forEach((i) => {
      out.push({ id: `rel-${i.id}`, type: 'release', icon: 'clock', tone: 'urgent', title: 'Release deadline near', desc: `${i.inventoryId} · ${i.available} left · ${i.releaseDaysLeft <= 0 ? 'today' : `${i.releaseDaysLeft}d`}`, to: invLink(i) })
    })
  }
  if (on(prefs, 'naming')) {
    inventoryView.filter((i) => i.status === 'Active' && i.namesPending > 0).forEach((i) => {
      out.push({ id: `nm-${i.id}`, type: 'naming', icon: 'users', tone: 'new', title: 'Names pending', desc: `${i.inventoryId} · ${i.namesPending} pending`, to: invLink(i) })
    })
  }
  if (on(prefs, 'refund')) {
    bookings.filter((b) => b.status === 'Cancelled' && b.cancellation?.refundStatus === 'pending').forEach((b) => {
      out.push({ id: `ref-${b.id}`, type: 'refund', icon: 'logout', tone: 'urgent', title: 'Refund pending', desc: `${b.ref} · ${inr(b.cancellation.refundAmount || 0)}`, to: `/bookings/${b.id}` })
    })
  }
  return out
}

// Per-type on/off prefs persisted locally.
const KEY = 'oyo.notifPrefs'
export function loadNotifPrefs() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}
export function saveNotifPrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
}
