import { useEffect } from 'react'
import Icon from './Icon.jsx'
import { STATUS_TONE, normalizeStatus } from '../../store/data.js'
import { initials } from '../../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')

/* ----------------------------------------------------------- Button ---- */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  type = 'button',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-45 disabled:pointer-events-none'
  const sizes = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-5 text-sm',
    icon: 'h-9 w-9',
  }
  const variants = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
    secondary:
      'bg-secondary text-secondary-foreground hover:bg-secondary/70',
    outline:
      'border bg-card text-foreground hover:bg-muted',
    ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
    danger:
      'bg-card border border-[#f0c6cc] text-[#b01f31] hover:bg-[#fbe9eb]',
  }
  return (
    <button
      type={type}
      className={cx(base, sizes[size], variants[variant], className)}
      {...props}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 15 : 17} />}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------- Card ---- */
export function Card({ children, className = '', ...props }) {
  return (
    <div
      className={cx(
        'rounded-2xl border bg-card shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* ---------------------------------------------------------- Eyebrow ---- */
export function Eyebrow({ children, className = '' }) {
  return (
    <p
      className={cx(
        'text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  )
}

/* -------------------------------------------------------- StatusPill ---- */
const TONE_CLASS = {
  new: 'bg-status-new-bg text-status-new',
  qualified: 'bg-status-qualified-bg text-status-qualified',
  proposal: 'bg-status-proposal-bg text-status-proposal',
  won: 'bg-status-won-bg text-status-won',
  urgent: 'bg-status-urgent-bg text-status-urgent',
  neutral: 'bg-muted text-muted-foreground',
}

export function Pill({ tone = 'neutral', children, dot = false, className = '' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold',
        TONE_CLASS[tone] || TONE_CLASS.neutral,
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

// Badge tones for the count chip inside FilterTabs.
const TAB_BADGE = {
  dark: 'bg-foreground text-background',
  won: 'bg-status-won-bg text-status-won',
  proposal: 'bg-status-proposal-bg text-status-proposal',
  urgent: 'bg-status-urgent-bg text-status-urgent',
  new: 'bg-status-new-bg text-status-new',
  neutral: 'bg-muted text-muted-foreground',
}

// Dismissible active-filter chip — "Label : [dark value pill ✕]".
// Matches the Figma "Table/FiltersResults" chip group: an outlined 8px container
// (8px padding, 8px gap, 40px tall) holding a "Label :" + a dark inner chip.
export function Chip({ label, value, onClear }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-lg border px-2 text-[13px]">
      <span className="pl-1 text-muted-foreground">{label} :</span>
      <span className="inline-flex items-center gap-1 rounded-md bg-foreground py-1 pl-2 pr-1 text-xs font-semibold text-background">
        {value}
        <button type="button" onClick={onClear} aria-label={`Clear ${label}`}
          className="flex h-4 w-4 items-center justify-center rounded-full bg-background/25 transition-colors hover:bg-background/45">
          <Icon name="x" size={10} />
        </button>
      </span>
    </span>
  )
}

// Standard table pagination footer: rows-per-page, range, prev/next.
export function Pagination({ page, perPage, total, onPage, onPerPage, perPageOptions = [10, 25, 50] }) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(total, page * perPage)
  const btn = 'flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition-colors enabled:hover:bg-muted disabled:opacity-40'
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3 border-t px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Rows per page:</span>
        <select value={perPage} onChange={(e) => onPerPage(Number(e.target.value))}
          className="rounded-lg border bg-card px-2 py-1 text-sm font-medium text-foreground">
          {perPageOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <span className="tabular-nums text-muted-foreground">{from}–{to} of {total}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><Icon name="chevronLeft" size={16} /></button>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><Icon name="chevronRight" size={16} /></button>
      </div>
    </div>
  )
}

// Underline-style filter tab bar with a colored count badge per tab.
// tabs: [{ key, label, count?, tone?, dot? }]
export function FilterTabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={cx('flex flex-wrap items-center gap-x-7 gap-y-2 border-b', className)}>
      {tabs.map((t) => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cx(
              'relative -mb-px flex items-center gap-2 border-b-2 pb-2.5 pt-1 text-sm transition-colors',
              active ? 'border-foreground font-bold text-foreground' : 'border-transparent font-semibold text-muted-foreground hover:text-foreground',
            )}
          >
            <span className="flex items-center gap-1.5">
              {t.icon && <Icon name={t.icon} size={16} className={active ? 'text-foreground' : 'text-muted-foreground'} />}
              {t.dot && <span className={cx('h-1.5 w-1.5 rounded-full', t.dotClass || 'bg-current')} />}
              {t.label}
            </span>
            {t.count != null && (
              <span className={cx('inline-flex min-w-[22px] items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums', TAB_BADGE[t.tone] || TAB_BADGE.neutral)}>
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function StatusPill({ status, className = '' }) {
  const s = normalizeStatus(status)
  return (
    <Pill tone={STATUS_TONE[s] || 'neutral'} dot className={className}>
      {s}
    </Pill>
  )
}

/* -------------------------------------------------------- Avatar ------- */
const AVATAR_TINTS = [
  'bg-[#ececee] text-[#111111]',
  'bg-[#e8f0f8] text-[#2d6499]',
  'bg-[#e2f2f2] text-[#0a7c7e]',
  'bg-[#fbf1de] text-[#b76e00]',
  'bg-[#e5f4ec] text-[#118d57]',
]
export function Avatar({ name, size = 36, className = '' }) {
  const tint =
    AVATAR_TINTS[(name?.charCodeAt(0) || 0) % AVATAR_TINTS.length]
  return (
    <span
      className={cx(
        'inline-flex items-center justify-center rounded-full font-semibold',
        tint,
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  )
}

/* --------------------------------------------------------- Inputs ------ */
export function Field({ label, hint, children, required }) {
  return (
    <label className="flex flex-col gap-1.5">
      {label && (
        <span className="text-[13px] font-semibold text-foreground">
          {label}
          {required && <span className="text-[#b01f31]"> *</span>}
        </span>
      )}
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
}

const inputBase =
  'h-10 w-full rounded-lg border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25 transition-colors'

export function Input({ className = '', ...props }) {
  return <input className={cx(inputBase, className)} {...props} />
}

export function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={cx(inputBase, 'h-auto py-2.5 leading-relaxed', className)}
      {...props}
    />
  )
}

export function Select({ className = '', children, ...props }) {
  return (
    <div className="relative">
      <select
        className={cx(inputBase, 'appearance-none pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <Icon
        name="chevronDown"
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

/* --------------------------------------------------------- Modal ------- */
export function Modal({ open, onClose, title, subtitle, children, footer, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#1c1626]/35 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'mt-4 w-full rounded-2xl border bg-card shadow-xl sm:mt-10',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5">
          <div>
            <h3 className="text-lg font-bold">{title}</h3>
            {subtitle && (
              <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </Button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t bg-muted/40 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------------------------- EmptyState ------ */
export function EmptyState({ icon = 'search', title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
        <Icon name={icon} size={22} />
      </span>
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}

/* ---------------------------------------------------- SeatMeter -------- */
export function SeatMeter({ available, total }) {
  const pct = total ? Math.round((available / total) * 100) : 0
  const tone =
    pct === 0 ? '#b01f31' : pct <= 25 ? '#b76e00' : '#118d57'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(pct, available ? 6 : 0)}%`, background: tone }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums" style={{ color: tone }}>
        {available}
        <span className="text-muted-foreground">/{total}</span>
      </span>
    </div>
  )
}
