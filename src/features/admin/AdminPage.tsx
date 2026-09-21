import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowSquareOut, Buildings, Check, Key, PencilSimple, Plus, Prohibit, Trash, UserPlus, Users } from '@phosphor-icons/react'
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader, Select, Shell, cx } from '../../components/ui'
import {
  approveUser, countActivity, createSchool, createUser, deleteSchool, deleteUser, listActivity, listSchools, listUsers,
  rejectUser, renameSchool, resetPassword, setDisabled, updateUser,
  type ActivityEntry, type AdminSchool, type AdminUser,
} from '../../cloud/admin'
import { passwordError, usernameError } from '../../cloud/auth'
import { logActivity, useSession } from '../../cloud/session'

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const dtf = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function ago(iso: string | null): string {
  if (!iso) return 'Never'
  const s = (Date.parse(iso) - Date.now()) / 1000
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']]
  let v = s
  for (const [n, unit] of steps) {
    if (Math.abs(v) < n) return rtf.format(Math.round(v), unit)
    v /= n
  }
  return dtf.format(Date.parse(iso))
}

const SECTION_NAMES: Record<string, string> = { settings: 'bell schedule', subjects: 'subjects', teachers: 'teachers', classes: 'classes' }

/** Plain-language line for an activity log entry. */
function describe(e: ActivityEntry, userName: (id: string) => string): string {
  const d = e.detail as Record<string, unknown>
  switch (e.action) {
    case 'login': return 'Signed in'
    case 'logout': return 'Signed out'
    case 'edit': {
      const s = (d.sections as string[] | undefined)?.map((x) => SECTION_NAMES[x] ?? x) ?? []
      return s.length ? `Edited ${s.join(', ')}` : 'Edited school data'
    }
    case 'generate': return `Generated a routine (${d.lessons ?? '?'} periods, ${d.problems ?? 0} problems)`
    case 'export_excel': return 'Exported the routine to Excel'
    case 'print': return 'Printed the routine'
    case 'import_backup': return 'Opened a backup file'
    case 'download_backup': return 'Downloaded a backup file'
    case 'load_sample': return 'Loaded the sample school'
    case 'clear': return 'Cleared all school data'
    case 'admin_setup': return 'Set up the admin account'
    case 'user_create': return `Created user ${d.username ?? ''}${d.role === 'admin' ? ' (admin)' : ''}`
    case 'user_update': return `Changed ${d.username ?? 'a user'}: ${d.change ?? ''}`
    case 'password_reset': return `Reset the password for ${userName(String(d.target ?? ''))}`
    case 'user_disable': return `Disabled ${userName(String(d.target ?? ''))}`
    case 'user_enable': return `Turned on ${userName(String(d.target ?? ''))}`
    case 'user_delete': return `Deleted user ${d.username ?? ''}`
    case 'school_create': return `Created school ${d.name ?? ''}`
    case 'school_rename': return `Renamed a school to ${d.name ?? ''}`
    case 'school_delete': return `Deleted school ${d.name ?? ''}`
    case 'signup_request': return `Asked for an account as ${d.username ?? ''}`
    case 'user_approve': return `Approved ${d.username ?? 'an account request'}`
    case 'user_reject': return `Turned down the request from ${d.username ?? 'someone'}`
    default: return e.action.replace(/_/g, ' ')
  }
}

const ACTION_FILTERS = [
  { value: '', label: 'All actions' },
  { value: 'login', label: 'Sign-ins' },
  { value: 'edit', label: 'Edits' },
  { value: 'generate', label: 'Routines generated' },
  { value: 'export_excel', label: 'Excel exports' },
  { value: 'user_create', label: 'Users created' },
  { value: 'signup_request', label: 'Account requests' },
]

