import { useState } from 'react'

const cx = (...c) => c.filter(Boolean).join(' ')

// Neutral static placeholder shown when a package has no uploaded cover image.
function PlaceholderMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="4" y="8" width="40" height="32" rx="4" className="stroke-current" strokeWidth="2" opacity="0.5" />
      <circle cx="16" cy="18" r="3.2" className="fill-current" opacity="0.5" />
      <path d="M9 39l10.5-12 7.5 8 5-5.5L39 39" className="stroke-current" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.5" fill="none" />
    </svg>
  )
}

/**
 * Package cover frame. Renders an uploaded photo from `url` when present;
 * otherwise shows a neutral static image placeholder so cards stay consistent.
 * `className` sets the height/shape of the frame.
 */
export default function CityCover({
  url,
  city,
  overlayLabel,
  className = 'h-40',
  rounded = 'rounded-t-2xl',
  focal,
}) {
  const [failed, setFailed] = useState(false)
  const showImg = url && !failed
  const objectPosition = focal ? `${focal.x ?? 50}% ${focal.y ?? 50}%` : '50% 50%'

  return (
    <div className={cx('relative w-full overflow-hidden bg-secondary', rounded, className)}>
      {showImg ? (
        <img
          src={url}
          alt={city}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ objectPosition }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
          <PlaceholderMark />
          {city && !overlayLabel && <span className="text-xs font-semibold tracking-wide">{city}</span>}
        </div>
      )}
      {overlayLabel && (
        <>
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
            {overlayLabel}
          </div>
        </>
      )}
    </div>
  )
}
