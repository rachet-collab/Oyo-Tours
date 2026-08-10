import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Card, Input, Pill, EmptyState } from '../components/ui/primitives.jsx'
import InventoryImage from '../components/InventoryImage.jsx'
import { useApp } from '../store/AppStore.jsx'
import { shortDate } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')

// Vendors directory. Add vendors (name only) and, against each, see the
// inventory blocks sourced from that vendor. Inventory attaches vendors on the
// block's Edit page.
export default function Vendors() {
  const { vendors, addVendor, inventoryForVendor } = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState({}) // vendor name -> expanded?

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return vendors
      .filter((v) => !q || v.toLowerCase().includes(q))
      .map((v) => ({ name: v, items: inventoryForVendor(v) }))
      .sort((a, b) => b.items.length - a.items.length)
  }, [vendors, query, inventoryForVendor])

  const add = () => {
    const clean = name.trim()
    if (!clean) return
    addVendor(clean)
    setName('')
  }

  const routeFor = (i) => (i.type === 'hotel' ? '/hotels' : '/inventory')

  return (
    <>
      <TopBar
        title="Vendors"
        subtitle="Suppliers & consolidators — and the inventory sourced from each."
        actions={
          <>
            <Button variant="outline" icon="upload" onClick={() => navigate('/inventory/bulk-upload?type=vendor')}>Bulk upload</Button>
            <Button variant="outline" icon="boxes" onClick={() => navigate('/inventory')}>Back to inventory</Button>
          </>
        }
      />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {/* Add + search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="New vendor name" className="w-64" />
            <Button icon="plus" onClick={add} disabled={!name.trim()}>Add vendor</Button>
          </div>
          <div className="relative ml-auto">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendors" className="w-56 pl-9" />
          </div>
        </div>

        {rows.length === 0 ? (
          <Card><EmptyState icon="users" title="No vendors yet" hint="Add a vendor above, or attach one while editing an inventory block." /></Card>
        ) : (
          <div className="grid gap-4">
            {rows.map((v) => {
              const isOpen = !!open[v.name]
              return (
              <Card key={v.name} className="overflow-hidden">
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [v.name]: !o[v.name] }))}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-muted/40">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary"><Icon name="users" size={18} /></span>
                    <div>
                      <p className="text-base font-bold">{v.name}</p>
                      <p className="text-xs text-muted-foreground">{v.items.length} inventory block{v.items.length === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Pill tone={v.items.length ? 'won' : 'neutral'}>{v.items.length}</Pill>
                    <Icon name="chevronRight" size={16} className={cx('shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
                  </div>
                </button>
                {isOpen && (v.items.length > 0 ? (
                  <div className="divide-y border-t">
                    {v.items.map((i) => (
                      <button key={i.id} type="button" onClick={() => navigate(`${routeFor(i)}/${i.id}`)}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40">
                        <InventoryImage inv={i} size={36} rounded="rounded-lg" className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold"><span className="font-mono text-xs text-muted-foreground">{i.inventoryId}</span> · {i.sector}</p>
                          <p className="text-xs text-muted-foreground">{i.airline} · {shortDate(i.departureDate)}</p>
                        </div>
                        <Pill tone={i.status === 'Active' ? 'won' : i.status === 'Draft' ? 'new' : 'neutral'}>{i.status}</Pill>
                        <Icon name="chevronRight" size={14} className="shrink-0 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="border-t px-5 py-4 text-sm text-muted-foreground">No inventory sourced from this vendor yet.</div>
                ))}
              </Card>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
