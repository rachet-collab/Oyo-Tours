export const inr = (n) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0)

export const shortDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export const dayMonth = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// Duration between two "HH:MM" strings; wraps past midnight for overnight legs.
export const flightDuration = (dep, arr) => {
  if (!dep || !arr) return ''
  const [dh, dm] = dep.split(':').map(Number)
  const [ah, am] = arr.split(':').map(Number)
  let mins = ah * 60 + am - (dh * 60 + dm)
  if (mins <= 0) mins += 1440
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h${m ? ` ${m}m` : ''}`
}

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
