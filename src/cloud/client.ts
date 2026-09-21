import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Cloud mode turns on when the build has a Supabase project URL and public key
 * (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). Without them the app works fully
 * offline, saving to this browser only.
 */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''
export const CLOUD_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY)

let client: Promise<SupabaseClient> | null = null

/** Loaded on first use so the offline app doesn't download the Supabase library. */
export function supabase(): Promise<SupabaseClient> {
  if (!CLOUD_ENABLED) throw new Error('Cloud storage is not configured.')
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'routine-builder-auth' },
    }),
  )
  return client
}

/** Pulls the readable message out of a failed Edge Function call. */
export async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
    } catch { /* fall through */ }
  }
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
