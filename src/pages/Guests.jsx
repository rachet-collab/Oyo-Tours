import { useState } from 'react'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import {
  Button,
  Card,
  Eyebrow,
  Field,
  Input,
  Modal,
  StatusPill,
  Textarea,
  EmptyState,
} from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { avatarFor } from '../lib/avatars.js'
import { inr, shortDate } from '../lib/format.js'

const emptyGuest = {
  name: '',
  email: '',
  phone: '',
  city: '',
  company: 'Individual',
  notes: '',
}

export default function Guests() {
  const { guests, bookings, packageById, addGuest } = useApp()
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState(emptyGuest)
  const [detail, setDetail] = useState(null) // guest id for history drawer
  const [query, setQuery] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const bookingsFor = (gid) => bookings.filter((b) => b.guestId === gid)

  const save = () => {
    addGuest({ ...form })
    setForm(emptyGuest)
    setAddOpen(false)
  }

  const filtered = guests.filter(
    (g) =>
      !query ||
      g.name.toLowerCase().includes(query.toLowerCase()) ||
      g.email.toLowerCase().includes(query.toLowerCase()) ||
      g.city.toLowerCase().includes(query.toLowerCase()),
  )

  const activeGuest = guests.find((g) => g.id === detail)

  return (
    <>
      <TopBar
        title="Guest Directory"
        subtitle="Onboard guests and review their booking history."
        actions={
          <div className="relative">
            <Icon
              name="search"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search guests"
              className="w-52 pl-9"
            />
          </div>
        }
      />

      <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <h2 className="text-base font-bold">All guests</h2>
              <p className="text-xs text-muted-foreground">
                {guests.length} onboarded
              </p>
            </div>
            <Button icon="plus" onClick={() => setAddOpen(true)}>
              Add guest
            </Button>
          </div>

          {filtered.length === 0 ? (
            <div className="border-t">
              <EmptyState
                icon="users"
                title="No guests match"
                hint="Try a different search, or onboard a new guest."
              />
            </div>
          ) : (
            <div className="overflow-x-auto border-t">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-5 py-2.5 font-semibold">Guest</th>
                    <th className="px-3 py-2.5 font-semibold">Contact</th>
                    <th className="px-3 py-2.5 font-semibold">City</th>
                    <th className="px-3 py-2.5 font-semibold">Bookings</th>
                    <th className="px-3 py-2.5 font-semibold">Total value</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((g) => {
                    const bk = bookingsFor(g.id)
                    const value = bk.reduce((s, b) => s + (b.amount || 0), 0)
                    return (
                      <tr
                        key={g.id}
                        onClick={() => setDetail(g.id)}
                        className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <img src={avatarFor(g.id || g.email || g.name)} alt={g.name} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                            <div className="min-w-0">
                              <p className="font-semibold">{g.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{g.email || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{g.phone || '—'}</td>
                        <td className="px-3 py-3">{g.city || '—'}</td>
                        <td className="px-3 py-3">
                          <span className="font-semibold tabular-nums">{bk.length}</span>
                        </td>
                        <td className="px-3 py-3 font-semibold tabular-nums">
                          {value ? inr(value) : '—'}
                        </td>
                        <td className="px-5 py-3 text-right text-muted-foreground">
                          {shortDate(g.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Add guest modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Onboard a guest"
        subtitle="Capture guest details before booking a package."
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              icon="check"
              disabled={!form.name || !form.phone}
              onClick={save}
            >
              Save guest
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Full name" required>
              <Input value={form.name} onChange={set('name')} placeholder="Ananya Rao" />
            </Field>
          </div>
          <Field label="Phone" required>
            <Input value={form.phone} onChange={set('phone')} placeholder="+91 98200 11234" />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChange={set('email')} placeholder="name@email.com" />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={set('city')} placeholder="Mumbai" />
          </Field>
          <Field label="Guest type">
            <Input
              value={form.company}
              onChange={set('company')}
              placeholder="Individual / Company name"
            />
          </Field>
          <div className="col-span-2">
            <Field label="Notes" hint="Preferences, group size, special requests.">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={set('notes')}
                placeholder="Prefers window seat, travelling with spouse…"
              />
            </Field>
          </div>
        </div>
      </Modal>

      {/* Guest history drawer */}
      <Modal
        open={!!activeGuest}
        onClose={() => setDetail(null)}
        title={activeGuest?.name}
        subtitle={activeGuest ? [activeGuest.city, activeGuest.phone].filter(Boolean).join(' · ') : ''}
        width="max-w-xl"
        footer={
          <Button variant="outline" onClick={() => setDetail(null)}>
            Close
          </Button>
        }
      >
        {activeGuest && (
          <div className="grid gap-5">
            <div className="grid grid-cols-2 gap-3">
              <InfoRow icon="mail" label="Email" value={activeGuest.email || '—'} />
              <InfoRow icon="phone" label="Phone" value={activeGuest.phone || '—'} />
              <InfoRow icon="building" label="City" value={activeGuest.city || '—'} />
              <InfoRow
                icon="calendar"
                label="Onboarded"
                value={shortDate(activeGuest.createdAt)}
              />
            </div>

            {activeGuest.notes && (
              <div className="rounded-xl bg-muted/60 px-4 py-3">
                <Eyebrow>Notes</Eyebrow>
                <p className="mt-1 text-sm">{activeGuest.notes}</p>
              </div>
            )}

            <div>
              <Eyebrow className="mb-2">Booking history</Eyebrow>
              {bookingsFor(activeGuest.id).length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No bookings yet for this guest.
                </p>
              ) : (
                <div className="grid gap-2">
                  {bookingsFor(activeGuest.id).map((b) => {
                    const p = packageById(b.packageId)
                    return (
                      <div
                        key={b.id}
                        className="flex items-center gap-3 rounded-xl border px-4 py-3"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                          <Icon name="mapPin" size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">
                            {p?.destinationCity} · {b.category} · {b.seats} pax
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {b.ref} · {shortDate(b.createdAt)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">
                            {inr(b.amount)}
                          </p>
                        </div>
                        <StatusPill status={b.status} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon name={icon} size={15} />
      </span>
      <div className="min-w-0">
        <Eyebrow>{label}</Eyebrow>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}
