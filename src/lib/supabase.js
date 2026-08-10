import { createClient } from '@supabase/supabase-js'

// Reads config from Vite env vars. When absent, the app runs fully on its
// built-in in-memory store (no backend required) — see AppStore.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Enabled whenever keys are present (works in the single-file build too, when
// opened in a real browser with internet). Falls back to the in-memory seed
// store automatically if the network/Supabase is unreachable.
const enabled = Boolean(url && key)

export const supabase = enabled ? createClient(url, key) : null
export const hasSupabase = Boolean(supabase)
