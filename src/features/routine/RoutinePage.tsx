import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowClockwise, CaretLeft, CaretRight, FileXls, Info, Printer, Sparkle, Table, Warning, WarningCircle } from '@phosphor-icons/react'
import { Badge, Button, EmptyState, IconButton, PageHeader, Segmented, Select, Shell, cx } from '../../components/ui'
import { className } from '../../engine/assign'
import { isAdjacent } from '../../engine/blocks'
import { teacherSlots } from '../../engine/evaluate'
import { hashInputs } from '../../engine/schedule'
import type { Id, Issue, Routine, SchoolData, Severity } from '../../engine/types'
import { useStore } from '../../store/store'
import { RoutineGrid, type GridCell } from './RoutineGrid'
import { useGenerator } from './useGenerator'
import { PrintSheet } from './PrintSheet'
import { exportRoutineToExcel } from './exportExcel'
import { logActivity } from '../../cloud/session'

type View = 'class' | 'teacher' | 'assign'

/** Keeps the view and selection in the URL (#routine?view=teacher&id=t-01) so it survives reloads and can be shared. */
function useRoutineParams() {
  const read = () => new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const [params, setParams] = useState(read)
  useEffect(() => {
    const on = () => setParams(read())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const update = (next: Record<string, string>) => {
    const p = new URLSearchParams(next)
    history.replaceState(null, '', `#routine?${p}`)
    setParams(p)
  }
  return [params, update] as const
}

export function RoutinePage() {
  const data = useStore((s) => s.data)
  const routine = useStore((s) => s.routine)
  const { generate, running, progress, error } = useGenerator()
  const [print, setPrint] = useState<'class' | 'teacher' | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const toExcel = async () => {
    if (!routine) return
    setExporting(true)
    setExportError(null)
    try {
      await exportRoutineToExcel(data, routine)
      void logActivity('export_excel', { lessons: routine.stats.lessons })
    } catch {
      setExportError('Could not create the Excel file. Try again, or use Print instead.')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (!print) return
    const done = () => setPrint(null)
    window.addEventListener('afterprint', done)
    void logActivity('print', { what: print })
    const t = window.setTimeout(() => window.print(), 50)
    return () => { window.clearTimeout(t); window.removeEventListener('afterprint', done) }
  }, [print])

  const missing = [
    data.subjects.length === 0 && { label: 'subjects', href: '#subjects' },
    data.teachers.length === 0 && { label: 'teachers', href: '#teachers' },
    data.classes.length === 0 && { label: 'classes', href: '#classes' },
  ].filter(Boolean) as { label: string; href: string }[]

  const stale = routine !== null && routine.inputHash !== hashInputs(data)

  const actions = missing.length === 0 && (
    <>
      {routine && !running && (
        <>
          <Button size="md" icon={<FileXls weight="light" />} disabled={exporting} onClick={toExcel}>{exporting ? 'Exporting…' : 'Export to Excel'}</Button>
          <Button size="md" icon={<Printer weight="light" />} onClick={() => setPrint('class')}>Print Classes</Button>
          <Button size="md" icon={<Printer weight="light" />} onClick={() => setPrint('teacher')}>Print Teachers</Button>
        </>
      )}
      <Button
        variant="primary"
        disabled={running}
        onClick={generate}
        trailingIcon={routine ? <ArrowClockwise weight="bold" /> : <Sparkle weight="fill" />}
      >
        {running ? 'Building…' : routine ? 'Generate Again' : 'Generate Routine'}
      </Button>
    </>
  )

  return (
    <>
      <div className="no-print">
        <PageHeader
          title="Routine"
          description="Built so no teacher is in two places at once, senior classes get skilled teachers, and teachers rest after a class wherever possible."
          actions={actions}
        />

        {running && <Progress value={progress} />}
        {exportError && (
          <p role="alert" className="mb-6 rounded-core bg-danger-soft px-4 py-3 text-sm text-danger">{exportError}</p>
        )}
        {error && (
          <p role="alert" className="mb-6 rounded-core bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
        )}

        {missing.length > 0 ? (
          <EmptyState
            icon={<Table weight="light" />}
            title="A few things are missing"
            action={<Button variant="primary" onClick={() => { window.location.hash = missing[0].href.slice(1) }}>Add {cap(missing[0].label)}</Button>}
          >
            Add {list(missing.map((m) => m.label))} before building a routine.
          </EmptyState>
        ) : !routine ? (
          !running && (
            <EmptyState
              icon={<Sparkle weight="light" />}
              title="Ready to build"
              action={<Button variant="primary" trailingIcon={<Sparkle weight="fill" />} onClick={generate}>Generate Routine</Button>}
            >
              {data.teachers.length} teachers and {data.classes.length} classes. Building takes a few seconds.
            </EmptyState>
          )
        ) : (
          <RoutineView data={data} routine={routine} stale={stale} onRegenerate={generate} running={running} />
        )}
      </div>
      {routine && print && <PrintSheet data={data} routine={routine} mode={print} />}
    </>
  )
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

function Progress({ value }: { value: number }) {
  return (
    <div className="mb-8" role="status" aria-live="polite">
      <div className="h-1 overflow-hidden rounded-full bg-shell">
        <div
          className="h-full origin-left rounded-full bg-accent transition-transform duration-300 ease-(--ease-out)"
          style={{ transform: `scaleX(${Math.max(0.04, value)})` }}
        />
      </div>
      <p className="mt-2 text-sm text-ink-2">Building the routine… trying different arrangements to give everyone a rest.</p>
    </div>
  )
}

/* ---------- Derived data ---------- */

function useDerived(data: SchoolData, routine: Routine) {
  return useMemo(() => {
    const P = data.settings.periodsPerDay
    const S = P * data.settings.dayNames.length
    const slots = teacherSlots(data, routine.grid)
    const noRest = new Map<Id, Set<number>>()
    const clash = new Map<Id, Set<number>>()
    for (const [tid, week] of slots) {
      const nr = new Set<number>()
      const cl = new Set<number>()
      for (let s = 0; s < S; s++) {
        if (week[s].length > 1) cl.add(s)
        const p = s % P
        if (week[s].length > 0 && isAdjacent(data.settings, p) && week[s + 1]?.length > 0) {
          nr.add(s)
          nr.add(s + 1)
        }
      }
      noRest.set(tid, nr)
      clash.set(tid, cl)
    }
    return { slots, noRest, clash }
  }, [data, routine])
}

/* ---------- Main view ---------- */

function RoutineView({ data, routine, stale, onRegenerate, running }: { data: SchoolData; routine: Routine; stale: boolean; onRegenerate: () => void; running: boolean }) {
  const [params, setParams] = useRoutineParams()
  const [highlight, setHighlight] = useState<{ day: number; period: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const { slots, noRest, clash } = useDerived(data, routine)

  const classes = useMemo(() => [...data.classes].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section)), [data.classes])
  const teachers = useMemo(() => [...data.teachers].sort((a, b) => a.name.localeCompare(b.name)), [data.teachers])
  const subjectById = useMemo(() => new Map(data.subjects.map((s) => [s.id, s])), [data.subjects])
  const teacherById = useMemo(() => new Map(data.teachers.map((t) => [t.id, t])), [data.teachers])
  const classById = useMemo(() => new Map(data.classes.map((c) => [c.id, c])), [data.classes])

  const view = (params.get('view') as View) || 'class'
  const list = view === 'teacher' ? teachers : classes
  const selectedId = list.some((x) => x.id === params.get('id')) ? params.get('id')! : list[0]?.id
  const select = (v: View, id?: string) => {
    setHighlight(null)
    setParams(id ? { view: v, id } : { view: v })
  }
  const step = (dir: 1 | -1) => {
    const i = list.findIndex((x) => x.id === selectedId)
    const next = list[(i + dir + list.length) % list.length]
    if (next) select(view, next.id)
  }

  const onIssue = (issue: Issue) => {
    if (issue.teacherId && (issue.kind === 'restMissed' || issue.kind === 'clash' || issue.kind === 'overDay')) select('teacher', issue.teacherId)
    else if (issue.classId) select('class', issue.classId)
    else if (issue.teacherId) select('teacher', issue.teacherId)
    setHighlight(issue.day !== undefined ? { day: issue.day, period: issue.period ?? 0 } : null)
    gridRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }

  const cells: (GridCell | null)[] = useMemo(() => {
    if (view === 'class') {
      const grid = routine.grid[selectedId] ?? []
      return grid.map((c, s) => {
        if (!c) return null
        const subj = subjectById.get(c.subjectId)
        const t = teacherById.get(c.teacherId)
        const nr = noRest.get(c.teacherId)?.has(s)
        return {
          key: `${s}`,
          color: subj?.color,
          title: subj?.name ?? 'Unknown subject',
          subtitle: t?.name ?? 'Unknown teacher',
          noRest: nr,
          clash: clash.get(c.teacherId)?.has(s),
          label: `${subj?.name}, ${t?.name}${nr ? `. ${t?.name} has no rest next to this period` : ''}`,
        }
      })
    }
    if (view === 'teacher') {
      const week = slots.get(selectedId) ?? []
      return week.map((here, s) => {
        if (here.length === 0) return null
        const first = here[0]
        const subj = subjectById.get(first.subjectId)
        const names = here.map((h) => className(classById.get(h.classId)!)).join(' + ')
        const nr = noRest.get(selectedId)?.has(s)
        return {
          key: `${s}`,
          color: subj?.color,
          title: `Class ${names}`,
          subtitle: subj?.name,
          noRest: nr,
          clash: here.length > 1,
          label: `Class ${names}, ${subj?.name}${nr ? '. No rest next to this period' : ''}`,
        }
      })
    }
    return []
  }, [view, selectedId, routine, slots, noRest, clash, subjectById, teacherById, classById])

  const selectedLabel = view === 'teacher' ? teacherById.get(selectedId)?.name : classById.get(selectedId) ? `Class ${className(classById.get(selectedId)!)}` : ''

  return (
    <div className="flex flex-col gap-6">
      {stale && (
        <div role="status" className="animate-rise flex flex-wrap items-center justify-between gap-3 rounded-core bg-warn-soft px-5 py-3.5 text-warn">
          <p className="flex items-center gap-2.5 text-sm font-medium"><Warning weight="light" className="text-lg" aria-hidden />Your data changed after this routine was built.</p>
          <Button size="sm" variant="secondary" disabled={running} onClick={onRegenerate}>Generate Again</Button>
        </div>
      )}

      <Stats routine={routine} />

      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-12">
        <Shell as="section" className="animate-rise [animation-delay:120ms] 2xl:col-span-8">
          <div ref={gridRef} className="scroll-mt-28 p-4 md:p-6">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Segmented<View>
                label="Show routine for"
                value={view}
                onChange={(v) => select(v)}
                options={[{ value: 'class', label: 'Classes' }, { value: 'teacher', label: 'Teachers' }, { value: 'assign', label: 'Who teaches what' }]}
              />
              {view !== 'assign' && (
                <div className="flex min-w-0 flex-1 items-center gap-1 sm:justify-end">
                  <IconButton label={`Previous ${view}`} onClick={() => step(-1)}><CaretLeft weight="light" /></IconButton>
                  <Select aria-label={view === 'teacher' ? 'Teacher' : 'Class'} className="min-w-0 flex-1 sm:w-60 sm:flex-none" value={selectedId} onChange={(e) => select(view, e.target.value)}>
                    {view === 'teacher'
                      ? teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)
                      : classes.map((c) => <option key={c.id} value={c.id}>Class {className(c)}</option>)}
                  </Select>
                  <IconButton label={`Next ${view}`} onClick={() => step(1)}><CaretRight weight="light" /></IconButton>
                </div>
              )}
            </div>

            {view === 'assign' ? (
              <AssignmentMatrix data={data} routine={routine} />
            ) : (
              <>
                <RoutineGrid settings={data.settings} cells={cells} highlight={highlight} caption={`Weekly routine for ${selectedLabel}`} />
                <Legend view={view} teacherId={view === 'teacher' ? selectedId : undefined} slots={slots} noRest={noRest} />
              </>
            )}
          </div>
        </Shell>

        <IssuesPanel issues={routine.issues} onIssue={onIssue} />
      </div>
    </div>
  )
}

function Legend({ view, teacherId, slots, noRest }: { view: View; teacherId?: Id; slots: Map<Id, { classId: Id }[][]>; noRest: Map<Id, Set<number>> }) {
  const teaching = teacherId ? (slots.get(teacherId) ?? []).reduce((n, s) => n + s.length, 0) : 0
  const pairs = teacherId ? Math.round((noRest.get(teacherId)?.size ?? 0) / 2) : 0
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[13px] text-ink-2">
      {view === 'teacher' && (
        <span><strong className="font-mono font-medium tabular-nums text-ink">{teaching}</strong> periods this week</span>
      )}
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="size-3 rounded-[4px] bg-warn-soft ring-1 ring-warn/40" />
        {view === 'teacher' ? `Back to back, no rest${pairs ? ` (${pairs})` : ''}` : 'Teacher has no rest next to this period'}
      </span>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="size-3 rounded-[4px] border border-dashed border-line-strong" />
        Free period
      </span>
    </div>
  )
}

