import a1 from '../assets/avatar-1.png'
import a2 from '../assets/avatar-2.png'
import a3 from '../assets/avatar-3.png'

// Illustrated avatars, assigned deterministically from a stable key (id/email/name).
export const AVATARS = [a1, a2, a3]
export const avatarFor = (key = '') =>
  AVATARS[[...String(key)].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATARS.length]
