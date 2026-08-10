import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import { Button, Card, Input, Select } from '../components/ui/primitives.jsx'
import Icon from '../components/ui/Icon.jsx'
import { useApp } from '../store/AppStore.jsx'
import { INVENTORY_STATUSES } from '../store/data.js'
import { inr, shortDate } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')

const REPORTS = [
  {
    key: 'inventory', label: 'Inventory utilization',
    columns: [
      { k: 'inventoryId', label: 'ID' },
      { k: 'type', label: 'Type', fmt: (v) => (v === 'hotel' ? 'Hotel' : 'Airline') },
      { k: 'airline', label: 'Provider' },
      { k: 'sector', label: 'Route / stay' },
      { k: 'departureDate', label: 'Date', fmt: shortDate },
      { k: 'totalSeats', label: 'Purchased', num: true },
      { k: 'allocatedSeats', label: 'Allocated', num: true },
      { k: 'available', label: 'Available', num: true },
      { k: 'releasedSeats', label: 'Released', num: true },
      { k: 'utilization', label: 'Util %', num: true },
      { k: 'status', label: 'Status' },
    ],
    rows: (inv) => inv,
  },
  {
    key: 'operations', label: 'Naming & release',
    columns: [
      { k: 'inventoryId', label: 'ID' },
      { k: 'allocatedSeats', label: 'Allocated', num: true },
      { k: 'namesCaptured', label: 'Named', num: true },
      { k: 'namesPending', label: 'Pending', num: true },
      { k: 'namingDeadline', label: 'Naming by', fmt: shortDate },
      { k: 'releaseDeadline', label: 'Release by', fmt: shortDate },
      { k: 'available', label: 'Unsold', num: true },
      { k: 'status', label: 'Status' },
    ],
    rows: (inv) => inv,
  },
]

function download(name, rows, columns) {
  const head = columns.map((c) => c.label).join(',')
  const body = rows
    .map((r) => columns.map((c) => {
      let v = r[c.k]
      if (c.fmt) v = c.fmt(v)
      return `"${String(v ?? '').replace(/"/g, '""')}"`
    }).join(','))
    .join('\n')
  const blob = new Blob([head + '\n' + body], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const { inventoryView } = useApp()
  const navigate = useNavigate()
  const [key, setKey] = useState('inventory')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')
  const report = REPORTS.find((r) => r.key === key)
  const baseRows = useMemo(() => report.rows(inventoryView), [report, inventoryView])
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return baseRows.filter((r) => {
      const mt = type === 'all' || (r.type || 'airline') === type
      const ms = !status || r.status === status
      const mq = !q || [r.inventoryId, r.airline, r.sector].filter(Boolean).some((s) => String(s).toLowerCase().includes(q))
      return mt && ms && mq
    })
  }, [baseRows, type, status, query])
  const hasFilters = type !== 'all' || status || query
  const clearFilters = () => { setType('all'); setStatus(''); setQuery('') }

  const cell = (r, c) => {
    const v = r[c.k]
    if (c.money) return inr(v || 0)
    if (c.fmt) return c.fmt(v)
    return v
  }

  return (
    <>
      <TopBar title="Reports" subtitle="Exportable inventory, finance and operations reports." />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-wrap items-center gap-2">
          {REPORTS.map((r) => (
            <button key={r.key} onClick={() => setKey(r.key)}
              className={cx('rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors', key === r.key ? 'bg-secondary text-secondary-foreground' : 'border bg-card text-muted-foreground hover:bg-muted')}>
              {r.label}
            </button>
          ))}
          <Button icon="download" variant="outline" className="ml-auto" onClick={() => download(`oyo-${report.key}-report.csv`, rows, report.columns)}>
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All types</option>
              <option value="airline">Airline</option>
              <option value="hotel">Hotel</option>
            </Select>
          </div>
          <div className="w-52">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {INVENTORY_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
            </Select>
          </div>
          <div className="relative min-w-[220px] flex-1">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, provider or route" className="w-full pl-9" />
          </div>
        </div>

        {/* Result count + active filter chips */}
        <div className="-mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{rows.length} result{rows.length === 1 ? '' : 's'} found</span>
          {type !== 'all' && <FilterChip label="Type" value={type === 'hotel' ? 'Hotel' : 'Airline'} onClear={() => setType('all')} />}
          {status && <FilterChip label="Status" value={status} onClear={() => setStatus('')} />}
          {query && <FilterChip label="Search" value={query} onClear={() => setQuery('')} />}
          {hasFilters && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1 font-semibold text-status-urgent hover:underline">
              <Icon name="x" size={13} /> Clear
            </button>
          )}
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-base font-bold">{report.label}</h2>
            <span className="text-xs text-muted-foreground">{rows.length} records</span>
          </div>
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-muted/60 text-left text-[13px] font-semibold text-muted-foreground">
                  {report.columns.map((c) => <th key={c.k} className={cx('px-3 py-2.5 first:pl-5', c.num || c.money ? 'text-right' : '')}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}
                    onClick={() => navigate(`${(r.type || 'airline') === 'hotel' ? '/hotels' : '/inventory'}/${r.id}`)}
                    className="cursor-pointer border-t hover:bg-muted/40">
                    {report.columns.map((c) => (
                      <td key={c.k} className={cx('px-3 py-2.5 first:pl-5', c.num || c.money ? 'text-right tabular-nums' : '', c.k === 'inventoryId' ? 'font-mono text-xs font-semibold' : '')}>
                        {cell(r, c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}

function FilterChip({ label, value, onClear }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 font-semibold text-primary-foreground">
        {value}
        <button type="button" onClick={onClear} className="opacity-80 hover:opacity-100"><Icon name="x" size={11} /></button>
      </span>
    </span>
  )
}
