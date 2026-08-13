import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/ui/Icon.jsx'
import { Button, Field, Input } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import oyoLogo from '../assets/oyo-logo.png'
import loginCover from '../assets/login-cover.png'

const cx = (...c) => c.filter(Boolean).join(' ')

const ROLES = [
  {
    key: 'admin',
    title: 'Admin',
    desc: 'Full access — inventory, sales, finance, operations & team.',
    icon: 'boxes',
    name: 'Aarav Kapoor',
    email: 'admin@oyotours.in',
    pass: 'Admin@oyo2026',
  },
  {
    key: 'operations',
    title: 'Operations',
    desc: 'Airline inventory, payments, deadlines, release & dashboards.',
    icon: 'plane',
    name: 'Rohan Desai',
    email: 'ops@oyotours.in',
    pass: 'Ops@oyo2026',
  },
  {
    key: 'sales',
    title: 'Sales',
    desc: 'Sell packages to customers and manage their bookings.',
    icon: 'ticket',
    name: 'Priya Nair',
    email: 'sales@oyotours.in',
    pass: 'Sales@oyo2026',
  },
]

export default function Login() {
  const { login } = useApp()
  const navigate = useNavigate()
  const [role, setRole] = useState('admin')
  const active = ROLES.find((r) => r.key === role)
  const [email, setEmail] = useState(active.email)
  const [password, setPassword] = useState(active.pass)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Selecting a role card prefills its demo credentials (still editable).
  const pickRole = (r) => { setRole(r.key); setEmail(r.email); setPassword(r.pass); setError('') }

  const signIn = async (e) => {
    e.preventDefault()
    setBusy(true); setError('')
    const res = await login(email, password)
    setBusy(false)
    if (res?.error) { setError(res.error.message || 'Sign-in failed. Check your email and password.'); return }
    navigate('/')
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel with cover illustration */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-secondary/70 via-background to-secondary/40 p-12 lg:flex">
        <div className="relative flex items-center">
          <img src={oyoLogo} alt="OYO" className="h-9 w-auto" />
        </div>

        <div className="relative flex flex-1 items-center justify-center py-6">
          <img
            src={loginCover}
            alt="Guest arriving at their hotel"
            className="w-full max-w-xl object-contain drop-shadow-sm"
          />
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[26px] font-bold leading-tight tracking-tight">
            Package flights, booked and confirmed in one place.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Load fixed-departure inventory, book seats for your guests, and
            confirm them once the offline payment lands.
          </p>
        </div>
      </div>

      {/* Right sign-in */}
      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center lg:hidden">
            <img src={oyoLogo} alt="OYO" className="h-10 w-auto" />
          </div>

          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Welcome back
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            Sign in to the portal
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Choose how you're signing in today.
          </p>

          <div className="mt-6 grid gap-3">
            {ROLES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => pickRole(r)}
                className={cx(
                  'flex items-start gap-3 rounded-2xl border bg-card p-4 text-left transition-colors',
                  role === r.key ? 'border-primary ring-2 ring-ring/20' : 'hover:bg-muted',
                )}
              >
                <span
                  className={cx(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    role === r.key ? 'bg-secondary text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon name={r.icon} size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{r.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{r.desc}</p>
                </div>
                <span
                  className={cx(
                    'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border',
                    role === r.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {role === r.key && <Icon name="check" size={13} />}
                </span>
              </button>
            ))}
          </div>

          <form onSubmit={signIn} className="mt-6 grid gap-4">
            <Field label="Work email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            {error && (
              <p className="rounded-lg border border-status-urgent/30 bg-status-urgent-bg/40 px-3 py-2 text-xs font-medium text-status-urgent">{error}</p>
            )}
            <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>
              {busy ? 'Signing in…' : <>Sign in as {active.title}<Icon name="arrowRight" size={17} /></>}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-muted-foreground">
            Secure sign-in · roles enforced by the backend
          </p>
        </div>
      </div>
    </div>
  )
}
