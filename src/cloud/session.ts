import { create } from 'zustand'
import { emptySchool } from '../engine/sample'
import type { Routine, SchoolData } from '../engine/types'
import { useStore } from '../store/store'
import { usernameToEmail, normalizeUsername } from './auth'
import { CLOUD_ENABLED, functionError, supabase } from './client'
import { changedSections } from './diff'

export interface Profile {
  id: string
  username: string
  display_name: string
  role: 'admin' | 'member'
  school_id: string | null
  disabled: boolean
}

export interface School {
  id: string
  name: string
}

export type Status = 'off' | 'loading' | 'unreachable' | 'setup' | 'signedOut' | 'noSchool' | 'loadingSchool' | 'ready'
export type SaveState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict'

interface SessionState {
  status: Status
  profile: Profile | null
  schools: School[]
  schoolId: string | null
  save: SaveState
  savedAt: number | null
  message: string | null
}

interface SessionActions {
  init: () => Promise<void>
  signIn: (username: string, password: string) => Promise<string | null>
  setupAdmin: (username: string, displayName: string, password: string) => Promise<string | null>
  signOut: (message?: string) => Promise<void>
  openSchool: (id: string | null) => Promise<void>
  refreshSchools: () => Promise<void>
  reloadLatest: () => Promise<void>
  /** Saves pending changes now instead of waiting for the autosave delay. */
  flush: () => Promise<void>
}

const initial: SessionState = {
  status: CLOUD_ENABLED ? 'loading' : 'off',
  profile: null,
  schools: [],
  schoolId: null,
  save: 'saved',
  savedAt: null,
  message: null,
}

const ADMIN_SCHOOL_KEY = 'routine-builder-admin-school'

// ---- Autosave state (module-level; one school open at a time) ----
let version = 0
let applying = false
let dirty = false
let saving = false
let timer: number | undefined
let lastSaved: { data: SchoolData; routineAt: number | null } | null = null
const SAVE_DELAY = 1200
const CONNECT_TIMEOUT = 12_000

/** Rejects if the server doesn't answer in time, so a dead connection shows an error instead of spinning. */
function withTimeout<T>(p: PromiseLike<T>, ms = CONNECT_TIMEOUT): Promise<T> {
  return Promise.race([Promise.resolve(p), new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])
}
let listening = false