export function AdminPage() {
  const me = useSession((s) => s.profile)
  const openSchool = useSession((s) => s.openSchool)
  const refreshSessionSchools = useSession((s) => s.refreshSchools)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [schools, setSchools] = useState<AdminSchool[]>([])
  const [stats, setStats] = useState({ logins: 0, edits: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<
    | { kind: 'user' }
    | { kind: 'school'; school?: AdminSchool }
    | { kind: 'password'; user: AdminUser }
    | { kind: 'deleteUser'; user: AdminUser }
    | { kind: 'deleteSchool'; school: AdminSchool }
    | null
  >(null)
  const [activityKey, setActivityKey] = useState(0)

  const load = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 7 * 86400_000).toISOString()
      const [u, s, logins, edits] = await Promise.all([listUsers(), listSchools(), countActivity('login', since), countActivity('edit', since)])
      setUsers(u)
      setSchools(s)
      setStats({ logins, edits })
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const run = async (fn: () => Promise<void>, done?: string) => {
    try {
      await fn()
      if (done) setNotice(done)
      await load()
      await refreshSessionSchools()
      setActivityKey((k) => k + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.')
    }
  }

  const userName = (id: string) => users.find((u) => u.id === id)?.username ?? 'a user'
  const schoolName = (id: string | null) => (id ? schools.find((s) => s.id === id)?.name ?? 'Deleted school' : 'No school')
  const pending = users.filter((u) => u.pending)
  const accounts = users.filter((u) => !u.pending)
  const usersIn = (schoolId: string) => accounts.filter((u) => u.school_id === schoolId).length
  const active = accounts.filter((u) => !u.disabled).length

  return (
    <>
      <PageHeader
        title="Admin"
        description="Schools, user accounts and everything people have done. Only admins can see this page."
        actions={
          <>
            <Button icon={<Buildings weight="light" />} onClick={() => setDialog({ kind: 'school' })}>Add School</Button>
            <Button variant="primary" icon={<UserPlus weight="light" />} onClick={() => setDialog({ kind: 'user' })}>Add User</Button>
          </>
        }
      />

      <div aria-live="polite">
        {error && <p role="alert" className="mb-6 rounded-core bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
        {notice && !error && <p className="mb-6 rounded-core bg-accent-soft px-4 py-3 text-sm text-accent">{notice}</p>}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Users" value={loading ? '…' : `${accounts.length}`} note={loading ? '' : `${active} active${pending.length ? `, ${pending.length} waiting` : ''}`} />
        <Tile label="Schools" value={loading ? '…' : `${schools.length}`} note="" />
        <Tile label="Sign-ins" value={loading ? '…' : `${stats.logins}`} note="last 7 days" />
        <Tile label="Edits saved" value={loading ? '…' : `${stats.edits}`} note="last 7 days" />
      </div>

      {pending.length > 0 && (
        <Shell as="section" className="animate-rise mb-6">
          <div className="p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold tracking-tight">Waiting for approval</h2>
              <Badge tone="warn">{pending.length}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-2">These people asked for an account. Check the school is right, then approve or turn them down.</p>
            <ul className="mt-4 divide-y divide-line">
              {pending.map((u) => (
                <li key={u.id} className="grid grid-cols-1 items-center gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.display_name || u.username}</p>
                    <p className="font-mono text-xs text-ink-3">{u.username}<span className="font-sans">. Asked {ago(u.created_at)}.</span></p>
                  </div>
                  <Select
                    aria-label={`School for ${u.username}`}
                    value={u.school_id ?? ''}
                    onChange={(e) => {
                      const school_id = e.target.value || null
                      void run(() => updateUser(u.id, { school_id }))
                    }}
                  >
                    <option value="">No school</option>
                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" icon={<Check weight="bold" />} onClick={() => void run(() => approveUser(u.id), `${u.username} can now sign in.`)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void run(() => rejectUser(u.id), `Turned down the request from ${u.username}.`)}>
                      Turn Down
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Shell>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Schools */}
        <Shell as="section" className="animate-rise xl:col-span-5">
          <div className="p-5 md:p-6">
            <h2 className="text-lg font-semibold tracking-tight">Schools</h2>
            {!loading && schools.length === 0 ? (
              <div className="mt-4 rounded-core bg-shell/70 px-4 py-8 text-center">
                <p className="text-[15px] text-ink-2">No schools yet. Add one, then add users to it.</p>
                <Button className="mt-4" size="sm" icon={<Plus weight="bold" />} onClick={() => setDialog({ kind: 'school' })}>Add School</Button>
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {schools.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name}</p>
                      <p className="text-[13px] text-ink-3">
                        {usersIn(s.id)} {usersIn(s.id) === 1 ? 'user' : 'users'}. Last change {ago(s.updated_at)}{s.updated_by ? ` by ${userName(s.updated_by)}` : ''}.
                      </p>
                    </div>
                    <IconButton label={`Open ${s.name}`} onClick={() => { void openSchool(s.id).then(() => { window.location.hash = 'school' }) }}><ArrowSquareOut weight="light" /></IconButton>
                    <IconButton label={`Rename ${s.name}`} onClick={() => setDialog({ kind: 'school', school: s })}><PencilSimple weight="light" /></IconButton>
                    <IconButton label={`Delete ${s.name}`} className="hover:text-danger" onClick={() => setDialog({ kind: 'deleteSchool', school: s })}><Trash weight="light" /></IconButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Shell>

        {/* Users */}
        <Shell as="section" className="animate-rise [animation-delay:60ms] xl:col-span-7">
          <div className="p-5 md:p-6">
            <h2 className="text-lg font-semibold tracking-tight">Users</h2>
            {loading ? (
              <p className="mt-3 text-sm text-ink-2">Loading…</p>
            ) : (
              <div className="-mx-1.5 mt-3 overflow-x-auto px-1.5">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <caption className="sr-only">User accounts</caption>
                  <thead>
                    <tr className="text-xs font-medium text-ink-3">
                      <th scope="col" className="pb-2 font-medium">User</th>
                      <th scope="col" className="pb-2 font-medium">School</th>
                      <th scope="col" className="pb-2 font-medium">Role</th>
                      <th scope="col" className="pb-2 font-medium">Last sign-in</th>
                      <th scope="col" className="pb-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {accounts.map((u) => {
                      const self = u.id === me?.id
                      return (
                        <tr key={u.id} className={cx(u.disabled && 'opacity-60')}>
                          <th scope="row" className="py-2.5 pr-3 font-normal">
                            <span className="block font-medium">{u.display_name || u.username}</span>
                            <span className="flex items-center gap-2 font-mono text-xs text-ink-3">
                              {u.username}
                              {u.disabled && <Badge tone="danger">Disabled</Badge>}
                              {self && <Badge>You</Badge>}
                            </span>
                          </th>
                          <td className="py-2.5 pr-3">
                            <Select
                              aria-label={`School for ${u.username}`}
                              className="w-44"
                              value={u.school_id ?? ''}
                              onChange={(e) => {
                                const school_id = e.target.value || null
                                void run(async () => {
                                  await updateUser(u.id, { school_id })
                                  void logActivity('user_update', { username: u.username, change: `school set to ${schoolName(school_id)}` })
                                })
                              }}
                            >
                              <option value="">No school</option>
                              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </Select>
                          </td>
                          <td className="py-2.5 pr-3">
                            <Select
                              aria-label={`Role for ${u.username}`}
                              className="w-32"
                              value={u.role}
                              disabled={self}
                              onChange={(e) => {
                                const role = e.target.value as 'admin' | 'member'
                                void run(async () => {
                                  await updateUser(u.id, { role })
                                  void logActivity('user_update', { username: u.username, change: `role set to ${role}` })
                                })
                              }}
                            >
                              <option value="member">Teacher</option>
                              <option value="admin">Admin</option>
                            </Select>
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-3 text-ink-2" title={u.last_sign_in_at ? dtf.format(Date.parse(u.last_sign_in_at)) : undefined}>
                            {ago(u.last_sign_in_at)}
                          </td>
                          <td className="py-2.5">
                            <div className="flex justify-end">
                              <IconButton label={`Reset password for ${u.username}`} onClick={() => setDialog({ kind: 'password', user: u })}><Key weight="light" /></IconButton>
                              <IconButton
                                label={u.disabled ? `Turn on ${u.username}` : `Disable ${u.username}`}
                                disabled={self}
                                className={cx(!u.disabled && 'hover:text-warn')}
                                onClick={() => void run(() => setDisabled(u.id, !u.disabled), u.disabled ? `${u.username} can sign in again.` : `${u.username} can no longer sign in.`)}
                              >
                                <Prohibit weight="light" />
                              </IconButton>
                              <IconButton label={`Delete ${u.username}`} disabled={self} className="hover:text-danger" onClick={() => setDialog({ kind: 'deleteUser', user: u })}><Trash weight="light" /></IconButton>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Shell>

        <ActivityPanel key={activityKey} users={users} schools={schools} userName={userName} schoolName={schoolName} />
      </div>

      {/* Dialogs */}
      <UserDialog
        open={dialog?.kind === 'user'}
        schools={schools}
        onClose={() => setDialog(null)}
        onCreate={(u) => run(() => createUser(u), `Created ${u.username}. Give them their user ID and password.`)}
      />
      <SchoolDialog
        open={dialog?.kind === 'school'}
        school={dialog?.kind === 'school' ? dialog.school : undefined}
        onClose={() => setDialog(null)}
        onSave={(name, school) =>
          run(async () => {
            if (school) {
              await renameSchool(school.id, name)
              void logActivity('school_rename', { name })
            } else {
              await createSchool(name)
              void logActivity('school_create', { name })
            }
          }, school ? 'School renamed.' : `Created ${name}. Now add users to it.`)
        }
      />
      <PasswordDialog
        user={dialog?.kind === 'password' ? dialog.user : null}
        onClose={() => setDialog(null)}
        onSave={(u, password) => run(() => resetPassword(u.id, password), `New password set for ${u.username}.`)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'deleteUser'}
        onClose={() => setDialog(null)}
        onConfirm={() => dialog?.kind === 'deleteUser' && void run(() => deleteUser(dialog.user.id), `Deleted ${dialog.user.username}.`)}
        title={`Delete ${dialog?.kind === 'deleteUser' ? dialog.user.username : 'user'}?`}
        confirmLabel="Delete User"
      >
        They can no longer sign in, and the user ID becomes free again. Their past activity stays in the log. To stop someone temporarily, disable them instead.
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog?.kind === 'deleteSchool'}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind !== 'deleteSchool') return
          const { school } = dialog
          void run(async () => {
            await deleteSchool(school.id)
            void logActivity('school_delete', { name: school.name })
            if (useSession.getState().schoolId === school.id) await openSchool(null)
          }, `Deleted ${school.name}.`)
        }}
        title={`Delete ${dialog?.kind === 'deleteSchool' ? dialog.school.name : 'school'}?`}
        confirmLabel="Delete School"
      >
        Its teachers, classes and routine are deleted for good. Users in this school stay, but with no school until you assign one. Download a backup from the School page first if you might need it.
      </ConfirmDialog>
    </>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Shell className="animate-rise">
      <div className="flex h-full flex-col justify-between gap-4 p-5">
        <p className="text-sm font-medium text-ink-2">{label}</p>
        <div>
          <p className="font-mono text-3xl font-medium tabular-nums">{value}</p>
          <p className="mt-1 min-h-5 text-[13px] text-ink-3">{note}</p>
        </div>
      </div>
    </Shell>
  )
}

function ActivityPanel({ users, schools, userName, schoolName }: {
  users: AdminUser[]
  schools: AdminSchool[]
  userName: (id: string) => string
  schoolName: (id: string | null) => string
}) {
  const [filters, setFilters] = useState({ userId: '', schoolId: '', action: '' })
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(true)
  const PAGE = 50

  const fetchPage = useCallback(async (before?: string) => {
    setBusy(true)
    try {
      const page = await listActivity({ before, limit: PAGE, userId: filters.userId || undefined, schoolId: filters.schoolId || undefined, action: filters.action || undefined })
      setEntries((prev) => (before ? [...prev, ...page] : page))
      setMore(page.length === PAGE)
    } finally {
      setBusy(false)
    }
  }, [filters])

  useEffect(() => { void fetchPage() }, [fetchPage])

  const nameOf = useMemo(() => new Map(users.map((u) => [u.id, u.display_name || u.username])), [users])

  return (
    <Shell as="section" className="animate-rise [animation-delay:120ms] xl:col-span-12">
      <div className="p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
          <div className="flex flex-wrap gap-2">
            <Select aria-label="Filter by user" className="w-44" value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))}>
              <option value="">All users</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.display_name || u.username}</option>)}
            </Select>
            <Select aria-label="Filter by school" className="w-44" value={filters.schoolId} onChange={(e) => setFilters((f) => ({ ...f, schoolId: e.target.value }))}>
              <option value="">All schools</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select aria-label="Filter by action" className="w-48" value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}>
              {ACTION_FILTERS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </Select>
          </div>
        </div>

        {entries.length === 0 && !busy ? (
          <p className="mt-6 rounded-core bg-shell/70 px-4 py-8 text-center text-[15px] text-ink-2">Nothing matches these filters yet.</p>
        ) : (
          <div className="-mx-1.5 mt-4 overflow-x-auto px-1.5">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Activity log, newest first</caption>
              <thead>
                <tr className="text-xs font-medium text-ink-3">
                  <th scope="col" className="w-44 pb-2 font-medium">When</th>
                  <th scope="col" className="w-44 pb-2 font-medium">Who</th>
                  <th scope="col" className="w-44 pb-2 font-medium">School</th>
                  <th scope="col" className="pb-2 font-medium">What</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap py-2 pr-3 text-ink-2" title={dtf.format(Date.parse(e.at))}>{ago(e.at)}</td>
                    <td className="truncate py-2 pr-3">{e.user_id ? nameOf.get(e.user_id) ?? 'Deleted user' : 'System'}</td>
                    <td className="truncate py-2 pr-3 text-ink-2">{e.school_id ? schoolName(e.school_id) : ''}</td>
                    <td className="py-2">{describe(e, userName)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {more && (
          <Button size="sm" variant="ghost" className="mt-3" disabled={busy} onClick={() => void fetchPage(entries[entries.length - 1]?.at)}>
            {busy ? 'Loading…' : 'Show Older'}
          </Button>
        )}
      </div>
    </Shell>
  )
}

function UserDialog({ open, schools, onClose, onCreate }: {
  open: boolean
  schools: AdminSchool[]
  onClose: () => void
  onCreate: (u: { username: string; displayName: string; password: string; role: 'admin' | 'member'; schoolId: string | null }) => Promise<void>
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Add user" description="Share the user ID and password with them in person. They can’t sign up on their own.">
      {open && <UserForm schools={schools} onDone={onClose} onCreate={onCreate} />}
    </Dialog>
  )
}

function UserForm({ schools, onDone, onCreate }: { schools: AdminSchool[]; onDone: () => void; onCreate: Parameters<typeof UserDialog>[0]['onCreate'] }) {
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? '')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const uErr = usernameError(username)
  const pErr = passwordError(password)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (uErr || pErr) {
      document.getElementById(uErr ? 'new-user-id' : 'new-user-pass')?.focus()
      return
    }
    setBusy(true)
    await onCreate({ username, displayName: displayName.trim(), password, role, schoolId: schoolId || null })
    setBusy(false)
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Field label="Name" htmlFor="new-user-name">
        <Input id="new-user-name" name="display-name" placeholder="e.g. Ananya Sen…" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field label="User ID" htmlFor="new-user-id" hint="Letters, numbers, dots, dashes, underscores." error={tried ? uErr : undefined}>
          <Input id="new-user-id" name="new-username" spellCheck={false} autoCapitalize="none" placeholder="ananya.sen" aria-invalid={tried && !!uErr} value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="new-user-pass" hint="At least 8 characters." error={tried ? pErr : undefined}>
          <Input id="new-user-pass" name="new-password" type="text" autoComplete="new-password" spellCheck={false} aria-invalid={tried && !!pErr} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field label="School" htmlFor="new-user-school" hint={schools.length === 0 ? 'Add a school first to link this user to it.' : undefined}>
          <Select id="new-user-school" value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
            <option value="">No school yet</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Role" htmlFor="new-user-role" hint={role === 'admin' ? 'Admins see every school and this dashboard.' : 'Teachers see and edit their own school only.'}>
          <Select id="new-user-role" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}>
            <option value="member">Teacher</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
      </div>
      <div className="-mx-6 -mb-4 flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create User'}</Button>
      </div>
    </form>
  )
}

function SchoolDialog({ open, school, onClose, onSave }: { open: boolean; school?: AdminSchool; onClose: () => void; onSave: (name: string, school?: AdminSchool) => Promise<void> }) {
  const [name, setName] = useState('')
  const [tried, setTried] = useState(false)
  useEffect(() => { if (open) { setName(school?.name ?? ''); setTried(false) } }, [open, school])
  const err = !name.trim() ? 'Enter the school’s name.' : undefined
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={school ? 'Rename school' : 'Add school'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="school-form">{school ? 'Save Name' : 'Add School'}</Button>
        </>
      }
    >
      <form
        id="school-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (err) return
          void onSave(name.trim(), school)
          onClose()
        }}
      >
        <Field label="School name" htmlFor="school-name" error={tried ? err : undefined}>
          <Input id="school-name" name="school-name" placeholder="e.g. Sunrise High School…" aria-invalid={tried && !!err} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  )
}

function PasswordDialog({ user, onClose, onSave }: { user: AdminUser | null; onClose: () => void; onSave: (u: AdminUser, password: string) => Promise<void> }) {
  const [password, setPassword] = useState('')
  const [tried, setTried] = useState(false)
  useEffect(() => { setPassword(''); setTried(false) }, [user])
  const err = passwordError(password)
  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      title={`New password for ${user?.username ?? ''}`}
      description="They sign in with this from now on. Tell them in person."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="password-form">Set Password</Button>
        </>
      }
    >
      <form
        id="password-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (err || !user) return
          void onSave(user, password)
          onClose()
        }}
      >
        <Field label="New password" htmlFor="reset-pass" hint="At least 8 characters." error={tried ? err : undefined}>
          <Input id="reset-pass" name="new-password" type="text" autoComplete="new-password" spellCheck={false} aria-invalid={tried && !!err} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  )
}

export function AdminEmpty() {
  return (
    <EmptyState icon={<Users weight="light" />} title="Pick a school to work on">
      Open a school from the Admin page, or add your first school there.
    </EmptyState>
  )
}
