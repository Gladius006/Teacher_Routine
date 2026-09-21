import { useEffect, useState, type ReactNode } from 'react'
import {
  BookOpenText, Buildings, ChalkboardTeacher, ChartBar, CheckCircle, CloudArrowUp, CloudSlash, Desktop, Moon,
  ShieldCheck, SignOut, Sun, Table, UsersThree, Warning,
} from '@phosphor-icons/react'
import { Button, cx } from './components/ui'
import { hashInputs } from './engine/schedule'
import { useStore, type ThemePref } from './store/store'
import { CLOUD_ENABLED } from './cloud/client'
import { useSession, type SaveState } from './cloud/session'
import { SchoolPage } from './features/school/SchoolPage'
import { SubjectsPage } from './features/subjects/SubjectsPage'
import { TeachersPage } from './features/teachers/TeachersPage'
import { ClassesPage } from './features/classes/ClassesPage'
import { RoutinePage } from './features/routine/RoutinePage'
import { WorkloadPage } from './features/workload/WorkloadPage'
import { AdminEmpty, AdminPage } from './features/admin/AdminPage'
import { LoadingScreen, LoginScreen, NoSchoolScreen, SetupScreen, UnreachableScreen } from './features/auth/AuthScreens'

export type Tab = 'school' | 'subjects' | 'teachers' | 'classes' | 'routine' | 'workload' | 'admin'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'school', label: 'School', icon: <Buildings weight="light" /> },
  { id: 'subjects', label: 'Subjects', icon: <BookOpenText weight="light" /> },
  { id: 'teachers', label: 'Teachers', icon: <ChalkboardTeacher weight="light" /> },
  { id: 'classes', label: 'Classes', icon: <UsersThree weight="light" /> },
  { id: 'routine', label: 'Routine', icon: <Table weight="light" /> },
  { id: 'workload', label: 'Workload', icon: <ChartBar weight="light" /> },
]
const ADMIN_TAB = { id: 'admin' as Tab, label: 'Admin', icon: <ShieldCheck weight="light" /> }

const readTab = (): Tab => {
  const h = window.location.hash.replace('#', '').split('?')[0] as Tab
  return [...TABS, ADMIN_TAB].some((t) => t.id === h) ? h : 'school'
}

