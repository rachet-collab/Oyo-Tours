import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Card, Eyebrow } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import { NOTIF_TYPES, buildNotifications, loadNotifPrefs, saveNotifPrefs } from '../lib/notifications.js'

const cx = (...c) => c.filter(Boolean).join(' ')

// A clear on/off switch — bigger and higher-contrast than the old inline one.
function Toggle({ on, onChange, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-success' : 'bg-muted-foreground/30', disabled && 'opacity-50')}>
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all', on ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

export default function Notifications() {
  const { inventoryView, bookings, user } = useApp()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'
  const [prefs, setPrefs] = useState(() => loadNotifPrefs())

  const items = useMemo(() => buildNotifications({ inventoryView, bookings }, prefs), [inventoryView, bookings, prefs])
  const setPref = (key, val) => setPrefs((p) => { const n = { ...p, [key]: val }; saveNotifPrefs(n); return n })

  // Group the feed by type, in the canonical NOTIF_TYPES order.
  const groups = NOTIF_TYPES.map((t) => ({ ...t, items: items.filter((n) => n.type === t.key) })).filter((g) => g.items.length > 0)
  const countByKey = Object.fromEntries(NOTIF_TYPES.map((t) => [t.key, items.filter((n) => n.type === t.key).length]))

  return (
    <>
      <TopBar title="Notifications" subtitle="Everything that needs attention — approvals, deadlines, names & refunds." />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {/* Summary tiles — one per type, tinted by tone. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {NOTIF_TYPES.map((t) => {
            const c = countByKey[t.key]
            const muted = prefs[t.key] === false
            return (
              <Card key={t.key} className={cx('flex items-center gap-3 p-4', muted && 'opacity-60')}>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `var(--color-status-${t.tone}-bg)`, color: `var(--color-status-${t.tone})` }}>
                  <Icon name={t.icon} size={20} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{t.label}</p>
                  <p className="text-2xl font-bold tabular-nums">{muted ? '—' : c}</p>
                </div>
              </Card>
            )
          })}
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Feed */}
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b px-5 py-3.5">
                <Eyebrow>Needs attention</Eyebrow>
                <span className="text-xs font-semibold text-muted-foreground">{items.length} item{items.length === 1 ? '' : 's'}</span>
              </div>

              {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-status-won-bg text-status-won"><Icon name="check" size={26} /></span>
                  <p className="text-base font-bold">You're all caught up</p>
                  <p className="text-sm text-muted-foreground">No pending approvals, deadlines, names or refunds right now.</p>
                </div>
              ) : (
                <div className="grid gap-5 p-5">
                  {groups.map((g) => (
                    <div key={g.key}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md"
                          style={{ background: `var(--color-status-${g.tone}-bg)`, color: `var(--color-status-${g.tone})` }}>
                          <Icon name={g.icon} size={13} />
                        </span>
                        <h3 className="text-sm font-bold">{g.label}</h3>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{g.items.length}</span>
                      </div>
                      <div className="grid gap-1.5">
                        {g.items.map((n) => (
                          <button key={n.id} type="button" onClick={() => navigate(n.to)}
                            className="flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors hover:bg-muted/50">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                              style={{ background: `var(--color-status-${n.tone}-bg)`, color: `var(--color-status-${n.tone})` }}>
                              <Icon name={n.icon} size={16} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">{n.title}</span>
                              <span className="block truncate text-xs text-muted-foreground">{n.desc}</span>
                            </span>
                            <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Settings — always visible; toggles are editable by admins. */}
          <div>
            <Card className="p-5">
              <div className="mb-1 flex items-center gap-2">
                <Icon name="settings" size={15} className="text-primary" />
                <Eyebrow>Notification settings</Eyebrow>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                {isAdmin ? 'Turn each notification type on or off for the workspace.' : 'Only an admin can change these settings.'}
              </p>
              <div className="grid gap-2">
                {NOTIF_TYPES.map((t) => {
                  const enabled = prefs[t.key] !== false
                  return (
                    <div key={t.key} className="flex items-center gap-3 rounded-xl border p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"><Icon name={t.icon} size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{t.label}</p>
                        <p className="truncate text-xs text-muted-foreground">{t.hint}</p>
                      </div>
                      <Toggle on={enabled} disabled={!isAdmin} onChange={(v) => setPref(t.key, v)} />
                    </div>
                  )
                })}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}