/* ---------- Stats ---------- */

function Stats({ routine }: { routine: Routine }) {
  const { restGiven, restMissed, lessons, ms } = routine.stats
  const restRate = restGiven + restMissed === 0 ? 1 : restGiven / (restGiven + restMissed)
  const errors = routine.issues.filter((i) => i.severity === 'error').length
  const warnings = routine.issues.filter((i) => i.severity === 'warning' && i.kind !== 'restMissed').length
  const pct = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(restRate)
  const built = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(routine.generatedAt)
  const secs = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(ms / 1000)

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-12">
      <Shell className="animate-rise col-span-2 lg:col-span-5">
        <div className="flex h-full flex-col justify-between gap-3 p-5">
          <p className="text-sm font-medium text-ink-2">Rest after class</p>
          <div>
            <p className="font-mono text-4xl font-medium tracking-tight tabular-nums text-accent">{pct}</p>
            <p className="mt-2 text-sm text-ink-2">
              {restMissed === 0 ? 'Every teacher rests after every class.' : `${restMissed} ${restMissed === 1 ? 'time' : 'times'} a teacher goes straight into another class.`}
            </p>
          </div>
        </div>
      </Shell>
      <Shell className="animate-rise [animation-delay:40ms] lg:col-span-3">
        <div className="flex h-full flex-col justify-between gap-3 p-5">
          <p className="text-sm font-medium text-ink-2">Periods placed</p>
          <p className="font-mono text-3xl font-medium tabular-nums">{lessons}</p>
        </div>
      </Shell>
      <Shell className="animate-rise [animation-delay:80ms] lg:col-span-4">
        <div className="flex h-full flex-col justify-between gap-3 p-5">
          <p className="text-sm font-medium text-ink-2">Problems</p>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <p className={cx('font-mono text-3xl font-medium tabular-nums', errors > 0 ? 'text-danger' : 'text-ink')}>{errors}</p>
            <div className="flex flex-wrap gap-1.5">
              {errors === 0 && <Badge tone="accent">No clashes</Badge>}
              {warnings > 0 && <Badge tone="warn">{warnings} to check</Badge>}
            </div>
          </div>
          <p className="-mt-1 text-xs text-ink-3">Built at {built} in {secs} s</p>
        </div>
      </Shell>
    </div>
  )
}

