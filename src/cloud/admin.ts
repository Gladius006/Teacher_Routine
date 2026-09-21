import { functionError, supabase } from './client'
import { normalizeUsername } from './auth'

export interface AdminUser {
  id: string
  username: string
  display_name: string
  role: 'admin' | 'member'
  school_id: string | null
  disabled: boolean
  /** Asked for an account and is waiting for approval. */
  pending: boolean
  created_at: string
  last_sign_in_at: string | null
}

export interface AdminSchool {
  id: string
  name: string
  created_at: string
  updated_at: string | null
  updated_by: string | null
}

export interface ActivityEntry {
  id: number
  at: string
  user_id: string | null
  school_id: string | null
  action: string
  detail: Record<string, unknown>
}

/** Throws an Error with a message fit to show the admin. */
async function call(body: Record<string, unknown>): Promise<void> {
  const sb = await supabase()
  const { error } = await sb.functions.invoke('admin-users', { body })
  if (error) throw new Error(await functionError(error))
}

export async function listUsers(): Promise<AdminUser[]> {
  const sb = await supabase()
  const { data, error } = await sb.rpc('admin_list_users')
  if (error) throw new Error(error.message)
  return (data ?? []) as AdminUser[]
}

export async function listSchools(): Promise<AdminSchool[]> {
  const sb = await supabase()
  const { data, error } = await sb.from('schools').select('id, name, created_at, school_data(updated_at, updated_by)').order('name')
  if (error) throw new Error(error.message)
  return (data ?? []).map((s) => {
    const sd = Array.isArray(s.school_data) ? s.school_data[0] : s.school_data
    return { id: s.id, name: s.name, created_at: s.created_at, updated_at: sd?.updated_at ?? null, updated_by: sd?.updated_by ?? null }
  })
}

export async function createSchool(name: string): Promise<string> {
  const sb = await supabase()
  const { data, error } = await sb.from('schools').insert({ name: name.trim() }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id
}

export async function renameSchool(id: string, name: string): Promise<void> {
  const sb = await supabase()
  const { error } = await sb.from('schools').update({ name: name.trim() }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteSchool(id: string): Promise<void> {
  const sb = await supabase()
  const { error } = await sb.from('schools').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export const createUser = (u: { username: string; displayName: string; password: string; role: 'admin' | 'member'; schoolId: string | null }) =>
  call({ action: 'create', ...u, username: normalizeUsername(u.username) })

export const resetPassword = (userId: string, password: string) => call({ action: 'reset_password', userId, password })

export const setDisabled = (userId: string, disabled: boolean) => call({ action: 'set_disabled', userId, disabled })

export const deleteUser = (userId: string) => call({ action: 'delete', userId })

export const approveUser = (userId: string) => call({ action: 'approve', userId })

export const rejectUser = (userId: string) => call({ action: 'reject', userId })

export async function updateUser(id: string, patch: { role?: 'admin' | 'member'; school_id?: string | null; display_name?: string }): Promise<void> {
  const sb = await supabase()
  const { error } = await sb.from('profiles').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listActivity(opts: { before?: string; userId?: string; schoolId?: string; action?: string; limit?: number }): Promise<ActivityEntry[]> {
  const sb = await supabase()
  let q = sb.from('activity_log').select('id, at, user_id, school_id, action, detail').order('at', { ascending: false }).limit(opts.limit ?? 50)
  if (opts.before) q = q.lt('at', opts.before)
  if (opts.userId) q = q.eq('user_id', opts.userId)
  if (opts.schoolId) q = q.eq('school_id', opts.schoolId)
  if (opts.action) q = q.eq('action', opts.action)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as ActivityEntry[]
}

/** Counts of log entries of one kind since a date, e.g. logins in the last 7 days. */
export async function countActivity(action: string, sinceIso: string): Promise<number> {
  const sb = await supabase()
  const { count } = await sb.from('activity_log').select('id', { count: 'exact', head: true }).eq('action', action).gte('at', sinceIso)
  return count ?? 0
}