function useTab(): Tab {
  const [tab, setTab] = useState<Tab>(readTab)
  useEffect(() => {
    const on = () => {
      setTab(readTab())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return tab
}

function useApplyTheme(pref: ThemePref) {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = pref === 'system' ? (mq.matches ? 'dark' : 'light') : pref
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [pref])
}

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const THEME_ICON: Record<ThemePref, ReactNode> = {
  system: <Desktop weight="light" />,
  light: <Sun weight="light" />,
  dark: <Moon weight="light" />,
}
const THEME_LABEL: Record<ThemePref, string> = { system: 'Theme: match device', light: 'Theme: light', dark: 'Theme: dark' }

export function App() {
  const theme = useStore((s) => s.theme)
  const status = useSession((s) => s.status)
  useApplyTheme(theme)

  useEffect(() => { void useSession.getState().init() }, [])

  if (status === 'loading') return <LoadingScreen />
  if (status === 'unreachable') return <UnreachableScreen />
  if (status === 'setup') return <SetupScreen />
  if (status === 'signedOut') return <LoginScreen />
  if (status === 'noSchool') return <NoSchoolScreen />
  return <Workspace />
}

function Workspace() {
  const tab = useTab()
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const data = useStore((s) => s.data)
  const routine = useStore((s) => s.routine)
  const status = useSession((s) => s.status)
  const profile = useSession((s) => s.profile)
  const schoolId = useSession((s) => s.schoolId)
  const isAdmin = profile?.role === 'admin'
  const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS
  const current: Tab = tab === 'admin' && !isAdmin ? 'school' : tab
  const noSchoolOpen = CLOUD_ENABLED && !schoolId

  const stale = routine !== null && routine.inputHash !== hashInputs(data)

  // Keep the current tab visible when the nav scrolls sideways on small screens.
  useEffect(() => {
    document.querySelector('nav a[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [current])

  useEffect(() => {
    document.title = `${tabs.find((t) => t.id === current)?.label ?? 'School'} · Routine Builder`
  }, [current, tabs])

  return (
    <div className="min-h-[100dvh]">
      <a href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-40 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift">
        Skip to content
      </a>

      <div className="no-print sticky top-3 z-30 px-3 md:top-5 md:px-6">
        <nav aria-label="Main" className="mx-auto flex max-w-[1400px] items-center gap-1 rounded-full bg-glass p-1.5 shadow-soft ring-1 ring-line backdrop-blur-xl">
          <a href="#school" className="flex shrink-0 items-center gap-2.5 rounded-full py-1 pl-1.5 pr-3" aria-label="Routine Builder home">
            <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-ink">
              <Table weight="bold" className="text-base" />
            </span>
            <span className="hidden text-[15px] font-semibold tracking-tight xl:inline">Routine Builder</span>
          </a>
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] md:justify-center">
            {tabs.map((t) => {
              const active = t.id === current
              return (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'relative flex h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-300 ease-(--ease-out)',
                    active ? 'bg-surface text-ink shadow-core' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  <span aria-hidden className="text-lg">{t.icon}</span>
                  {t.label}
                  {t.id === 'routine' && stale && (
                    <span className="size-1.5 rounded-full bg-warn" role="img" aria-label="(out of date)" />
                  )}
                </a>
              )
            })}
          </div>
          {CLOUD_ENABLED && <SaveIndicator />}
          <button
            type="button"
            onClick={() => setTheme(THEME_NEXT[theme])}
            aria-label={THEME_LABEL[theme]}
            title={THEME_LABEL[theme]}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl text-ink-2 transition-colors hover:bg-shell hover:text-ink"
          >
            {THEME_ICON[theme]}
          </button>
          {CLOUD_ENABLED && <AccountButton />}
        </nav>
        {CLOUD_ENABLED && <SchoolBar />}
      </div>

      <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 pb-24 outline-none md:px-8">
        {status === 'loadingSchool' ? (
          <LoadingScreen label="Opening school…" />
        ) : (
          <div key={`${current}:${schoolId ?? ''}`}>
            {current === 'admin' ? (
              <AdminPage />
            ) : noSchoolOpen ? (
              <div className="pt-16"><AdminEmpty /></div>
            ) : (
              <>
                {current === 'school' && <SchoolPage />}
                {current === 'subjects' && <SubjectsPage />}
                {current === 'teachers' && <TeachersPage />}
                {current === 'classes' && <ClassesPage />}
                {current === 'routine' && <RoutinePage />}
                {current === 'workload' && <WorkloadPage />}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

const SAVE_LABEL: Record<SaveState, { text: string; icon: ReactNode; tone: string }> = {
  saved: { text: 'Saved', icon: <CheckCircle weight="light" />, tone: 'text-ink-3' },
  pending: { text: 'Saving…', icon: <CloudArrowUp weight="light" />, tone: 'text-ink-3' },
  saving: { text: 'Saving…', icon: <CloudArrowUp weight="light" />, tone: 'text-ink-3' },
  error: { text: 'Offline, retrying', icon: <CloudSlash weight="light" />, tone: 'text-warn' },
  conflict: { text: 'Not saved', icon: <Warning weight="light" />, tone: 'text-danger' },
}

function SaveIndicator() {
  const save = useSession((s) => s.save)
  const schoolId = useSession((s) => s.schoolId)
  if (!schoolId) return null
  const l = SAVE_LABEL[save]
  return (
    <span role="status" aria-live="polite" className={cx('hidden shrink-0 items-center gap-1.5 px-2 text-[13px] lg:flex', l.tone)}>
      <span aria-hidden className="text-base">{l.icon}</span>
      {l.text}
    </span>
  )
}

function AccountButton() {
  const profile = useSession((s) => s.profile)
  const signOut = useSession((s) => s.signOut)
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      title={`Signed in as ${profile?.username ?? ''}. Sign out.`}
      aria-label={`Sign out ${profile?.display_name || profile?.username || ''}`}
      className="flex h-10 shrink-0 items-center gap-2 rounded-full pl-3 pr-3 text-sm text-ink-2 transition-colors hover:bg-shell hover:text-ink"
    >
      <span className="hidden max-w-32 truncate font-medium lg:inline">{profile?.display_name || profile?.username}</span>
      <SignOut aria-hidden weight="light" className="text-xl" />
    </button>
  )
}

/** Which school is open, a switcher for admins, and the save-conflict banner. */
function SchoolBar() {
  const profile = useSession((s) => s.profile)
  const schools = useSession((s) => s.schools)
  const schoolId = useSession((s) => s.schoolId)
  const save = useSession((s) => s.save)
  const openSchool = useSession((s) => s.openSchool)
  const reloadLatest = useSession((s) => s.reloadLatest)
  const isAdmin = profile?.role === 'admin'
  const name = schools.find((s) => s.id === schoolId)?.name

  return (
    <div className="mx-auto mt-2 flex max-w-[1400px] flex-col gap-2 px-2">
      {(isAdmin || name) && (
        <div className="flex items-center justify-end gap-2 text-[13px] text-ink-2">
          {isAdmin ? (
            <label className="flex items-center gap-2">
              <span>School</span>
              <select
                value={schoolId ?? ''}
                onChange={(e) => void openSchool(e.target.value || null)}
                className="h-8 max-w-56 truncate rounded-full bg-surface px-3 text-[13px] text-ink ring-1 ring-line-strong"
              >
                {schools.length === 0 && <option value="">No schools yet</option>}
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          ) : (
            <span>{name}</span>
          )}
        </div>
      )}
      {save === 'conflict' && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-core bg-danger-soft px-4 py-3 text-sm text-danger shadow-soft">
          <p className="flex items-center gap-2"><Warning aria-hidden weight="light" className="text-lg" />Someone else saved changes to this school while you were editing, so your latest change wasn’t saved.</p>
          <Button size="sm" variant="secondary" onClick={() => void reloadLatest()}>Load Their Version</Button>
        </div>
      )}
    </div>
  )
}
