import { useMemo, useState } from 'react'
import { ChalkboardTeacher, MagnifyingGlass, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Button, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader, Shell, Stepper, Swatch, ToggleChip } from '../../components/ui'
import type { Subject, Teacher } from '../../engine/types'
import { uid, useStore } from '../../store/store'

const initials = (name: string) =>
  name.trim().split(/\s+/).map((w) => w[0] ?? '').join('').slice(0, 3).toUpperCase()

export function TeachersPage() {
  const teachers = useStore((s) => s.data.teachers)
  const subjects = useStore((s) => s.data.subjects)
  const classes = useStore((s) => s.data.classes)
  const routine = useStore((s) => s.routine)
  const removeTeacher = useStore((s) => s.removeTeacher)
  const [editing, setEditing] = useState<Teacher | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Teacher | null>(null)
  const [query, setQuery] = useState('')

  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const weekly = useMemo(() => {
    const m = new Map<string, number>()
    if (!routine) return m
    for (const cells of Object.values(routine.grid)) for (const c of cells) if (c) m.set(c.teacherId, (m.get(c.teacherId) ?? 0) + 1)
    return m
  }, [routine])

  const q = query.trim().toLowerCase()
  const shown = teachers.filter((t) =>
    !q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) ||
    [...t.primary, ...t.secondary].some((id) => subjectById.get(id)?.name.toLowerCase().includes(q)),
  )

  const addButton = (
    <Button variant="primary" icon={<Plus weight="bold" />} disabled={subjects.length === 0} onClick={() => setEditing('new')}>
      Add Teacher
    </Button>
  )

  if (teachers.length === 0) {
    return (
      <>
        <PageHeader title="Teachers" description="Each teacher's main subjects and the extra subjects they can also take." />
        <EmptyState
          icon={<ChalkboardTeacher weight="light" />}
          title="No teachers yet"
          action={subjects.length === 0 ? <Button variant="primary" onClick={() => { window.location.hash = 'subjects' }}>Add Subjects First</Button> : addButton}
        >
          {subjects.length === 0 ? 'Teachers are matched to subjects, so add your subjects first.' : 'Add each teacher with the subjects they are good at.'}
        </EmptyState>
        <TeacherDialog teacher={editing} onClose={() => setEditing(null)} />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Teachers"
        description="Main subjects are preferred. Extra subjects let a teacher cover senior classes too. Classes up to the junior cut-off can go to anyone."
        actions={addButton}
      />

      <div className="animate-rise mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <MagnifyingGlass aria-hidden weight="light" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg text-ink-3" />
          <Input
            type="search"
            aria-label="Search teachers"
            placeholder="Search name or subject…"
            className="rounded-full pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="text-sm text-ink-2" aria-live="polite">
          {shown.length === teachers.length ? `${teachers.length} teachers` : `${shown.length} of ${teachers.length} teachers`}
        </p>
      </div>

      <Shell className="animate-rise [animation-delay:60ms]">
        <div className="hidden grid-cols-[minmax(12rem,1.3fr)_2fr_2fr_7rem_6rem_5.5rem] gap-4 border-b border-line px-5 py-3 text-xs font-medium uppercase tracking-[0.08em] text-ink-3 lg:grid">
          <span>Teacher</span><span>Main subjects</span><span>Extra subjects</span><span>Limits</span><span>This week</span><span className="sr-only">Actions</span>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-ink-2">No teachers match “{query}”.</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((t) => {
              const load = weekly.get(t.id)
              return (
                <li key={t.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-5 py-4 lg:grid-cols-[minmax(12rem,1.3fr)_2fr_2fr_7rem_6rem_5.5rem]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span translate="no" aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-shell font-mono text-xs font-medium text-ink-2">{t.code}</span>
                    <span className="truncate font-medium">{t.name}</span>
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-1.5 lg:col-span-1">
                    <span className="w-12 self-center text-xs text-ink-3 lg:sr-only">Main</span>
                    <SubjectList ids={t.primary} byId={subjectById} strong />
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-1.5 lg:col-span-1">
                    <span className="w-12 self-center text-xs text-ink-3 lg:sr-only">Extra</span>
                    {t.secondary.length ? <SubjectList ids={t.secondary} byId={subjectById} /> : <span className="text-sm text-ink-3">None</span>}
                  </div>
                  <div className="col-span-2 flex gap-4 text-sm lg:col-span-1 lg:block">
                    <span className="block font-mono tabular-nums text-ink-2">{t.maxPerDay}<span className="font-sans text-ink-3"> /day</span></span>
                    <span className="block font-mono tabular-nums text-ink-2">{t.maxPerWeek}<span className="font-sans text-ink-3"> /week</span></span>
                  </div>
                  <div className="col-span-2 text-sm lg:col-span-1">
                    {load === undefined ? <span className="text-ink-3">{routine ? 'Not used' : 'Not built'}</span> : (
                      <span className="font-mono tabular-nums"><span className="text-ink">{load}</span><span className="text-ink-3"> periods</span></span>
                    )}
                  </div>
                  <div className="col-start-2 row-start-1 flex justify-end gap-0.5 lg:col-start-auto lg:row-start-auto">
                    <IconButton label={`Edit ${t.name}`} onClick={() => setEditing(t)}><PencilSimple weight="light" /></IconButton>
                    <IconButton label={`Delete ${t.name}`} className="hover:text-danger" onClick={() => setDeleting(t)}><Trash weight="light" /></IconButton>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Shell>

      <TeacherDialog teacher={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeTeacher(deleting.id)}
        title={`Delete ${deleting?.name ?? 'teacher'}?`}
        confirmLabel="Delete Teacher"
      >
        {deleting && (() => {
          const pins = classes.filter((c) => c.curriculum.some((i) => i.pinnedTeacherId === deleting.id)).length
          return pins
            ? `${deleting.name} is pinned in ${pins} ${pins === 1 ? 'class' : 'classes'}. Those subjects will go back to automatic choice.`
            : 'Their periods will go to other teachers next time you generate.'
        })()}
      </ConfirmDialog>
    </>
  )
}

function SubjectList({ ids, byId, strong }: { ids: string[]; byId: Map<string, Subject>; strong?: boolean }) {
  return (
    <>
      {ids.map((id) => {
        const s = byId.get(id)
        if (!s) return null
        return (
          <span key={id} className={strong ? 'inline-flex h-7 items-center gap-1.5 rounded-full bg-shell px-2.5 text-[13px] font-medium' : 'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-ink-2 ring-1 ring-line-strong'}>
            <Swatch color={s.color} />
            {s.name}
          </span>
        )
      })}
    </>
  )
}

function TeacherDialog({ teacher, onClose }: { teacher: Teacher | 'new' | null; onClose: () => void }) {
  return (
    <Dialog open={teacher !== null} onClose={onClose} wide title={teacher === 'new' ? 'Add teacher' : 'Edit teacher'}>
      {teacher !== null && <TeacherForm key={teacher === 'new' ? 'new' : teacher.id} teacher={teacher === 'new' ? null : teacher} onDone={onClose} />}
    </Dialog>
  )
}

function TeacherForm({ teacher, onDone }: { teacher: Teacher | null; onDone: () => void }) {
  const subjects = useStore((s) => s.data.subjects)
  const teachers = useStore((s) => s.data.teachers)
  const settings = useStore((s) => s.data.settings)
  const upsertTeacher = useStore((s) => s.upsertTeacher)
  const [name, setName] = useState(teacher?.name ?? '')
  const [code, setCode] = useState(teacher?.code ?? '')
  const [codeTouched, setCodeTouched] = useState(teacher !== null)
  const [primary, setPrimary] = useState<string[]>(teacher?.primary ?? [])
  const [secondary, setSecondary] = useState<string[]>(teacher?.secondary ?? [])
  const [maxPerDay, setMaxPerDay] = useState(teacher?.maxPerDay ?? settings.defaultMaxPerDay)
  const [maxPerWeek, setMaxPerWeek] = useState(teacher?.maxPerWeek ?? settings.defaultMaxPerWeek)
  const [tried, setTried] = useState(false)

  const finalCode = (codeTouched ? code : initials(name)).trim().toUpperCase()
  const nameError = !name.trim() ? 'Enter the teacher’s name.' : undefined
  const codeError = !finalCode ? 'Enter a short code, like AS.' : teachers.some((t) => t.id !== teacher?.id && t.code === finalCode) ? `${finalCode} is already used by another teacher. Try adding a letter.` : undefined
  const subjectError = primary.length === 0 ? 'Choose at least one main subject.' : undefined

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (nameError || codeError || subjectError) {
      const first = nameError ? 'teacher-name' : codeError ? 'teacher-code' : 'main-subjects'
      document.getElementById(first)?.focus()
      return
    }
    upsertTeacher({ id: teacher?.id ?? uid('t'), name: name.trim(), code: finalCode, primary, secondary: secondary.filter((x) => !primary.includes(x)), maxPerDay, maxPerWeek })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-7">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_9rem]">
        <Field label="Name" htmlFor="teacher-name" error={tried ? nameError : undefined}>
          <Input id="teacher-name" name="teacher-name" placeholder="e.g. Ananya Sen…" value={name} aria-invalid={tried && !!nameError} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Short code" htmlFor="teacher-code" error={tried ? codeError : undefined}>
          <Input id="teacher-code" name="teacher-code" spellCheck={false} maxLength={4} className="font-mono uppercase" placeholder="AS" value={finalCode} aria-invalid={tried && !!codeError} onChange={(e) => { setCodeTouched(true); setCode(e.target.value) }} />
        </Field>
      </div>

      <fieldset>
        <legend id="main-subjects" tabIndex={-1} className="text-sm font-medium outline-none">Main subjects</legend>
        <p className="mt-1 text-[13px] text-ink-3">Their own field. Chosen first for senior classes.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {subjects.map((s) => (
            <ToggleChip key={s.id} pressed={primary.includes(s.id)} onClick={() => { toggle(primary, setPrimary, s.id); setSecondary((x) => x.filter((y) => y !== s.id)) }}>
              <Swatch color={s.color} />{s.name}
            </ToggleChip>
          ))}
        </div>
        {tried && subjectError && <p role="alert" className="mt-2 text-[13px] text-danger">{subjectError}</p>}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium">Extra subjects</legend>
        <p className="mt-1 text-[13px] text-ink-3">Other subjects they can teach well, including in senior classes.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {subjects.map((s) => (
            <ToggleChip key={s.id} pressed={secondary.includes(s.id)} disabled={primary.includes(s.id)} title={primary.includes(s.id) ? 'Already a main subject' : undefined} onClick={() => toggle(secondary, setSecondary, s.id)}>
              <Swatch color={s.color} />{s.name}
            </ToggleChip>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Most periods in a day" htmlFor="t-day">
          <Stepper id="t-day" label="most periods in a day" value={maxPerDay} min={1} max={settings.periodsPerDay} onChange={setMaxPerDay} />
        </Field>
        <Field label="Most periods in a week" htmlFor="t-week">
          <Stepper id="t-week" label="most periods in a week" value={maxPerWeek} min={1} max={settings.periodsPerDay * settings.dayNames.length} onChange={setMaxPerWeek} />
        </Field>
      </div>

      <div className="-mx-6 -mb-4 flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit">{teacher ? 'Save Changes' : 'Add Teacher'}</Button>
      </div>
    </form>
  )
}
