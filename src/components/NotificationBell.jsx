import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './ui/Icon.jsx'
import { useApp } from '../store/AppStore.jsx'
import { buildNotifications, loadNotifPrefs } from '../lib/notifications.js'

// The bell in the utility bar. Shows the live pending count and opens the
// dedicated Notifications page (no more dropdown modal).
export default function NotificationBell() {
  const { inventoryView, bookings } = useApp()
  const navigate = useNavigate()
  const [prefs] = useState(() => loadNotifPrefs())

  const items = useMemo(() => buildNotifications({ inventoryView, bookings }, prefs), [inventoryView, bookings, prefs])
  const count = items.length

  return (
    <button type="button" onClick={() => navigate('/notifications')}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
      aria-label={`Notifications${count > 0 ? ` · ${count} pending` : ''}`}>
      <Icon name="bell" size={19} />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}
