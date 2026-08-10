import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './ui/Icon.jsx'
import { useApp } from '../store/AppStore.jsx'
import { NOTIF_TYPES, buildNotifications, loadNotifPrefs, saveNotifPrefs } from '../lib/notifications.js'

const cx = (...c) => c.filter(Boolean).join(' ')

export default function NotificationBell() {
  const { inventoryView, bookings, user } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [prefs, setPrefs] = useState(() => loadNotifPrefs())
  const ref = useRef(null)
  const isAdmin = user?.role === 'admin'

  const items = useMemo(() => buildNotifications({ inventoryView, bookings }, prefs), [inventoryView, bookings, prefs])
  const count = items.length

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const setPref = (key, val) => setPrefs((p) => { const n = { ...p, [key]: val }; saveNotifPrefs(n); return n })
  const go = (to) => { setOpen(false); navigate(to) }

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => { setOpen((o) => !o); setShowConfig(false) }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
        aria-label="Notifications">
        <Icon name="bell" size={19} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-[340px] overflow-hidden rounded-2xl border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-bold">Notifications{count > 0 ? ` · ${count}` : ''}</span>
            {isAdmin && (
              <button type="button" onClick={() => setShowConfig((s) => !s)}
                className={cx('flex h-7 w-7 items-center justify-center rounded-lg transition-colors', showConfig ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted')}
                aria-label="Notification settings">
                <Icon name="settings" size={15} />
              </button>
            )}
          </div>

          {showConfig ? (
            <div className="grid gap-1 p-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">Enabled types</p>
              {NOTIF_TYPES.map((t) => {
                const enabled = prefs[t.key] !== false
                return (
                  <button key={t.key} type="button" onClick={() => setPref(t.key, !enabled)}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"><Icon name={t.icon} size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{t.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t.hint}</span>
                    </span>
                    <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', enabled ? 'bg-success' : 'bg-muted-foreground/30')}>
                      <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all', enabled ? 'left-[18px]' : 'left-0.5')} />
                    </span>
                  </button>
                )
              })}
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon name="bell" size={20} /></span>
              <p className="text-sm font-semibold">You're all caught up</p>
              <p className="text-xs text-muted-foreground">No pending approvals, deadlines or names.</p>
            </div>
          ) : (
            <div className="max-h-[380px] overflow-y-auto">
              {items.map((n) => (
                <button key={n.id} type="button" onClick={() => go(n.to)}
                  className="flex w-full items-start gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/50">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `var(--color-status-${n.tone}-bg)`, color: `var(--color-status-${n.tone})` }}>
                    <Icon name={n.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{n.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{n.desc}</span>
                  </span>
                  <Icon name="chevronRight" size={15} className="mt-1 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
