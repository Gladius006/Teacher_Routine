import { functionError, supabase } from './client'
import { normalizeUsername } from './auth'

export interface PublicSchool {
  id: string
  name: string
}

/** School names for the request form. Works without signing in. */
export async function listPublicSchools(): Promise<PublicSchool[]> {
  const sb = await supabase()
  const { data, error } = await sb.rpc('public_school_list')
  if (error) throw new Error('Could not load the list of schools. Check your connection and try again.')
  return (data ?? []) as PublicSchool[]
}

/** Creates a locked account that the admin must approve. Returns an error message, or null on success. */
export async function requestAccount(r: { displayName: string; username: string; password: string; schoolId: string }): Promise<string | null> {
  const sb = await supabase()
  const { error } = await sb.functions.invoke('admin-users', {
    body: { action: 'signup', ...r, username: normalizeUsername(r.username), displayName: r.displayName.trim() },
  })
  return error ? functionError(error) : null
}
