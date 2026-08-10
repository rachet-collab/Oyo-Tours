import { Link, useParams } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Card, Eyebrow, EmptyState } from '../components/ui/primitives.jsx'
import PaymentLogEntry from '../components/PaymentLogEntry.jsx'
import { useApp } from '../store/AppStore.jsx'
import { INVENTORY_LABELS } from '../store/data.js'

// Full payment audit log for one inventory record (all entries, newest first).
export default function InventoryAudit() {
  const { id } = useParams()
  const { inventoryById } = useApp()
  const inv = inventoryById(id)
  const L = INVENTORY_LABELS[inv?.type || 'airline']

  if (!inv) {
    return (
      <>
        <TopBar title="Record not found" />
        <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <Link to="/inventory" className="text-sm font-semibold text-primary">← Back to inventory</Link>
        </div>
      </>
    )
  }

  const log = [...(inv.paymentLog || [])].reverse()

  return (
    <>
      <TopBar
        title={
          <span className="flex items-center gap-2">
            <Link to={L.route} className="text-muted-foreground hover:text-foreground">{L.title}</Link>
            <Icon name="chevronRight" size={16} className="text-muted-foreground" />
            <Link to={`${L.route}/${inv.id}`} className="font-mono text-muted-foreground hover:text-foreground">{inv.inventoryId}</Link>
            <Icon name="chevronRight" size={16} className="text-muted-foreground" />
            <span>Payment audit log</span>
          </span>
        }
        subtitle={`${inv.airline} · ${inv.sector}`}
      />

      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-1.5">
            <Icon name="shield" size={14} className="text-muted-foreground" />
            <Eyebrow>Payment audit log</Eyebrow>
            <span className="ml-auto text-xs text-muted-foreground">{log.length} entr{log.length === 1 ? 'y' : 'ies'}</span>
          </div>
          {log.length === 0 ? (
            <EmptyState icon="shield" title="No payment activity yet" hint="Marking a payment paid or reversing one is recorded here." />
          ) : (
            <div className="grid gap-2">
              {log.map((p, i) => <PaymentLogEntry key={i} p={p} />)}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
