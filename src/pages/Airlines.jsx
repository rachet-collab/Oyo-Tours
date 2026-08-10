import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Card, Input, Pill, EmptyState } from '../components/ui/primitives.jsx'
import InventoryImage from '../components/InventoryImage.jsx'
import { useApp } from '../store/AppStore.jsx'
import { airlineCode } from '../lib/airlines.js'

const cx = (...c) => c.filter(Boolean).join(' ')

// Airlines registry — backend-driven. Add carriers with their 2-letter code
// (the flight-number prefix the app matches on, e.g. AI 2937 → Air India).
export default function Airlines() {
  const { airlines, inventoryView, addAirline, deleteAirline } = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [logo, setLogo] = useState('')
  const [query, setQuery] = useState('')
  const [toDelete, setToDelete] = useState(null)

  const counts = useMemo(() => {
    const m = {}
    inventoryView.forEach((i) => { if ((i.type || 'airline') === 'airline') m[i.airline] = (m[i.airline] || 0) + 1 })
    return m
  }, [inventoryView])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return airlines
      .filter((a) => !q || a.name.toLowerCase().includes(q) || (a.code || '').toLowerCase().includes(q))
      .map((a) => ({ ...a, code: a.code || airlineCode(a.name), blocks: counts[a.name] || 0 }))
      .sort((a, b) => b.blocks - a.blocks || a.name.localeCompare(b.name))
  }, [airlines, query, counts])

  const canAdd = name.trim().length > 0
  const add = () => {
    if (!canAdd) return
    addAirline(name.trim(), { code: code.trim().toUpperCase(), logoUrl: logo.trim() })
    setName(''); setCode(''); setLogo('')
  }

  return (
    <>
      <TopBar
        title="Airlines"
        subtitle="Carriers available when adding flight inventory — with the code used to match flight numbers."
        actions={<Button variant="outline" icon="chevronLeft" onClick={() => navigate('/inventory/flights')}>Flight inventory</Button>}
      />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {/* Add airline */}
        <Card className="p-5">
          <h2 className="text-sm font-bold">Add an airline</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">The code is the flight-number prefix (e.g. <span className="font-mono">AI</span>, <span className="font-mono">6E</span>). We’ll suggest one from the name.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <span className="mb-1 block text-[13px] font-semibold text-muted-foreground">Airline name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)}
                onBlur={() => { if (!code && name.trim()) setCode(airlineCode(name.trim())) }}
                placeholder="e.g. Air India Express" />
            </div>
            <div className="w-28">
              <span className="mb-1 block text-[13px] font-semibold text-muted-foreground">Code</span>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 3))} placeholder="AI" className="font-mono uppercase" />
            </div>
            <div className="min-w-[200px] flex-1">
              <span className="mb-1 block text-[13px] font-semibold text-muted-foreground">Logo URL (optional)</span>
              <Input value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…" />
            </div>
            <Button icon="plus" onClick={add} disabled={!canAdd}>Add airline</Button>
          </div>
        </Card>

        <div className="relative max-w-sm">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search airlines or codes" className="w-full pl-9" />
        </div>

        {rows.length === 0 ? (
          <Card><EmptyState icon="plane" title="No airlines yet" hint="Add a carrier above to make it available when creating flight inventory." /></Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y">
              {rows.map((a) => (
                <div key={a.name} className="flex items-center gap-3 px-5 py-3">
                  <InventoryImage inv={{ type: 'airline', airline: a.name, imageUrl: a.logoUrl }} size={40} rounded="rounded-xl" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{a.name}</p>
                      {a.code
                        ? <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary">{a.code}</span>
                        : <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">no code</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{a.blocks} flight block{a.blocks === 1 ? '' : 's'}</p>
                  </div>
                  <Pill tone={a.blocks ? 'won' : 'neutral'}>{a.blocks}</Pill>
                  <button
                    type="button"
                    onClick={() => setToDelete(a)}
                    title={a.blocks ? 'In use by flight blocks' : 'Remove airline'}
                    disabled={a.blocks > 0}
                    className={cx('inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors',
                      a.blocks > 0 ? 'cursor-not-allowed border-border text-muted-foreground opacity-50' : 'border-[#f0c6cc] text-status-urgent hover:bg-status-urgent-bg')}
                  >
                    <Icon name="x" size={13} /> Remove
                  </button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setToDelete(null)}>
          <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">Remove airline?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This removes <span className="font-semibold text-foreground">{toDelete.name}</span> from the registry. It won’t affect existing inventory records.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setToDelete(null)}>Keep</Button>
              <Button variant="danger" icon="x" onClick={() => { deleteAirline(toDelete.name); setToDelete(null) }}>Remove</Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
