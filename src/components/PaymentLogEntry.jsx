import Icon from './ui/Icon.jsx'
import { inr, shortDate } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')

// One entry in an inventory record's payment audit log — a "marked paid" or a
// "reversed" event, with who/when, note and (for payments) the proof file.
export default function PaymentLogEntry({ p }) {
  const reversed = !!p.reversed
  return (
    <div className={cx('rounded-xl border p-3 text-xs', reversed && 'border-status-urgent/30 bg-status-urgent-bg/20')}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {p.label}
          {reversed && <span className="ml-1 font-semibold text-status-urgent">· Reversed</span>}
        </span>
        <span className={cx('tabular-nums font-semibold', reversed ? 'text-status-urgent line-through' : 'text-status-won')}>{inr(p.amount)}</span>
      </div>
      <p className="mt-1 text-muted-foreground">
        {reversed ? 'Reversed' : 'Marked paid'} by <span className="font-semibold text-foreground">{p.by}</span>
        {p.at ? ` · ${shortDate(p.at)}` : ''}
      </p>
      {p.note && <p className="mt-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 leading-relaxed text-foreground">{p.note}</p>}
      {p.proofUrl && (
        <a href={p.proofUrl} download={p.proofName || 'payment-proof'} className="mt-1.5 inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
          <Icon name="paperclip" size={13} />
          <span className="truncate">{p.proofName || 'Download proof'}</span>
        </a>
      )}
    </div>
  )
}