/* ---------- Issues ---------- */

const SEVERITY: Record<Severity, { title: string; icon: React.ReactNode; tone: string }> = {
  error: { title: 'Problems', icon: <WarningCircle weight="light" />, tone: 'text-danger' },
  warning: { title: 'Worth checking', icon: <Warning weight="light" />, tone: 'text-warn' },
  info: { title: 'Notes', icon: <Info weight="light" />, tone: 'text-ink-3' },
}

function IssuesPanel({ issues, onIssue }: { issues: Issue[]; onIssue: (i: Issue) => void }) {
  const [expanded, setExpanded] = useState<Severity | null>(null)
  const groups = (['error', 'warning', 'info'] as Severity[])
    .map((sev) => ({ sev, items: issues.filter((i) => i.severity === sev) }))
    .filter((g) => g.items.length > 0)

  return (
    <Shell as="section" className="animate-rise [animation-delay:160ms] 2xl:col-span-4">
      <div className="p-5 md:p-6">
        <h2 className="text-lg font-semibold tracking-tight">Things to look at</h2>
        {groups.length === 0 ? (
          <p className="mt-3 text-[15px] text-ink-2">Nothing. Every rule is met.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-6">
            {groups.map(({ sev, items }) => {
              const meta = SEVERITY[sev]
              const shown = expanded === sev ? items : items.slice(0, 6)
              return (
                <div key={sev}>
                  <h3 className={cx('flex items-center gap-2 text-sm font-medium', meta.tone)}>
                    <span aria-hidden className="text-lg">{meta.icon}</span>
                    {meta.title}
                    <span className="font-mono text-xs tabular-nums text-ink-3">{items.length}</span>
                  </h3>
                  <ul className="mt-2 flex flex-col">
                    {shown.map((issue, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => onIssue(issue)}
                          className="w-full rounded-[10px] px-3 py-2 text-left text-sm leading-snug text-ink-2 transition-colors hover:bg-shell hover:text-ink"
                        >
                          {issue.message}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {items.length > 6 && (
                    <Button size="sm" variant="ghost" className="mt-1" onClick={() => setExpanded(expanded === sev ? null : sev)}>
                      {expanded === sev ? 'Show Fewer' : `Show All ${items.length}`}
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Shell>
  )
}

/* ---------- Who teaches what ---------- */

function AssignmentMatrix({ data, routine }: { data: SchoolData; routine: Routine }) {
  const classes = [...data.classes].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
  const used = data.subjects.filter((s) => routine.assignments.some((a) => a.subjectId === s.id))
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]))
  const lookup = new Map(routine.assignments.map((a) => [`${a.classId}:${a.subjectId}`, a]))

  return (
    <div className="-mx-1.5 overflow-x-auto px-1.5">
      <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm">
        <caption className="sr-only">Teacher chosen for each class and subject</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-[1] bg-surface text-left text-xs font-medium text-ink-3">Class</th>
            {used.map((s) => (
              <th key={s.id} scope="col" className="px-1 pb-1 text-center text-xs font-medium text-ink-2" title={s.name}>
                <span translate="no" className="font-mono">{s.code}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.id}>
              <th scope="row" className="sticky left-0 z-[1] bg-surface pr-2 text-left font-medium">{className(c)}</th>
              {used.map((s) => {
                const a = lookup.get(`${c.id}:${s.id}`)
                if (!a) return <td key={s.id} />
                const t = a.teacherId ? teacherById.get(a.teacherId) : null
                const tone = !t ? 'bg-danger-soft text-danger' : a.tier === 'none' ? 'bg-warn-soft text-warn' : a.tier === 'secondary' ? 'bg-shell text-ink-2' : 'bg-accent-soft text-accent'
                const tierText = !t ? 'no teacher' : a.tier === 'primary' ? 'main subject' : a.tier === 'secondary' ? 'extra subject' : 'outside listed skills'
                return (
                  <td key={s.id} className="p-0">
                    <div
                      title={`${s.name}: ${t?.name ?? 'No teacher'} (${tierText})${a.pinned ? ', pinned' : ''}`}
                      className={cx('flex h-9 items-center justify-center rounded-lg font-mono text-xs font-medium', tone, a.pinned && 'ring-1 ring-ink/30')}
                    >
                      <span className="sr-only">{s.name}: {t?.name ?? 'No teacher'}, {tierText}</span>
                      <span aria-hidden translate="no">{t?.code ?? '?'}</span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 px-1 text-[13px] text-ink-2">
        <span className="inline-flex items-center gap-2"><span aria-hidden className="size-3 rounded-[4px] bg-accent-soft" />Main subject</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="size-3 rounded-[4px] bg-shell ring-1 ring-line-strong" />Extra subject</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="size-3 rounded-[4px] bg-warn-soft" />Outside skills (junior only)</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden className="size-3 rounded-[4px] ring-1 ring-ink/30" />Pinned by you</span>
      </div>
    </div>
  )
}
