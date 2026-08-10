import { useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Card, Pill, Textarea } from '../components/ui/primitives.jsx'
import { useApp } from '../store/AppStore.jsx'
import InventoryImport from './InventoryImport.jsx'

const CHOICES = [
  { key: 'airline', icon: 'plane', title: 'Flights', desc: 'Airline seat blocks — routes, dates, seats, vendors.' },
  { key: 'hotel', icon: 'building', title: 'Hotels', desc: 'Hotel room blocks — properties, stays, rooms, vendors.' },
  { key: 'vendor', icon: 'users', title: 'Vendors', desc: 'Add suppliers & consolidators in one go.' },
]

// Reads the first column of an Excel/CSV file as a list of names.
async function namesFromFile(file) {
  const isText = /\.(csv|tsv|txt)$/i.test(file.name)
  const wb = isText
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' })
  return rows.map((r) => String(r[0] ?? '').trim())
}

function VendorBulk() {
  const { vendors, addVendor } = useApp()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState(null)
  const [done, setDone] = useState(null)
  const fileRef = useRef(null)

  const existing = useMemo(() => new Set(vendors.map((v) => v.toLowerCase())), [vendors])
  // Parse names from the textarea (one per line, or comma/tab separated).
  const parsed = useMemo(() => {
    const raw = text.split(/[\n,\t]/).map((s) => s.trim()).filter(Boolean)
    const seen = new Set()
    const out = []
    raw.forEach((name) => {
      if (/^(vendor|name|supplier)$/i.test(name)) return // header row
      const key = name.toLowerCase()
      if (seen.has(key)) return
      seen.add(key)
      out.push({ name, dup: existing.has(key) })
    })
    return out
  }, [text, existing])
  const fresh = parsed.filter((p) => !p.dup)

  const onFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const names = await namesFromFile(f)
      setText(names.join('\n'))
      setFileName(f.name)
      setDone(null)
    } catch { /* ignore */ }
  }

  const run = () => {
    const list = fresh
    if (!list.length) return
    setDone(null)
    setProgress({ done: 0, total: list.length })
    let idx = 0
    const step = () => {
      const end = Math.min(idx + 5, list.length)
      for (; idx < end; idx += 1) addVendor(list[idx].name)
      setProgress({ done: idx, total: list.length })
      if (idx < list.length) { setTimeout(step, 45); return }
      setDone({ added: list.length, skipped: parsed.length - list.length })
      setProgress(null); setText(''); setFileName('')
    }
    setTimeout(step, 45)
  }

  return (
    <div className="grid gap-4">
      <div
        onClick={() => fileRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors hover:bg-muted/40"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary"><Icon name="upload" size={20} /></span>
        <p className="text-sm font-semibold">Upload a vendor list</p>
        <p className="text-xs text-muted-foreground">Excel (.xlsx, .xls) or CSV — vendor names in the first column.</p>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" hidden onChange={onFile} />
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">Or paste names (one per line)</p>
        <Textarea rows={5} value={text} onChange={(e) => { setText(e.target.value); setDone(null) }}
          placeholder={'Cleartrip Consolidator\nAkbar Travels\nRiya Group'} className="font-mono text-xs" />
      </div>

      {fileName && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon name="file" size={13} /> {fileName}</p>}

      {parsed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Pill tone="won">{fresh.length} new</Pill>
          {parsed.length - fresh.length > 0 && <Pill tone="proposal">{parsed.length - fresh.length} already exist</Pill>}
          <span className="text-muted-foreground">{parsed.slice(0, 6).map((p) => p.name).join(', ')}{parsed.length > 6 ? '…' : ''}</span>
        </div>
      )}

      {progress && (
        <div className="grid gap-1.5 rounded-xl border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5"><Icon name="upload" size={14} /> Adding vendors…</span>
            <span className="tabular-nums">{progress.done} / {progress.total}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}
      {done && (
        <div className="flex items-center gap-2 rounded-xl border border-status-won/30 bg-status-won-bg/40 p-3 text-sm">
          <Icon name="check" size={16} className="text-status-won" /> Added {done.added} vendor{done.added === 1 ? '' : 's'}{done.skipped ? ` · ${done.skipped} skipped` : ''}.
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t pt-3">
        <Button icon="check" disabled={!fresh.length || !!progress} onClick={run}>{progress ? 'Adding…' : `Add ${fresh.length} vendor${fresh.length === 1 ? '' : 's'}`}</Button>
      </div>
    </div>
  )
}

export default function BulkUpload() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const type = params.get('type') || ''
  const choice = CHOICES.find((c) => c.key === type) || null
  const setType = (key) => setParams(key ? { type: key } : {})

  return (
    <>
      <TopBar
        title="Bulk upload"
        subtitle={choice ? `Import ${choice.title.toLowerCase()} from Excel or CSV.` : 'Choose what you want to import.'}
        actions={<Button variant="outline" icon="chevronLeft" onClick={() => (choice ? setType('') : navigate('/inventory'))}>{choice ? 'Change type' : 'Inventory overview'}</Button>}
      />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {!choice ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {CHOICES.map((c) => (
              <Card key={c.key} onClick={() => setType(c.key)}
                className="group flex cursor-pointer flex-col gap-4 p-5 transition-shadow hover:shadow-md">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><Icon name={c.icon} size={22} /></span>
                <div>
                  <h2 className="text-base font-bold">{c.title}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{c.desc}</p>
                </div>
                <span className="text-sm font-semibold text-primary">Upload {c.title.toLowerCase()} →</span>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-5">
            {type === 'vendor'
              ? <VendorBulk />
              : <InventoryImport type={type} asPage />}
          </Card>
        )}
      </div>
    </>
  )
}
