// Account management for Routine Builder. Runs on Supabase with the service-role key,
// which never reaches the browser. Every call except `bootstrap` must come from an admin.
import { createClient } from 'npm:@supabase/supabase-js@2'

// Users sign in with a user ID; Supabase Auth needs an email, so each ID maps to one
// that is never mailed. Must match USER_EMAIL_DOMAIN in src/cloud/auth.ts.
const USER_EMAIL_DOMAIN = 'users.example.com'
const USERNAME = /^[a-z0-9._-]{3,32}$/

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

class Fail extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function cleanUsername(v: unknown): string {
  const u = String(v ?? '').trim().toLowerCase()
  if (!USERNAME.test(u)) throw new Fail('User ID must be 3 to 32 characters: letters, numbers, dot, dash or underscore.')
  return u
}

function cleanPassword(v: unknown): string {
  const p = String(v ?? '')
  if (p.length < 8) throw new Fail('Password must be at least 8 characters.')
  return p
}

async function log(userId: string | null, action: string, detail: Record<string, unknown>, schoolId: string | null = null) {
  await admin.from('activity_log').insert({ user_id: userId, school_id: schoolId, action, detail })
}

async function createAccount(opts: { username: string; password: string; displayName: string; role: 'admin' | 'member'; schoolId: string | null }) {
  const { data: existing } = await admin.from('profiles').select('id').eq('username', opts.username).maybeSingle()
  if (existing) throw new Fail(`The user ID "${opts.username}" is already taken.`)
  const { data, error } = await admin.auth.admin.createUser({
    email: `${opts.username}@${USER_EMAIL_DOMAIN}`,
    password: opts.password,
    email_confirm: true,
    user_metadata: { username: opts.username },
  })
  if (error || !data.user) throw new Fail(error?.message ?? 'Could not create the account.', 500)
  const { error: pErr } = await admin.from('profiles').insert({
    id: data.user.id, username: opts.username, display_name: opts.displayName, role: opts.role, school_id: opts.schoolId,
  })
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Fail(pErr.message, 500)
  }
  return data.user.id
}

async function requireAdmin(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) throw new Fail('Sign in first.', 401)
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new Fail('Your session has expired. Sign in again.', 401)
  const { data: profile } = await admin.from('profiles').select('role, disabled').eq('id', data.user.id).maybeSingle()
  if (!profile || profile.role !== 'admin' || profile.disabled) throw new Fail('Only an admin can do this.', 403)
  return data.user.id
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const action = String(body.action ?? '')

    // First run only: create the admin account when none exists yet.
    if (action === 'bootstrap') {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count ?? 0) > 0) throw new Fail('An admin account already exists. Sign in instead.', 409)
      const username = cleanUsername(body.username)
      const id = await createAccount({
        username, password: cleanPassword(body.password), displayName: String(body.displayName ?? '').trim().slice(0, 80) || username,
        role: 'admin', schoolId: null,
      })
      await log(id, 'admin_setup', { username })
      return json({ id })
    }

    const callerId = await requireAdmin(req)

    switch (action) {
      case 'create': {
        const username = cleanUsername(body.username)
        const role = body.role === 'admin' ? 'admin' : 'member'
        const schoolId = body.schoolId ? String(body.schoolId) : null
        const id = await createAccount({
          username, password: cleanPassword(body.password), displayName: String(body.displayName ?? '').trim().slice(0, 80), role, schoolId,
        })
        await log(callerId, 'user_create', { username, role }, schoolId)
        return json({ id })
      }
      case 'reset_password': {
        const userId = String(body.userId ?? '')
        const { error } = await admin.auth.admin.updateUserById(userId, { password: cleanPassword(body.password) })
        if (error) throw new Fail(error.message, 500)
        await log(callerId, 'password_reset', { target: userId })
        return json({ ok: true })
      }
      case 'set_disabled': {
        const userId = String(body.userId ?? '')
        const disabled = Boolean(body.disabled)
        if (userId === callerId) throw new Fail('You cannot disable your own account.')
        const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: disabled ? '876000h' : 'none' })
        if (error) throw new Fail(error.message, 500)
        await admin.from('profiles').update({ disabled }).eq('id', userId)
        await log(callerId, disabled ? 'user_disable' : 'user_enable', { target: userId })
        return json({ ok: true })
      }
      case 'delete': {
        const userId = String(body.userId ?? '')
        if (userId === callerId) throw new Fail('You cannot delete your own account.')
        const { data: p } = await admin.from('profiles').select('username').eq('id', userId).maybeSingle()
        const { error } = await admin.auth.admin.deleteUser(userId)
        if (error) throw new Fail(error.message, 500)
        await log(callerId, 'user_delete', { username: p?.username ?? null })
        return json({ ok: true })
      }
      default:
        throw new Fail(`Unknown action "${action}".`)
    }
  } catch (err) {
    const status = err instanceof Fail ? err.status : 500
    return json({ error: err instanceof Error ? err.message : 'Something went wrong.' }, status)
  }
})
