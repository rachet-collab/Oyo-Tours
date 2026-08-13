import { useEffect, useState, useCallback } from 'react'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  Pill,
  Select,
  EmptyState,
  Avatar,
} from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { adminUsers } from '../lib/api.js'

const ROLE_TONE = { admin: 'proposal', operations: 'new', sales: 'neutral' }
const ROLE_LABEL = { admin: 'Admin', operations: 'Operations', sales: 'Sales' }
const ROLES = ['admin', 'operations', 'sales']

export default function Team() {
  const { user } = useApp()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')

  // Add-user modal
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'sales', password: '' })
  const [saving, setSaving] = useState(false)

  // Set-password modal
  const [pwUser, setPwUser] = useState(null)
  const [pw, setPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwDone, setPwDone] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const res = await adminUsers({ action: 'list' })
    if (res?.error) setErr(res.error.message)
    else setUsers(res.users || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const canAdd = form.name.trim() && /\S+@\S+\.\S+/.test(form.email) && form.password.length >= 6

  const addUser = async () => {
    setSaving(true); setErr('')
    const res = await adminUsers({ action: 'create_user', email: form.email.trim(), password: form.password, name: form.name.trim(), role: form.role })
    setSaving(false)
    if (res?.error) { setErr(res.error.message); return }
    setForm({ name: '', email: '', role: 'sales', password: '' })
    setAddOpen(false)
    load()
  }

  const changeRole = async (u, role) => {
    setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, role } : x))) // optimistic
    const res = await adminUsers({ action: 'set_role', userId: u.id, role })
    if (res?.error) { setErr(res.error.message); load() }
  }

  const savePassword = async () => {
    setPwSaving(true); setErr('')
    const res = await adminUsers({ action: 'set_password', userId: pwUser.id, password: pw })
    setPwSaving(false)
    if (res?.error) { setErr(res.error.message); return }
    setPwDone(true)
    setTimeout(() => { setPwUser(null); setPw(''); setPwDone(false) }, 1400)
  }

  const removeUser = async (u) => {
    const res = await adminUsers({ action: 'delete_user', userId: u.id })
    if (res?.error) { setErr(res.error.message); return }
    load()
  }

  const filtered = users.filter((m) =>
    !query || (m.name || '').toLowerCase().includes(query.toLowerCase()) || (m.email || '').toLowerCase().includes(query.toLowerCase()))

  return (
    <>
      <TopBar
        title="Team & access"
        subtitle="Manage who can sign in, their role, and reset passwords."
        actions={<Button icon="plus" onClick={() => { setErr(''); setAddOpen(true) }}>Add user</Button>}
      />

      <div className="grid gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {err && (
          <div className="flex items-center gap-2 rounded-xl border border-status-urgent/30 bg-status-urgent-bg/40 px-4 py-2.5 text-sm text-status-urgent">
            <Icon name="info" size={16} /> {err}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email…" className="pl-9" />
          </div>
          <Pill tone="neutral">{users.length} user{users.length === 1 ? '' : 's'}</Pill>
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-primary" /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon="users" title="No users found" hint="Add a colleague to give them portal access." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-3">User</th>
                    <th className="px-3 py-3">Role</th>
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
                            <Avatar name={m.name || m.email} size={38} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{m.name || '—'}{isSelf && <span className="ml-1.5 text-xs font-medium text-muted-foreground">(you)</span>}</p>
                              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          {isSelf ? (
                            <Pill tone={ROLE_TONE[m.role] || 'neutral'}>{ROLE_LABEL[m.role] || m.role}</Pill>
                          ) : (
                            <div className="w-36">
                              <Select value={m.role} onChange={(e) => changeRole(m, e.target.value)}>
                                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                              </Select>
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" icon="settings" onClick={() => { setErr(''); setPw(''); setPwDone(false); setPwUser(m) }}>Set password</Button>
                            {!isSelf && (
                              <button onClick={() => removeUser(m)} aria-label="Remove user"
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-status-urgent hover:bg-status-urgent-bg">
                                <Icon name="x" size={13} />
                              </button>
                            )}
                          </div>
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

      {/* Add user */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add user"
        subtitle="Create a sign-in with an initial password and role."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button icon="check" disabled={!canAdd || saving} onClick={addUser}>{saving ? 'Creating…' : 'Create user'}</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Full name" required>
            <Input value={form.name} onChange={set('name')} placeholder="e.g. Neha Verma" />
          </Field>
          <Field label="Work email" required>
            <Input type="email" value={form.email} onChange={set('email')} placeholder="name@oyorooms.com" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" required>
              <Select value={form.role} onChange={set('role')}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </Field>
            <Field label="Initial password" required hint="Min 6 characters.">
              <Input type="text" value={form.password} onChange={set('password')} placeholder="Set a password" />
            </Field>
          </div>
        </div>
      </Modal>

      {/* Set password */}
      <Modal
        open={!!pwUser}
        onClose={() => setPwUser(null)}
        title="Set a new password"
        subtitle={pwUser ? `For ${pwUser.name || pwUser.email}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPwUser(null)}>Cancel</Button>
            <Button icon="check" disabled={pw.length < 6 || pwSaving || pwDone} onClick={savePassword}>{pwDone ? 'Saved ✓' : pwSaving ? 'Saving…' : 'Update password'}</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="New password" required hint="Min 6 characters. Share it with the user securely.">
            <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
          </Field>
          <p className="text-xs text-muted-foreground">The user can sign in with this immediately. They should change it after logging in.</p>
        </div>
      </Modal>
    </>
  )
}
