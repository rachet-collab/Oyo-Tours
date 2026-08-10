import { useState, useEffect } from 'react'
import Icon from './ui/Icon.jsx'
import { airlineLogoUrl } from '../lib/airlines.js'

const cx = (...c) => c.filter(Boolean).join(' ')

// Deterministic tints for airline monograms (mono/neutral, on-brand).
const TINTS = [
  'bg-[#ececee] text-[#111111]',
  'bg-[#e8f0f8] text-[#2d6499]',
  'bg-[#e2f2f2] text-[#0a7c7e]',
  'bg-[#fbf1de] text-[#b76e00]',
  'bg-[#e5f4ec] text-[#118d57]',
]
const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '—'

// The visual for an inventory record: a flight airline logo (from a public CDN,
// falling back to a monogram) or a hotel property image/placeholder. `img`
// overrides (e.g. an uploaded logo/image not yet on the record).
export default function InventoryImage({ inv, img, size = 40, rounded = 'rounded-xl', className = '' }) {
  const isHotel = (inv?.type || 'airline') === 'hotel'
  const explicit = img || inv?.imageUrl
  const derived = !isHotel && !explicit ? airlineLogoUrl(inv?.airline) : ''
  const src = explicit || derived
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [src])
  const style = { width: size, height: size }

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        style={style}
        onError={() => setFailed(true)}
        className={cx('shrink-0 border object-contain bg-white', rounded, className)}
      />
    )
  }
  if (isHotel) {
    return (
      <span style={style} className={cx('inline-flex shrink-0 items-center justify-center border bg-secondary text-muted-foreground', rounded, className)}>
        <Icon name="building" size={Math.round(size * 0.5)} />
      </span>
    )
  }
  const tint = TINTS[(inv?.airline?.charCodeAt(0) || 0) % TINTS.length]
  return (
    <span
      style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.34)) }}
      className={cx('inline-flex shrink-0 items-center justify-center font-bold', rounded, tint, className)}
    >
      {initials(inv?.airline)}
    </span>
  )
}
