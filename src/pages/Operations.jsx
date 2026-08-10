import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TopBar from '../components/layout/TopBar.jsx'
import Icon from '../components/ui/Icon.jsx'
import { Button, Card, Pill, EmptyState } from '../components/ui/primitives.jsx'
import InventoryImage from '../components/InventoryImage.jsx'
import { useApp } from '../store/AppStore.jsx'
import { shortDate } from '../lib/format.js'

const cx = (...c) => c.filter(Boolean).join(' ')
const TABS = ['Release decisions', 'Naming pending']

function daysText(d) {
  if (d == null) return ''
  return d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'today' : `in ${d}d`
}

export default function Operations() {
  const { inventoryView } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState('Release decisions')

  const go = (i) => navigate(`${i.type === 'hotel' ? '/hotels' : '/inventory'}/${i.id}`)

  const lists = useMemo(() => {
    const release = inventoryView.filter((i) => i.available > 0 && i.releaseDaysLeft != null && i.releaseDaysLeft <= 7 && i.status === 'Active').sort((a, b) => a.releaseDaysLeft - b.releaseDaysLeft)
    const naming = inventoryView.filter((i) => i.namesPending > 0 && i.namingDaysLeft != null && i.namingDaysLeft <= 10).sort((a, b) => a.namingDaysLeft - b.namingDaysLeft)
    return { 'Release decisions': release, 'Naming pending': naming }
  }, [inventoryView])

  const rows = lists[tab]

  return (
    <>
      <TopBar title="Operations" subtitle="Deadline-driven tasks across airline & hotel inventory." />

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cx('inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-[13px] font-semibold transition-colors', tab === t ? 'bg-secondary text-secondary-foreground' : 'border bg-card text-muted-foreground hover:bg-muted')}>
              {t}
              <span className={cx('rounded-md px-1.5 text-xs tabular-nums', tab === t ? 'bg-white/60' : 'bg-muted')}>{lists[t].length}</span>
            </button>
          ))}
        </div>

        <Card className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState icon="check" title="All clear" hint="No pending items in this queue." />
          ) : (
            <div className="grid gap-2 p-4">
              {rows.map((i) => {
                const days = tab === 'Release decisions' ? i.releaseDaysLeft : i.namingDaysLeft
                return (
                  <div key={i.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3.5">
                    <InventoryImage inv={i} size={40} rounded="rounded-lg" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold"><span className="font-mono text-xs text-muted-foreground">{i.inventoryId}</span> · {i.sector}</p>
                      <p className="text-xs text-muted-foreground">
                        {tab === 'Release decisions' && `${i.available} unsold ${i.type === 'hotel' ? 'rooms' : 'seats'} · release window closes ${daysText(i.releaseDaysLeft)}`}
                        {tab === 'Naming pending' && `${i.namesPending} names pending · deadline ${shortDate(i.namingDeadline)} (${daysText(i.namingDaysLeft)})`}
                      </p>
                    </div>
                    <Pill tone={days != null && days <= 1 ? 'urgent' : 'proposal'}>{daysText(days)}</Pill>
                    <Button size="sm" variant="outline" icon="arrowRight" onClick={() => go(i)}>Open</Button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
