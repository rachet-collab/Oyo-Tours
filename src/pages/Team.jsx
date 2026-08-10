import { useState } from 'react'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Pill,
  EmptyState,
} from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { avatarFor } from '../lib/avatars.js'

const emptyMember = { name: '', email: '' }

export default function Team() {
  const { team, user, addTeamMember, removeTeamMember } = useApp()
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState(emptyMember)
  const [query, setQuery] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const canSave = form.name.trim() && /\S+@\S+\.\S+/.test(form.email)

  const save = () => {
    // Everyone is an Admin — there are no other roles.
    addTeamMember({ name: form.name.trim(), email: form.email.trim(), role: 'Admin' })
    setForm(emptyMember)
    setAddOpen(false)
  }

  const filtered = team.filter(
    (m) =>
      !query ||
      m.name.toLowerCase().includes(query.toLowerCase()) ||
      m.email.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <>
      <TopBar
        title="Settings"
        subtitle="Manage who has admin access to this portal."
        actions={
          <Button icon="plus" onClick={() => setAddOpen(true)}>
            Add member
          </Button>
        }
      />

      <div className="grid gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email…" className="pl-9" />
          </div>
          <Pill tone="neutral">{team.length} member{team.length === 1 ? '' : 's'}</Pill>
        </div>

        <Card className="overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState icon="users" title="No team members found" hint="Add a colleague to give them portal access." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3">Member</th>
                    <th className="px-3 py-3">Role</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => {
                    const isSelf = user?.email === m.email
                    return (
                      <tr key={m.id} className="border-b last:border-b-0">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <img src={avatarFor(m.id || m.email || m.name)} alt={m.name} className="h-[38px] w-[38px] shrink-0 rounded-full object-cover" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{m.name}{isSelf && <span className="ml-1.5 text-xs font-medium text-muted-foreground">(you)</span>}</p>
                              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5"><Pill tone="proposal">Admin</Pill></td>
                        <td className="px-3 py-3.5"><Pill tone={m.status === 'Active' ? 'won' : 'proposal'} dot>{m.status}</Pill></td>
                        <td className="px-5 py-3.5 text-right">
                          {isSelf ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <button
                              onClick={() => removeTeamMember(m.id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-status-urgent hover:bg-status-urgent-bg"
                            >
                              <Icon name="x" size={13} /> Remove
                            </button>
                          )}
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

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add team member"
        subtitle="They'll get full admin access to the portal."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button icon="check" disabled={!canSave} onClick={save}>Send invite</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Full name" required>
            <Input value={form.name} onChange={set('name')} placeholder="e.g. Neha Verma" />
          </Field>
          <Field label="Work email" required hint="The invite and sign-in link go here.">
            <Input type="email" value={form.email} onChange={set('email')} placeholder="name@oyotours.in" />
          </Field>
          <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3">
            <Icon name="check" size={15} className="mt-0.5 text-status-won" />
            <p className="text-xs text-muted-foreground">Members are added as <span className="font-semibold text-foreground">Admins</span> with full access to packages, bookings, guests and the team.</p>
          </div>
        </div>
      </Modal>
    </>
  )
}
