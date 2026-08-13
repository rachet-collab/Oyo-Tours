import { useState, useEffect, useRef } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import CityCover from '../components/ui/CityCover.jsx'
import {
  Avatar,
  Button,
  Card,
  Eyebrow,
  Field,
  Input,
  Modal,
  Pill,
  Select,
  StatusPill,
  Textarea,
} from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { BOOKING_STATUSES, STATUS_TONE, OCCUPANCY, CANCEL_TYPES } from '../store/data.js'
import { inr, shortDate } from '../lib/format.js'
import { cancellationRules, applicableRule, refundFor } from '../lib/policy.js'
import { blockCities, hotelOptionsForCity } from '../lib/rooming.js'

const cx = (...c) => c.filter(Boolean).join(' ')
const COUNTRY_CODES = ['+91', '+1', '+44', '+971', '+65', '+66', '+62', '+94', '+977', '+60']
const daysTo = (iso) => (iso ? Math.round((new Date(iso + 'T00:00:00') - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00')) / 86400000) : null)
// Log timestamp: "10 Aug 2026 · 4:32 PM" when the value carries a time, else date only.
const logWhen = (at) => {
  if (!at) return ''
  if (!String(at).includes('T')) return shortDate(at)
  const d = new Date(at)
  if (isNaN(d)) return shortDate(String(at).slice(0, 10))
  return `${shortDate(String(at).slice(0, 10))} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}
const readFile = (file) => new Promise((res) => { const r = new FileReader(); r.onload = () => res({ name: file.name, url: r.result }); r.readAsDataURL(file) })

export default function BookingDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, bookings, guestById, packageById, departureById, inventoryById, setBookingStatus, setBookingTravellers, approveBookingPayment, cancelBooking, markRefunded } = useApp()
  const b = bookings.find((x) => x.id === id)
  const isAdmin = user?.role === 'admin'
  // Linked hotel block (for per-city hotel assignment against each traveller).
  const hotelBlock = b?.hotelInventoryId ? inventoryById(b.hotelInventoryId) : null
  const assignHotel = (i, city, val) => {
    const details = (b.travellerDetails || []).map((t, k) =>
      (k === i ? { ...t, hotelByCity: { ...(t.hotelByCity || {}), [city]: val } } : t))
    setBookingTravellers(b.id, details)
  }

  const [status, setStatus] = useState(b?.status)
  const [note, setNote] = useState(b?.paymentNote || '')
  const [refundNote, setRefundNote] = useState('')
  const [managing, setManaging] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [proof, setProof] = useState(null)
  const payProofRef = useRef(null)
  const [refundProof, setRefundProof] = useState(null)
  const refundProofRef = useRef(null)
  const [allUpdatesOpen, setAllUpdatesOpen] = useState(false)

  if (!b) {
    return (
      <>
        <TopBar title="Booking not found" />
        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <Link to="/bookings" className="text-sm font-semibold text-primary">← Back to bookings</Link>
        </div>
      </>
    )
  }

  const g = guestById(b.guestId)
  const p = packageById(b.packageId)
  const d = departureById(b.departureId)

  // Payment breakdown (advance vs balance due) per the package policy.
  const advancePaid = b.advanceAmount || 0
  const balanceDue = Math.max(0, (b.amount || 0) - advancePaid)
  const bdDays = p?.payment?.balanceDueDays ?? 10
  const balanceDueDate = d?.date ? new Date(new Date(d.date).getTime() - bdDays * 86400000).toISOString().slice(0, 10) : ''

  // Every status update on this booking, oldest → newest: history entries plus
  // the finance payment-approval event.
  const timeline = (() => {
    const ev = (b.history || []).map((h) => ({ label: h.status, note: h.note, by: h.by, at: h.at, tone: STATUS_TONE[h.status] || 'neutral' }))
    if (b.paymentApproved) ev.push({ label: 'Payment approved', note: 'Approved by finance', by: b.approvedBy, at: b.approvedAt, tone: 'won' })
    if (b.cancellation?.refundStatus === 'refunded') ev.push({ label: 'Refund settled', note: `Refund ${inr(b.cancellation.refundAmount || 0)} paid${b.cancellation.refundNote ? ` · ${b.cancellation.refundNote}` : ''}`, by: b.cancellation.refundedBy, at: b.cancellation.refundedAt, tone: 'won' })
    return ev
  })()

  const onProof = async (e) => { const f = e.target.files?.[0]; if (f) setProof(await readFile(f)); e.target.value = '' }
  const onRefundProof = async (e) => { const f = e.target.files?.[0]; if (f) setRefundProof(await readFile(f)); e.target.value = '' }
  const confirmRefund = () => {
    if (!refundNote.trim() || !refundProof) return
    markRefunded(b.id, refundNote.trim(), refundProof)
    setRefundNote(''); setRefundProof(null)
  }
  const confirmPayment = () => {
    if (!note.trim() || !proof) return
    setBookingStatus(b.id, 'Confirmed', note.trim(), proof)
    navigate('/bookings')
  }

  return (
    <>
      <TopBar
        title={b.ref}
        crumbLabel={b.ref}
        subtitle={`${p?.destinationCity} · ${b.category}`}
        actions={isAdmin && b.status !== 'Cancelled' ? (
          <Button variant="outline" size="sm" icon="x" className="border-status-urgent/40 text-status-urgent hover:bg-status-urgent-bg" onClick={() => setCancelOpen(true)}>Cancel booking</Button>
        ) : null}
      />

      <div className="grid gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          {/* Trip */}
          <Card className="overflow-hidden">
            {p && <CityCover url={p.coverUrl} city={p.destinationCity} className="h-32" rounded="rounded-t-2xl" />}
            <div className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold">{p?.name}</h2>
                  <p className="text-sm text-muted-foreground">{p?.origin} · {b.category} · {p?.durationLabel}</p>
                </div>
                <StatusPill status={b.status} />
              </div>
              {d && (
                <div className="mt-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
                  <FlightLeg label="Outbound" f={d.outbound} date={d.date} />
                  <FlightLeg label="Return" f={d.inbound} date={d.returnDate} />
                </div>
              )}
            </div>
          </Card>

          {/* Occupancy */}
          <Card className="p-5">
            <Eyebrow className="mb-3">Occupancy · {b.seats} pax</Eyebrow>
            <div className="grid gap-1.5">
              {OCCUPANCY.filter((o) => b.pax?.[o.key] > 0).map((o) => (
                <div key={o.key} className="flex items-center justify-between text-sm">
                  <span>{o.label} × {b.pax[o.key]}</span>
                  <span className="tabular-nums text-muted-foreground">{o.hint}</span>
                </div>
              ))}
            </div>
            {b.addOns?.length > 0 && (
              <div className="mt-3 border-t pt-3">
                <Eyebrow className="mb-2">Add-ons</Eyebrow>
                <div className="grid gap-1.5">
                  {b.addOns.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span>{a.item} <span className="text-xs text-muted-foreground">× {a.qty}</span></span>
                      <span className="tabular-nums font-semibold">{inr(a.qty * a.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {b.hotelPreferences?.length > 0 && (
              <div className="mt-3 border-t pt-3">
                <Eyebrow className="mb-2">Preferred hotels</Eyebrow>
                <div className="grid gap-1.5">
                  {b.hotelPreferences.map((h, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2"><Icon name="building" size={14} className="text-primary" />{h.city}</span>
                      <span className="text-right font-semibold">{h.property}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">Guest preference — final confirmation subject to availability.</p>
              </div>
            )}
          </Card>

          {/* Travellers — names & details, editable before travel */}
          <Card className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <Eyebrow>Travellers</Eyebrow>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{b.travellerDetails?.length || 0}/{b.seats} named</span>
                <Button size="sm" variant="outline" icon="users" onClick={() => setManaging(true)}>
                  {b.travellerDetails?.length ? 'Edit details' : 'Add details'}
                </Button>
              </div>
            </div>
            {d?.date && (b.travellerDetails?.length || 0) < b.seats && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-status-proposal/30 bg-status-proposal-bg/50 px-3 py-2 text-xs text-status-proposal">
                <Icon name="clock" size={14} className="shrink-0" />
                <span>
                  {b.seats - (b.travellerDetails?.length || 0)} name{b.seats - (b.travellerDetails?.length || 0) > 1 ? 's' : ''} pending — capture before travel on {shortDate(d.date)}
                  {daysTo(d.date) != null ? ` · ${daysTo(d.date)}d left` : ''}.
                </span>
              </div>
            )}
            {b.travellerDetails?.length > 0 ? (
              <div className="grid gap-2.5">
                {b.travellerDetails.map((t, i) => {
                  const name = `${t.firstName || ''} ${t.lastName || ''}`.trim()
                  return (
                    <div key={i} className="rounded-xl border p-3.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={name || t.label} size={28} />
                        <span className="text-sm font-semibold">{name || t.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.label}{t.type === 'child' ? ` · ${t.bed === 'with' ? 'with bed' : 'no bed'}` : ''}
                        </span>
                        {i === 0 && <Pill tone="proposal" className="ml-auto">Lead guest</Pill>}
                      </div>
                      {(t.gender || t.phone || t.email || t.passportNo || t.passportCountry || t.passportExpiry || t.frequentFlyer) && (
                        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
                          {t.gender && <Detail label="Gender" value={t.gender} />}
                          {t.phone && <Detail label="Mobile" value={t.phone} />}
                          {t.email && <Detail label="Email" value={t.email} />}
                          {t.passportNo && <Detail label="Passport no." value={t.passportNo} mono />}
                          {t.passportCountry && <Detail label="Issuing country" value={t.passportCountry} />}
                          {t.passportExpiry && <Detail label="Passport expiry" value={shortDate(t.passportExpiry)} />}
                          {t.frequentFlyer && <Detail label="Frequent flyer" value={t.frequentFlyer} mono />}
                        </dl>
                      )}
                      {hotelBlock && blockCities(hotelBlock).length > 0 && (
                        <div className="mt-2.5 grid gap-2 border-t pt-2.5 sm:grid-cols-3">
                          {blockCities(hotelBlock).map((city) => {
                            const opts = hotelOptionsForCity(hotelBlock, city, b.category)
                            const val = t.hotelByCity?.[city] || ''
                            const listId = `bh-${i}-${city.replace(/\W/g, '')}`
                            return (
                              <div key={city}>
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{city}</p>
                                <Input value={val} placeholder="Type hotel" list={listId} onChange={(e) => assignHotel(i, city, e.target.value)} className="h-9 text-xs" />
                                <datalist id={listId}>{opts.map((o) => <option key={o} value={o} />)}</datalist>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {t.docs?.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {t.docs.map((doc, di) =>
                            doc.url ? (
                              <a key={di} href={doc.url} download={doc.name}
                                className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                                <Icon name="check" size={12} className="text-status-won" />
                                <span className="max-w-[160px] truncate">{doc.name}</span>
                              </a>
                            ) : (
                              <span key={di} className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-medium">
                                {doc.name}
                              </span>
                            ),
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">No documents uploaded.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                {g?.name ? (
                  <p>Lead traveller <span className="font-semibold text-foreground">{g.name}</span> is ready to complete — click <span className="font-semibold text-foreground">Add details</span> to fill passport &amp; contact before travel.</p>
                ) : (
                  <p>No traveller names captured yet. Use “Add details” to allocate names before travel.</p>
                )}
              </div>
            )}
          </Card>

          {/* Cancelled — shown to everyone with a reason & who initiated it */}
          {b.status === 'Cancelled' && (
            <Card className="border-status-urgent/30 bg-status-urgent-bg/30 p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-urgent-bg text-status-urgent"><Icon name="x" size={18} /></span>
                <div className="min-w-0">
                  <p className="text-sm font-bold">Booking cancelled</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {b.cancellation?.label ? `${b.cancellation.label} cancellation` : 'Cancelled'}
                    {b.cancellation?.by ? ` · by ${b.cancellation.by}` : ''}
                    {b.cancellation?.at ? ` · ${shortDate(b.cancellation.at)}` : ''}
                  </p>
                  {b.cancellation?.reason && <p className="mt-2 rounded-lg bg-card px-3 py-2 text-xs">{b.cancellation.reason}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">Held seats have been released back to inventory.</p>

                  {/* Refund breakdown — the booking amount is always non-refundable */}
                  {b.cancellation && (
                    <div className="mt-3 grid gap-1.5 rounded-xl border bg-card p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Collected</span>
                        <span className="font-medium tabular-nums">{inr(b.cancellation.amountPaid || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Booking amount <span className="text-[11px] font-semibold text-status-urgent">(non-refundable)</span></span>
                        <span className="font-medium tabular-nums text-status-urgent">− {inr(b.cancellation.nonRefundable || 0)}</span>
                      </div>
                      {(b.cancellation.refundableBase || 0) > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Refundable (per policy{b.cancellation.appliedRule ? ` · ${b.cancellation.appliedRule}` : ''})</span>
                          <span className="font-medium tabular-nums">{inr(b.cancellation.refundableBase || 0)}</span>
                        </div>
                      )}
                      <div className="mt-0.5 flex items-center justify-between border-t pt-1.5">
                        <span className="font-semibold">Refund due</span>
                        <span className={cx('font-bold tabular-nums', (b.cancellation.refundAmount || 0) > 0 ? 'text-status-won' : 'text-muted-foreground')}>{inr(b.cancellation.refundAmount || 0)}</span>
                      </div>
                      {(b.cancellation.refundAmount || 0) === 0 && (
                        <p className="text-[11px] text-muted-foreground">Only the booking amount was paid — the booking amount is non-refundable, so no refund is due.</p>
                      )}
                    </div>
                  )}

                  {b.cancellation?.refundStatus && b.cancellation.refundStatus !== 'none' && (
                    <div className="mt-3 overflow-hidden rounded-xl border bg-card">
                      {/* Refund summary row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                        <div>
                          <p className="text-sm font-bold">Refund {inr(b.cancellation.refundAmount || 0)}</p>
                          <p className="text-xs text-muted-foreground">
                            {b.cancellation.appliedRule ? `Per policy: ${b.cancellation.appliedRule}` : 'Per cancellation policy'}
                            {b.cancellation.amountPaid != null ? ` · on ${inr(b.cancellation.amountPaid)} collected` : ''}
                          </p>
                        </div>
                        {b.cancellation.refundStatus === 'refunded'
                          ? <Pill tone="won" dot>Refunded</Pill>
                          : <Pill tone="urgent" dot>Refund pending</Pill>}
                      </div>

                      {b.cancellation.refundStatus === 'refunded' ? (
                        /* Settled — show who confirmed it + the proof */
                        <div className="flex items-start gap-3 p-4">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-won-bg text-status-won"><Icon name="check" size={18} /></span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold">Refund settled</p>
                            <p className="text-xs text-muted-foreground">
                              Confirmed by {b.cancellation.refundedBy}{b.cancellation.refundedAt ? ` · ${shortDate(String(b.cancellation.refundedAt).slice(0, 10))}` : ''}
                            </p>
                            {b.cancellation.refundNote && <p className="mt-1 text-xs">Ref: <span className="font-medium">{b.cancellation.refundNote}</span></p>}
                            {b.cancellation.refundProof?.url && (
                              <a href={b.cancellation.refundProof.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted">
                                <Icon name="paperclip" size={13} className="text-primary" /><span className="max-w-[180px] truncate">{b.cancellation.refundProof.name || 'Proof'}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (isAdmin || user?.role === 'operations') ? (
                        /* Finance action — confirm the refund payout with a reference & proof */
                        <div className="p-4">
                          <div className="flex items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-urgent-bg text-status-urgent"><Icon name="wallet" size={18} /></span>
                            <div>
                              <p className="text-sm font-bold">Confirm refund payout</p>
                              <p className="text-xs text-muted-foreground">Finance confirms the refund was paid to the guest. Add the reference and upload proof.</p>
                            </div>
                          </div>
                          <Input value={refundNote} onChange={(e) => setRefundNote(e.target.value)} placeholder="Refund reference (UTR / mode)…" className="mt-3" />
                          <div className="mt-2">
                            <input ref={refundProofRef} type="file" accept="image/*,application/pdf" hidden onChange={onRefundProof} />
                            {refundProof ? (
                              <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-xs">
                                <span className="flex min-w-0 items-center gap-1.5"><Icon name="paperclip" size={13} className="text-primary" /><span className="truncate font-medium">{refundProof.name}</span></span>
                                <button type="button" className="shrink-0 font-semibold text-muted-foreground hover:text-foreground" onClick={() => setRefundProof(null)}>Remove</button>
                              </div>
                            ) : (
                              <Button type="button" size="sm" variant="outline" icon="plus" onClick={() => refundProofRef.current?.click()}>Upload proof (receipt / screenshot)</Button>
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">Reference &amp; proof are required.</span>
                            <Button size="sm" icon="check" disabled={!refundNote.trim() || !refundProof} onClick={confirmRefund}>Confirm refund paid</Button>
                          </div>
                        </div>
                      ) : (
                        <p className="p-4 text-xs text-muted-foreground">Refund is pending finance confirmation.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Admin: payment & status */}
          {isAdmin && b.status !== 'Cancelled' && (
            <Card className="p-5">
              <Eyebrow className="mb-3">Payment &amp; status</Eyebrow>

              {/* Money breakdown — total, advance collected, balance due */}
              <div className="mb-4 grid gap-2 rounded-xl border p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-bold tabular-nums">{inr(b.amount)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Advance collected</span>
                  <span className="font-semibold tabular-nums text-status-won">{inr(advancePaid)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-2 text-sm">
                  <span className="font-semibold">Balance due</span>
                  <span className={cx('text-lg font-bold tabular-nums', balanceDue > 0 ? 'text-status-urgent' : 'text-status-won')}>{inr(balanceDue)}</span>
                </div>
                {balanceDue > 0 && balanceDueDate && (
                  <p className="text-xs font-medium text-status-urgent">Balance due by {shortDate(balanceDueDate)} · {bdDays}d before travel</p>
                )}
              </div>

              {b.status !== 'Confirmed' ? (
                <div className="rounded-xl border border-status-won/30 bg-status-won-bg/40 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-won-bg text-status-won">
                      <Icon name="wallet" size={18} />
                    </span>
                    <div>
                      <p className="text-sm font-bold">Offline payment received?</p>
                      <p className="text-xs text-muted-foreground">Add the payment reference, then confirm to lock the guest’s seats.</p>
                    </div>
                  </div>
                  <Textarea rows={2} className="mt-3" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Payment reference (UPI / NEFT / receipt no.)…" />
                  <div className="mt-2">
                    <input ref={payProofRef} type="file" accept="image/*,application/pdf" hidden onChange={onProof} />
                    {proof ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-xs">
                        <span className="flex min-w-0 items-center gap-1.5"><Icon name="paperclip" size={13} className="text-primary" /><span className="truncate font-medium">{proof.name}</span></span>
                        <button type="button" className="shrink-0 font-semibold text-muted-foreground hover:text-foreground" onClick={() => setProof(null)}>Remove</button>
                      </div>
                    ) : (
                      <Button type="button" size="sm" variant="outline" icon="plus" onClick={() => payProofRef.current?.click()}>Upload proof (receipt / screenshot)</Button>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">Reference &amp; proof are required.</span>
                    <Button icon="check" disabled={!note.trim() || !proof} onClick={confirmPayment}>Mark payment received &amp; confirm</Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-status-won/30 bg-status-won-bg/40 p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-won-bg text-status-won">
                      <Icon name="check" size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold">Payment confirmed · seats locked</p>
                      <p className="truncate text-xs text-muted-foreground">{b.paymentNote || 'This booking has been confirmed.'}</p>
                    </div>
                  </div>
                  {b.paymentProof?.url && (
                    <a href={b.paymentProof.url} download={b.paymentProof.name}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-muted">
                      <Icon name="paperclip" size={13} /> {b.paymentProof.name || 'View payment proof'}
                    </a>
                  )}
                </div>
              )}
            </Card>
          )}

        </div>

        {/* Summary + status timeline */}
        <aside className="lg:col-span-1">
          <div className="grid gap-6 lg:sticky lg:top-24">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Avatar name={g?.name} size={44} />
                <div>
                  <p className="font-bold">{g?.name}</p>
                  <p className="text-xs text-muted-foreground">{g?.phone}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2.5 border-t pt-4 text-sm">
                <SumRow label="Reference" value={b.ref} mono />
                <SumRow label="Booked on" value={shortDate(b.createdAt)} />
                <SumRow label="Booked by" value={b.agent} />
                <SumRow label="Travel date" value={d ? shortDate(d.date) : '—'} />
                <SumRow label="Seats" value={`${b.seats} pax`} />
              </div>
              {b.paymentNote && (
                <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs">
                  <span className="font-semibold">Payment note: </span>{b.paymentNote}
                </div>
              )}
              <div className="mt-4 flex items-center justify-between border-t pt-4">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-2xl font-bold tabular-nums">{inr(b.amount)}</span>
              </div>
              {/* Advance collected vs balance still due (per payment policy) */}
              {(() => {
                const paid = b.advanceAmount || 0
                const due = Math.max(0, (b.amount || 0) - paid)
                return (
                  <div className="mt-3 grid gap-1.5 rounded-xl border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Advance collected</span>
                      <span className="font-semibold tabular-nums">{inr(paid)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Balance due</span>
                      <span className={cx('font-bold tabular-nums', due > 0 ? 'text-status-urgent' : 'text-status-won')}>{inr(due)}</span>
                    </div>
                    {due > 0 && d?.date && (() => {
                      const bdDays = p?.payment?.balanceDueDays ?? 10
                      const dueDate = new Date(new Date(d.date).getTime() - bdDays * 86400000).toISOString().slice(0, 10)
                      return <p className="text-xs font-medium text-status-urgent">Balance due by {shortDate(dueDate)} · {bdDays}d before travel</p>
                    })()}
                  </div>
                )
              })()}
              {/* Payment approval */}
              {b.paymentApproved ? (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-status-won-bg px-3 py-2 text-xs font-semibold text-status-won">
                  <Icon name="check" size={14} />
                  Payment approved{b.approvedBy ? ` · ${b.approvedBy}` : ''}{b.approvedAt ? ` · ${logWhen(b.approvedAt)}` : ''}
                </div>
              ) : b.paymentNote && b.status !== 'Cancelled' && (isAdmin || user?.role === 'operations') ? (
                <Button icon="check" className="mt-3 w-full" onClick={() => approveBookingPayment(b.id)}>Approve payment</Button>
              ) : null}
            </Card>

            {/* Status timeline — most recent few, with a "View all" modal */}
            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <Eyebrow>Status updates</Eyebrow>
                <span className="text-xs font-semibold text-muted-foreground">{timeline.length}</span>
              </div>
              <TimelineList items={timeline.slice(-5)} logWhen={logWhen} />
              {timeline.length > 5 && (
                <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setAllUpdatesOpen(true)}>
                  View all {timeline.length} updates
                </Button>
              )}
            </Card>
          </div>
        </aside>
      </div>

      <TravellerAllocationModal
        open={managing}
        booking={b}
        guest={g}
        onClose={() => setManaging(false)}
        onSave={(details) => { setBookingTravellers(b.id, details); setManaging(false) }}
      />
      <CancelBookingModal
        open={cancelOpen}
        booking={b}
        pkg={p}
        travelDate={d?.date}
        onClose={() => setCancelOpen(false)}
        onConfirm={(type, reason) => { cancelBooking(b.id, type, reason); setCancelOpen(false) }}
      />
      <Modal open={allUpdatesOpen} onClose={() => setAllUpdatesOpen(false)} title="Status updates" subtitle={`${timeline.length} updates on ${b.ref}`} width="max-w-lg">
        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <TimelineList items={timeline} logWhen={logWhen} />
        </div>
      </Modal>
    </>
  )
}

// Vertical activity list used inline and inside the "view all" modal.
function TimelineList({ items, logWhen }) {
  return (
    <ol className="relative grid gap-4 border-l pl-5">
      {items.map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-card"
            style={{ background: `var(--color-status-${e.tone})` }} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{e.label}</span>
            {e.at && <span className="text-xs text-muted-foreground">· {logWhen(e.at)}</span>}
          </div>
          {(e.by || e.note) && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {e.by && <Avatar name={e.by} size={18} />}
              <span>{e.by ? `by ${e.by}` : ''}{e.note ? `${e.by ? ' — ' : ''}${e.note}` : ''}</span>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}

// Build one slot per pax so names can be allocated per traveller.
function buildSlots(b) {
  const pax = b.pax || {}
  const slots = []
  for (let k = 0; k < (pax.adult || 0) + (pax.extraBed || 0) + (pax.single || 0); k++) slots.push({ type: 'adult' })
  for (let k = 0; k < (pax.cwb || 0); k++) slots.push({ type: 'child', bed: 'with' })
  for (let k = 0; k < (pax.cnb || 0); k++) slots.push({ type: 'child', bed: 'without' })
  if (!slots.length) for (let k = 0; k < (b.seats || 0); k++) slots.push({ type: 'adult' })
  let a = 0, c = 0
  return slots.map((s) => ({ ...s, label: s.type === 'adult' ? `Adult ${++a}` : `Child ${++c}` }))
}

const blankT = () => ({ firstName: '', lastName: '', gender: '', countryCode: '+91', mobile: '', email: '', passportNo: '', passportCountry: '', passportExpiry: '', frequentFlyer: '' })

function TravellerAllocationModal({ open, booking, guest, onClose, onSave }) {
  const slots = buildSlots(booking)
  const [forms, setForms] = useState([])
  // Seed forms from existing details; the lead slot falls back to the guest record.
  useEffect(() => {
    if (!open) return
    setForms(slots.map((s, i) => {
      let t = booking.travellerDetails?.[i] || {}
      if (!t.firstName && !t.lastName && i === 0 && guest?.name) {
        const parts = guest.name.trim().split(/\s+/)
        t = {
          firstName: parts.slice(0, -1).join(' ') || parts[0] || '',
          lastName: parts.length > 1 ? parts[parts.length - 1] : '',
          phone: guest.phone || '', email: guest.email || '', passportNo: guest.passportNo || '',
        }
      }
      const phone = String(t.phone || '')
      const m = phone.match(/^(\+\d{1,4})\s*(.*)$/)
      return {
        ...blankT(),
        firstName: t.firstName || '', lastName: t.lastName || '', gender: t.gender || '',
        countryCode: m ? m[1] : '+91', mobile: m ? m[2] : (t.phone || ''),
        email: t.email || '', passportNo: t.passportNo || '', passportCountry: t.passportCountry || '',
        passportExpiry: t.passportExpiry || '', frequentFlyer: t.frequentFlyer || '',
      }
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  const setF = (i, patch) => setForms((arr) => arr.map((f, k) => (k === i ? { ...f, ...patch } : f)))
  const ready = forms.length > 0 && forms.every((f) => f.firstName.trim() && f.lastName.trim())
  const save = () => {
    if (!ready) return
    onSave(forms.map((f, i) => ({
      ...slots[i],
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), gender: f.gender,
      phone: f.mobile ? `${f.countryCode} ${f.mobile}`.trim() : '',
      email: f.email, passportNo: f.passportNo, passportCountry: f.passportCountry,
      passportExpiry: f.passportExpiry, frequentFlyer: f.frequentFlyer,
      docs: booking.travellerDetails?.[i]?.docs || [],
    })))
  }

  return (
    <Modal open={open} onClose={onClose} title="Allocate traveller details" subtitle={`${booking.ref} · ${slots.length} traveller${slots.length > 1 ? 's' : ''}`} width="max-w-2xl"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon="check" disabled={!ready} onClick={save}>Save details</Button></>}>
      <div className="grid max-h-[65vh] gap-4 overflow-y-auto pr-1">
        {forms.map((f, i) => (
          <div key={i} className="rounded-xl border p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-secondary text-primary"><Icon name={slots[i].type === 'adult' ? 'users' : 'sparkle'} size={13} /></span>
              <span className="text-sm font-bold">{slots[i].label}</span>
              {slots[i].type === 'child' && <span className="text-xs text-muted-foreground">{slots[i].bed === 'with' ? 'with bed' : 'no bed'}</span>}
              {i === 0 && <Pill tone="proposal" className="ml-auto">Lead guest</Pill>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First & middle name" required><Input value={f.firstName} onChange={(e) => setF(i, { firstName: e.target.value })} placeholder="As on passport" /></Field>
              <Field label="Last name" required><Input value={f.lastName} onChange={(e) => setF(i, { lastName: e.target.value })} placeholder="As on passport" /></Field>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Gender">
                <Select value={f.gender} onChange={(e) => setF(i, { gender: e.target.value })}>
                  <option value="">—</option><option>Male</option><option>Female</option>
                </Select>
              </Field>
              <Field label="Mobile">
                <div className="flex gap-1.5">
                  <select value={f.countryCode} onChange={(e) => setF(i, { countryCode: e.target.value })} className="h-10 rounded-xl border bg-card px-2 text-sm">
                    {COUNTRY_CODES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <Input value={f.mobile} onChange={(e) => setF(i, { mobile: e.target.value })} placeholder="Optional" />
                </div>
              </Field>
              <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF(i, { email: e.target.value })} placeholder="Optional" /></Field>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Passport no."><Input value={f.passportNo} onChange={(e) => setF(i, { passportNo: e.target.value.toUpperCase() })} placeholder="Optional" /></Field>
              <Field label="Issuing country"><Input value={f.passportCountry} onChange={(e) => setF(i, { passportCountry: e.target.value })} placeholder="e.g. India" /></Field>
              <Field label="Passport expiry"><Input type="date" value={f.passportExpiry} onChange={(e) => setF(i, { passportExpiry: e.target.value })} /></Field>
            </div>
            <div className="mt-3 sm:max-w-xs">
              <Field label="Frequent flyer no."><Input value={f.frequentFlyer} onChange={(e) => setF(i, { frequentFlyer: e.target.value })} placeholder="Optional" /></Field>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// Pick the applicable cancellation rule from the package policy vs days-to-travel.
// A rule reads like "15 days before travel" / "Within 15 days of travel".
function applicableRuleIndex(rules, days) {
  if (!rules?.length || days == null) return -1
  const parsed = rules.map((r, i) => ({ i, num: parseInt(String(r.timeline).match(/\d+/)?.[0] ?? '', 10), within: /within/i.test(r.timeline) }))
  // "Within N days" applies when we're inside that window.
  const within = parsed.find((p) => p.within && !isNaN(p.num) && days < p.num)
  if (within) return within.i
  // Otherwise the tightest "N days before" threshold we still satisfy.
  const before = parsed.filter((p) => !p.within && !isNaN(p.num) && days >= p.num).sort((a, b) => b.num - a.num)[0]
  return before ? before.i : (parsed[0]?.i ?? -1)
}

function CancelBookingModal({ open, booking, pkg, travelDate, onClose, onConfirm }) {
  const [type, setType] = useState('guest')
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) { setType('guest'); setReason('') } }, [open])
  if (!open) return null
  const rules = pkg?.cancellation || []
  const days = daysTo(travelDate)
  const applIdx = applicableRuleIndex(rules, days)
  const appliedPenalty = applIdx >= 0 ? rules[applIdx].penalty : ''
  // Refund estimate — booking amount is NON-REFUNDABLE; only what was paid above
  // it follows the policy tiers.
  const bookingAmount = booking?.advanceAmount ?? 0
  const collected = Math.max(bookingAmount, booking?.amountCollected ?? bookingAmount)
  const refundableBase = Math.max(0, collected - bookingAmount)
  const estRule = pkg ? applicableRule(cancellationRules(pkg), days) : null
  const estRefund = refundableBase > 0 ? refundFor(estRule, refundableBase, booking?.seats || 1) : 0
  const confirm = () => {
    const note = appliedPenalty ? `${reason.trim()} · Cancellation charge: ${appliedPenalty}` : reason.trim()
    onConfirm(type, note)
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel booking"
      subtitle={`${booking.ref}`}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep booking</Button>
          <Button variant="danger" icon="x" disabled={!reason.trim()} onClick={confirm}>Cancel booking</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-status-urgent/30 bg-status-urgent-bg/30 p-3 text-xs text-status-urgent">
          <Icon name="clock" size={15} className="mt-0.5 shrink-0" />
          <span>Cancelling releases the held seats back to inventory and can't be undone.</span>
        </div>

        {rules.length > 0 && (
          <div className="rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between">
              <Eyebrow>Cancellation charges</Eyebrow>
              {days != null && <span className="text-xs text-muted-foreground">{days < 0 ? 'Travelled' : `${days}d to travel`}</span>}
            </div>
            <div className="grid gap-1.5">
              {rules.map((r, i) => (
                <div key={i} className={cx('flex items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 text-xs', i === applIdx ? 'border-status-urgent/40 bg-status-urgent-bg/30' : 'border-transparent')}>
                  <span className={cx(i === applIdx ? 'font-semibold' : 'text-muted-foreground')}>{r.timeline}</span>
                  <span className={cx('shrink-0 font-semibold', i === applIdx ? 'text-status-urgent' : '')}>{r.penalty}</span>
                </div>
              ))}
            </div>
            {appliedPenalty && <p className="mt-2 text-xs text-muted-foreground">Applicable now: <span className="font-semibold text-foreground">{appliedPenalty}</span> — recorded with this cancellation.</p>}
          </div>
        )}

        {/* Refund estimate — the booking amount is always non-refundable */}
        <div className="grid gap-1.5 rounded-xl border p-3 text-xs">
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Collected</span><span className="font-medium tabular-nums">{inr(collected)}</span></div>
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Booking amount <span className="font-semibold text-status-urgent">(non-refundable)</span></span><span className="font-medium tabular-nums text-status-urgent">− {inr(bookingAmount)}</span></div>
          {refundableBase > 0 && <div className="flex items-center justify-between"><span className="text-muted-foreground">Refundable per policy</span><span className="font-medium tabular-nums">{inr(refundableBase)}</span></div>}
          <div className="mt-0.5 flex items-center justify-between border-t pt-1.5"><span className="font-semibold">Estimated refund</span><span className={cx('font-bold tabular-nums', estRefund > 0 ? 'text-status-won' : 'text-muted-foreground')}>{inr(estRefund)}</span></div>
          {estRefund === 0 && <p className="text-[11px] text-muted-foreground">Only the booking amount was collected — it's non-refundable, so no refund is due.</p>}
        </div>
        <div>
          <Eyebrow className="mb-2">Who initiated this?</Eyebrow>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(CANCEL_TYPES).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setType(k)}
                className={cx('rounded-xl border p-3 text-left text-sm transition-colors', type === k ? 'border-primary bg-secondary ring-2 ring-ring/20' : 'hover:bg-muted')}>
                <span className="flex items-center gap-2">
                  <span className={cx('flex h-4 w-4 items-center justify-center rounded-full border', type === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border')}>{type === k && <Icon name="check" size={10} />}</span>
                  <span className="font-semibold">{label}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">{k === 'guest' ? 'Customer asked to cancel.' : 'OYO / operator cancellation.'}</span>
              </button>
            ))}
          </div>
        </div>
        <Field label="Reason" required>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'guest' ? 'e.g. Guest changed travel plans.' : 'e.g. Flight block released / schedule change.'} />
        </Field>
      </div>
    </Modal>
  )
}

function FlightLeg({ label, f, date }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1 flex items-center gap-1.5 font-semibold">
        {f.from} <Icon name="arrowRight" size={13} className="text-muted-foreground" /> {f.to}
        <span className="text-xs font-medium text-muted-foreground">· {f.airline} {f.flightNo}</span>
      </p>
      <p className="text-xs text-muted-foreground">{shortDate(date)}</p>
    </div>
  )
}
function SumRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cx('text-right font-semibold', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  )
}
function Detail({ label, value, mono }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cx('truncate font-medium', mono && 'font-mono')}>{value}</dd>
    </div>
  )
}