export const useSession = create<SessionState & SessionActions>()((set, get) => {
  /** Writes the current school to the database if it changed. */
  async function saveNow(): Promise<void> {
    const { schoolId, profile, status } = get()
    if (!schoolId || !profile || status !== 'ready' || !dirty || saving) return
    if (get().save === 'conflict') return
    saving = true
    dirty = false
    set({ save: 'saving' })
    const { data, routine } = useStore.getState()
    try {
      const sb = await supabase()
      const { data: rows, error } = await sb
        .from('school_data')
        .update({ data, routine, version: version + 1, updated_at: new Date().toISOString(), updated_by: profile.id })
        .eq('school_id', schoolId)
        .eq('version', version)
        .select('version')
      if (error) throw error
      if (!rows || rows.length === 0) {
        set({ save: 'conflict' })
        return
      }
      version = rows[0].version
      const before = lastSaved
      lastSaved = { data, routineAt: routine?.generatedAt ?? null }
      set({ save: dirty ? 'pending' : 'saved', savedAt: Date.now() })

      // Activity log: what changed in this save.
      if (before) {
        const sections = changedSections(before.data, data)
        if (sections.length) {
          void logActivity('edit', { sections, subjects: data.subjects.length, teachers: data.teachers.length, classes: data.classes.length })
        }
        if (routine && routine.generatedAt !== before.routineAt) {
          void logActivity('generate', {
            lessons: routine.stats.lessons,
            restMissed: routine.stats.restMissed,
            problems: routine.issues.filter((i) => i.severity === 'error').length,
          })
        }
      }
    } catch {
      dirty = true
      set({ save: 'error' })
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void saveNow(), 5000)
      return
    } finally {
      saving = false
    }
    if (dirty) scheduleSave()
  }

  /** Puts a school's saved data into the editor without triggering a save. */
  function apply(data: SchoolData | null, routine: Routine | null) {
    const hasData = !!data && Array.isArray(data.subjects)
    const school = hasData ? data! : emptySchool()
    applying = true
    useStore.getState().loadCloud(school, routine, hasData && (school.subjects.length + school.teachers.length + school.classes.length) > 0)
    applying = false
    lastSaved = { data: useStore.getState().data, routineAt: routine?.generatedAt ?? null }
    dirty = false
  }

  function reset(message: string | null = null) {
    window.clearTimeout(timer)
    dirty = false
    version = 0
    lastSaved = null
    applying = true
    useStore.getState().loadCloud(emptySchool(), null, false)
    applying = false
    set({ ...initial, status: 'signedOut', message })
  }

  async function afterSignIn(userId: string) {
    const sb = await supabase()
    const { data: profile, error } = await sb.from('profiles').select('id, username, display_name, role, school_id, disabled').eq('id', userId).maybeSingle()
    if (error || !profile) {
      await sb.auth.signOut()
      reset('This account has no profile yet. Ask the admin to check it.')
      return
    }
    if (profile.disabled) {
      await sb.auth.signOut()
      reset('This account is disabled. Ask the admin to turn it back on.')
      return
    }
    set({ profile: profile as Profile })
    await get().refreshSchools()
    if (profile.role === 'admin') {
      const remembered = localStorage.getItem(ADMIN_SCHOOL_KEY)
      const schools = get().schools
      const pick = schools.find((s) => s.id === remembered)?.id ?? schools[0]?.id ?? null
      await get().openSchool(pick)
    } else if (!profile.school_id) {
      set({ status: 'noSchool' })
    } else {
      await get().openSchool(profile.school_id)
    }
  }

  return {
    ...initial,

    init: async () => {
      if (!CLOUD_ENABLED) return
      set({ status: 'loading' })
      try {
        const sb = await supabase()
        if (!listening) {
          listening = true
          sb.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT' && get().status !== 'signedOut' && get().status !== 'setup') reset()
          })
        }
        const { data } = await withTimeout(sb.auth.getSession())
        if (data.session) {
          await withTimeout(afterSignIn(data.session.user.id), CONNECT_TIMEOUT * 2)
          return
        }
        const { data: needs, error } = await withTimeout(sb.rpc('needs_setup'))
        if (error) throw error
        set({ status: needs ? 'setup' : 'signedOut' })
      } catch {
        set({ status: 'unreachable' })
      }
    },

    signIn: async (username, password) => {
      const sb = await supabase()
      let result
      try {
        result = await withTimeout(sb.auth.signInWithPassword({ email: usernameToEmail(username), password }))
      } catch {
        return 'Can’t reach the server. Check your internet connection and try again.'
      }
      const { data, error } = result
      if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) {
        return 'Can’t reach the server. Check your internet connection and try again.'
      }
      if (error || !data.user) {
        return error?.message?.toLowerCase().includes('banned')
          ? 'This account is disabled. Ask the admin to turn it back on.'
          : 'That user ID and password don’t match. Check them and try again.'
      }
      set({ message: null })
      await afterSignIn(data.user.id)
      void logActivity('login', {})
      return null
    },

    setupAdmin: async (username, displayName, password) => {
      const sb = await supabase()
      const { error } = await sb.functions.invoke('admin-users', {
        body: { action: 'bootstrap', username: normalizeUsername(username), displayName, password },
      })
      if (error) return functionError(error)
      return get().signIn(username, password)
    },

    signOut: async (message) => {
      window.clearTimeout(timer)
      await saveNow()
      await logActivity('logout', {})
      const sb = await supabase()
      reset(message ?? null)
      await sb.auth.signOut()
    },

    refreshSchools: async () => {
      const sb = await supabase()
      const { data } = await sb.from('schools').select('id, name').order('name')
      set({ schools: (data ?? []) as School[] })
    },

    openSchool: async (id) => {
      window.clearTimeout(timer)
      await saveNow()
      if (!id) {
        apply(null, null)
        set({ schoolId: null, status: 'ready', save: 'saved' })
        return
      }
      set({ status: 'loadingSchool', schoolId: id })
      const sb = await supabase()
      const { data, error } = await sb.from('school_data').select('data, routine, version, updated_at').eq('school_id', id).maybeSingle()
      if (error || !data) {
        set({ status: 'ready', schoolId: null, message: 'Could not open that school. Try again.' })
        return
      }
      version = data.version
      apply(data.data as SchoolData, (data.routine as Routine | null) ?? null)
      if (get().profile?.role === 'admin') localStorage.setItem(ADMIN_SCHOOL_KEY, id)
      set({ status: 'ready', save: 'saved', savedAt: Date.parse(data.updated_at), message: null })
    },

    flush: () => saveNow(),

    reloadLatest: async () => {
      dirty = false
      set({ save: 'saved' })
      await get().openSchool(get().schoolId)
    },
  }
})

/** Records an action in the admin activity log. Does nothing when offline mode is on. */
export async function logActivity(action: string, detail: Record<string, unknown>): Promise<void> {
  const { profile, schoolId } = useSession.getState()
  if (!CLOUD_ENABLED || !profile) return
  try {
    const sb = await supabase()
    await sb.from('activity_log').insert({ user_id: profile.id, school_id: schoolId, action, detail })
  } catch {
    // Logging must never block the user's work.
  }
}

/** Marks the school as changed and saves once editing pauses. */
function scheduleSave() {
  dirty = true
  const { save } = useSession.getState()
  if (save !== 'conflict') useSession.setState({ save: 'pending' })
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void useSession.getState().flush(), SAVE_DELAY)
}

// Autosave: any change to the school data or routine is saved shortly after editing stops.
if (CLOUD_ENABLED) {
  useStore.subscribe((s, prev) => {
    if (applying) return
    if (s.data === prev.data && s.routine === prev.routine) return
    const { status, schoolId } = useSession.getState()
    if (status === 'ready' && schoolId) scheduleSave()
  })

  window.addEventListener('beforeunload', (e) => {
    const save = useSession.getState().save
    if (save === 'pending' || save === 'saving' || save === 'error') e.preventDefault()
  })
}
