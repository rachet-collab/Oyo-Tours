// Solid UI icons (Zip B set), recolored to currentColor and sized to 1em.
import sSearch from '../../assets/ui/search.svg?raw'
import sPlus from '../../assets/ui/plus.svg?raw'
import sX from '../../assets/ui/x.svg?raw'
import sCheck from '../../assets/ui/check.svg?raw'
import sChevronRight from '../../assets/ui/chevronRight.svg?raw'
import sChevronDown from '../../assets/ui/chevronDown.svg?raw'
import sArrowRight from '../../assets/ui/arrowRight.svg?raw'
import sDownload from '../../assets/ui/download.svg?raw'
import sFilter from '../../assets/ui/filter.svg?raw'
import sClock from '../../assets/ui/clock.svg?raw'
import sCalendar from '../../assets/ui/calendar.svg?raw'
import sTrend from '../../assets/ui/trend.svg?raw'
import sMail from '../../assets/ui/mail.svg?raw'
import sPhone from '../../assets/ui/phone.svg?raw'
import sUsers from '../../assets/ui/users.svg?raw'
import sMapPin from '../../assets/ui/mapPin.svg?raw'
import sEdit from '../../assets/ui/edit.svg?raw'
import sPaperclip from '../../assets/ui/paperclip.svg?raw'
import sShield from '../../assets/ui/shield.svg?raw'
import sFile from '../../assets/ui/file.svg?raw'
import sSparkle from '../../assets/ui/sparkle.svg?raw'

const SOLID = {
  search: sSearch, plus: sPlus, x: sX, check: sCheck,
  chevronRight: sChevronRight, chevronDown: sChevronDown, arrowRight: sArrowRight,
  download: sDownload, filter: sFilter, clock: sClock, calendar: sCalendar,
  trend: sTrend, mail: sMail, phone: sPhone, users: sUsers, mapPin: sMapPin,
  edit: sEdit, paperclip: sPaperclip, shield: sShield, file: sFile, sparkle: sSparkle,
}

// Lightweight stroke icon set (lucide-style), single component keyed by name.
const P = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  plane: (
    <path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.6.6 0 0 0-.6.9l3 4.8-2.7 2.7-1.9-.5a.5.5 0 0 0-.5.8l1.9 2 2 1.9a.5.5 0 0 0 .8-.5l-.5-1.9 2.7-2.7 4.8 3a.6.6 0 0 0 .9-.6Z" />
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  ticket: (
    <>
      <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
      <path d="M13 5v2M13 17v2M13 11v2" />
    </>
  ),
  boxes: (
    <>
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 1.03 1.75l3 1.65a2 2 0 0 0 1.94 0L10 20v-6.5l-3.5-2-3.53 1.42Z" />
      <path d="m7 16.5-4.74-2.85M7 16.5l5-3M7 16.5v5.17" />
      <path d="M12 13.5V20l3.03 1.66a2 2 0 0 0 1.94 0l3-1.65A2 2 0 0 0 21 18.27v-3.24a2 2 0 0 0-.97-1.71L16.5 11.5l-4.5 2Z" />
      <path d="m17 16.5-5-3M17 16.5l4.74-2.85M17 16.5v5.17" />
      <path d="M7.5 4.27 9 5.15M12 2v6.5l3.03 1.66a2 2 0 0 0 1.94 0l3-1.65A2 2 0 0 0 21 6.77V3.53" />
      <path d="M12 8.5 7.26 5.65M12 8.5v-6" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </>
  ),
  chevronRight: <path d="m9 18 6-6-6-6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  arrowRight: (
    <>
      <path d="M5 12h14M12 5l7 7-7 7" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  mapPin: (
    <>
      <path d="M20 10c0 4.4-8 12-8 12s-8-7.6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  unlink: (
    <>
      <path d="M18.84 12.25l1.72-1.71a4.5 4.5 0 0 0-6.36-6.37l-1.72 1.72" />
      <path d="M5.17 11.75l-1.71 1.71a4.5 4.5 0 0 0 6.36 6.37l1.72-1.72" />
      <path d="M8 2v3M2 8h3M16 22v-3M22 16h-3" />
    </>
  ),
  seat: (
    <>
      <path d="M19 9V6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v3" />
      <path d="M5 9a2 2 0 0 1 2 2v3h10v-3a2 2 0 0 1 4 0v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  wallet: (
    <>
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M18 12a1 1 0 1 0 0 2h3v-2Z" />
    </>
  ),
  trend: (
    <>
      <path d="M22 7 13.5 15.5l-5-5L2 17" />
      <path d="M16 7h6v6" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  building: (
    <>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
    </>
  ),
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.4-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </>
  ),
  filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  settings: (
    <>
      <path d="M12.9 2a1 1 0 0 1 .95.7l.35 1.4a7.5 7.5 0 0 1 1.7.98l1.38-.46a1 1 0 0 1 1.18.46l.9 1.56a1 1 0 0 1-.23 1.25l-1.1.92a7.6 7.6 0 0 1 0 1.96l1.1.92a1 1 0 0 1 .23 1.25l-.9 1.56a1 1 0 0 1-1.18.46l-1.38-.46a7.5 7.5 0 0 1-1.7.98l-.35 1.4a1 1 0 0 1-.95.7h-1.8a1 1 0 0 1-.95-.7l-.35-1.4a7.5 7.5 0 0 1-1.7-.98l-1.38.46a1 1 0 0 1-1.18-.46l-.9-1.56a1 1 0 0 1 .23-1.25l1.1-.92a7.6 7.6 0 0 1 0-1.96l-1.1-.92a1 1 0 0 1-.23-1.25l.9-1.56a1 1 0 0 1 1.18-.46l1.38.46a7.5 7.5 0 0 1 1.7-.98l.35-1.4a1 1 0 0 1 .95-.7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  sparkle: (
    <path d="M12 3l1.9 4.9L19 9.8l-4.9 1.9L12 17l-1.9-5.3L5 9.8l5.1-1.9L12 3Z" />
  ),
  paperclip: (
    <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  ),
  shield: (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
  ),
  upload: (
    <>
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </>
  ),
}

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.75 }) {
  // Prefer the solid Zip B icon when one is mapped for this name.
  const solid = SOLID[name]
  if (solid) {
    return (
      <span
        aria-hidden="true"
        className={['inline-flex shrink-0 items-center justify-center leading-none', className].filter(Boolean).join(' ')}
        style={{ fontSize: size, width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: solid }}
      />
    )
  }
  const path = P[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path}
    </svg>
  )
}
