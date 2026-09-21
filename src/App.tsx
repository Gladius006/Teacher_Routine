import { useEffect, useState, type ReactNode } from 'react'
import { BookOpenText, Buildings, ChalkboardTeacher, ChartBar, Desktop, Moon, Sun, Table, UsersThree } from '@phosphor-icons/react'
import { cx } from './components/ui'
import { hashInputs } from './engine/schedule'
import { useStore, type ThemePref } from './store/store'
import { SchoolPage } from './features/school/SchoolPage'
import { SubjectsPage } from './features/subjects/SubjectsPage'
import { TeachersPage } from './features/teachers/TeachersPage'
import { ClassesPage } from './features/classes/ClassesPage'
import { RoutinePage } from './features/routine/RoutinePage'
import { WorkloadPage } from './features/workload/WorkloadPage'

export type Tab = 'school' | 'subjects' | 'teachers' | 'classes' | 'routine' | 'workload'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'school', label: 'School', icon: <Buildings weight="light" /> },
  { id: 'subjects', label: 'Subjects', icon: <BookOpenText weight="light" /> },
  { id: 'teachers', label: 'Teachers', icon: <ChalkboardTeacher weight="light" /> },
  { id: 'classes', label: 'Classes', icon: <UsersThree weight="light" /> },
  { id: 'routine', label: 'Routine', icon: <Table weight="light" /> },
  { id: 'workload', label: 'Workload', icon: <ChartBar weight="light" /> },
]

const readTab = (): Tab => {
  const h = window.location.hash.replace('#', '').split('?')[0] as Tab
  return TABS.some((t) => t.id === h) ? h : 'school'
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
  const tab = useTab()
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const data = useStore((s) => s.data)
  const routine = useStore((s) => s.routine)
  useApplyTheme(theme)

  const stale = routine !== null && routine.inputHash !== hashInputs(data)

  // Keep the current tab visible when the nav scrolls sideways on small screens.
  useEffect(() => {
    document.querySelector('nav a[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [tab])

  useEffect(() => {
    document.title = `${TABS.find((t) => t.id === tab)!.label} · Routine Builder`
  }, [tab])

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
            <span className="hidden text-[15px] font-semibold tracking-tight lg:inline">Routine Builder</span>
          </a>
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] md:justify-center">
            {TABS.map((t) => {
              const active = t.id === tab
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
          <button
            type="button"
            onClick={() => setTheme(THEME_NEXT[theme])}
            aria-label={THEME_LABEL[theme]}
            title={THEME_LABEL[theme]}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl text-ink-2 transition-colors hover:bg-shell hover:text-ink"
          >
            {THEME_ICON[theme]}
          </button>
        </nav>
      </div>

      <main id="main" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 pb-24 outline-none md:px-8">
        <div key={tab}>
          {tab === 'school' && <SchoolPage />}
          {tab === 'subjects' && <SubjectsPage />}
          {tab === 'teachers' && <TeachersPage />}
          {tab === 'classes' && <ClassesPage />}
          {tab === 'routine' && <RoutinePage />}
          {tab === 'workload' && <WorkloadPage />}
        </div>
      </main>
    </div>
  )
}
