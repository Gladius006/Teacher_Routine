import { useState } from 'react'
import { BookOpenText, Check, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Button, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader, Segmented, Shell, Stepper, ToggleChip, cx } from '../../components/ui'
import { className } from '../../engine/assign'
import { slotsPerWeek } from '../../engine/blocks'
import { DEFAULT_LAB } from '../../engine/labs'
import { DEFAULT_SUBJECT_PERIODS, GRADE_OPTIONS, formatGrades, syncSubjectClasses } from '../../engine/grades'
import type { LabInfo, Subject } from '../../engine/types'
import { uid, useStore } from '../../store/store'

/** Subject colors in rainbow order, as shown in the picker. */
const PALETTE: { hex: string; name: string }[] = [
  { hex: '#dc2626', name: 'Red' }, { hex: '#e11d48', name: 'Rose' }, { hex: '#9f1239', name: 'Maroon' },
  { hex: '#be185d', name: 'Pink' }, { hex: '#a21caf', name: 'Magenta' }, { hex: '#9333ea', name: 'Purple' },
  { hex: '#6d4fd1', name: 'Violet' }, { hex: '#4338ca', name: 'Indigo' }, { hex: '#2a46a6', name: 'Navy' },
  { hex: '#3b6fd8', name: 'Blue' }, { hex: '#0284c7', name: 'Sky' }, { hex: '#0e7490', name: 'Cyan' },
  { hex: '#0f8a6a', name: 'Teal' }, { hex: '#10a37f', name: 'Mint' }, { hex: '#047857', name: 'Green' },
  { hex: '#1f7a3a', name: 'Forest' }, { hex: '#65a30d', name: 'Lime' }, { hex: '#4d7c0f', name: 'Olive' },
  { hex: '#ca8a04', name: 'Gold' }, { hex: '#b45309', name: 'Amber' }, { hex: '#c2410c', name: 'Orange' },
  { hex: '#7c2d12', name: 'Brown' }, { hex: '#78716c', name: 'Stone' }, { hex: '#475569', name: 'Slate' },
]

/** Order new subjects take colors in: far-apart hues first, so neighbours on the timetable look different. */
export const SUBJECT_COLORS = [
  '#3b6fd8', '#6d4fd1', '#a21caf', '#be185d', '#dc2626', '#c2410c',
  '#b45309', '#4d7c0f', '#0f8a6a', '#047857', '#0e7490', '#475569',
  '#0284c7', '#9333ea', '#e11d48', '#65a30d', '#ca8a04', '#10a37f',
  '#4338ca', '#9f1239', '#7c2d12', '#1f7a3a', '#2a46a6', '#78716c',
]

/** The first color no subject uses yet, or the next in turn once all are taken. */
const nextColor = (used: string[]) => SUBJECT_COLORS.find((c) => !used.includes(c)) ?? SUBJECT_COLORS[used.length % SUBJECT_COLORS.length]

export const codeFrom = (name: string) => name.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase()

export function SubjectsPage() {
  const subjects = useStore((s) => s.data.subjects)
  const teachers = useStore((s) => s.data.teachers)
  const classes = useStore((s) => s.data.classes)
  const removeSubject = useStore((s) => s.removeSubject)
  const [editing, setEditing] = useState<Subject | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Subject | null>(null)

  const usage = (id: string) => ({
    teachers: teachers.filter((t) => t.primary.includes(id) || t.secondary.includes(id)).length,
    classes: classes.filter((c) => c.curriculum.some((i) => i.subjectId === id)).length,
  })

  const addButton = <Button variant="primary" icon={<Plus weight="bold" />} onClick={() => setEditing('new')}>Add Subject</Button>

  return (
    <>
      <PageHeader
        title="Subjects"
        description="Every subject taught in the school. The color is used in the routine so subjects are easy to spot."
        actions={subjects.length > 0 && addButton}
      />
      {subjects.length === 0 ? (
        <EmptyState icon={<BookOpenText weight="light" />} title="No subjects yet" action={addButton}>
          Start with the subjects on your timetable, like English, Mathematics or Physical Education.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((s, i) => {
            const u = usage(s.id)
            return (
              <li key={s.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <Shell>
                  <div className="flex items-center gap-4 p-4 pl-5">
                    <span aria-hidden className="flex h-10 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h2 className="truncate font-semibold tracking-tight">{s.name}</h2>
                        <span translate="no" className="font-mono text-xs text-ink-3">{s.code}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-ink-2">
                        {s.grades ? (s.grades.length ? `Classes ${formatGrades(s.grades)}` : 'No classes') : 'All classes'}
                        {s.endOfDay ? <span className="text-ink-3">, end of day</span> : null}
                        {s.lab ? <span className="text-ink-3">, {s.lab.rooms} {s.lab.rooms === 1 ? 'lab' : 'labs'}</span> : null}
                      </p>
                      <p className="text-[13px] text-ink-3">
                        {u.teachers} {u.teachers === 1 ? 'teacher' : 'teachers'}, {u.classes} {u.classes === 1 ? 'class' : 'classes'}
                      </p>
                    </div>
                    <IconButton label={`Edit ${s.name}`} onClick={() => setEditing(s)}><PencilSimple weight="light" /></IconButton>
                    <IconButton label={`Delete ${s.name}`} className="hover:text-danger" onClick={() => setDeleting(s)}><Trash weight="light" /></IconButton>
                  </div>
                </Shell>
              </li>
            )
          })}
        </ul>
      )}

      <SubjectDialog subject={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeSubject(deleting.id)}
        title={`Delete ${deleting?.name ?? 'subject'}?`}
        confirmLabel="Delete Subject"
      >
        {deleting && (() => {
          const u = usage(deleting.id)
          return u.teachers + u.classes === 0
            ? 'Nothing uses this subject yet.'
            : `It will be removed from ${u.teachers} ${u.teachers === 1 ? 'teacher' : 'teachers'} and from the timetable of ${u.classes} ${u.classes === 1 ? 'class' : 'classes'}.`
        })()}
      </ConfirmDialog>
    </>
  )
}

function SubjectDialog({ subject, onClose }: { subject: Subject | 'new' | null; onClose: () => void }) {
  return (
    <Dialog open={subject !== null} onClose={onClose} title={subject === 'new' ? 'Add subject' : 'Edit subject'}>
      {subject !== null && <SubjectForm key={subject === 'new' ? 'new' : subject.id} subject={subject === 'new' ? null : subject} onDone={onClose} />}
    </Dialog>
  )
}

function SubjectForm({ subject, onDone }: { subject: Subject | null; onDone: () => void }) {
  const subjects = useStore((s) => s.data.subjects)
  const upsertSubject = useStore((s) => s.upsertSubject)
  const [name, setName] = useState(subject?.name ?? '')
  const [code, setCode] = useState(subject?.code ?? '')
  const [codeTouched, setCodeTouched] = useState(subject !== null)
  const [color, setColor] = useState(subject?.color ?? nextColor(subjects.map((s) => s.color)))
  const classes = useStore((s) => s.data.classes)
  // Offer 5 to 12, plus any other grade the school has classes in.
  const gradeOptions = [...new Set([...GRADE_OPTIONS, ...classes.map((c) => c.grade)])].sort((a, b) => a - b)
  const [grades, setGrades] = useState<number[]>(subject?.grades ?? gradeOptions)
  const [periods, setPeriods] = useState(subject?.periods ?? DEFAULT_SUBJECT_PERIODS)
  const periodsPerDay = useStore((s) => s.data.settings.periodsPerDay)
  // 0 = any time; otherwise only in the last N periods of each day.
  const [endOfDay, setEndOfDay] = useState(subject?.endOfDay ?? 0)
  const [lab, setLab] = useState<LabInfo | null>(subject?.lab ?? null)
  const setLabField = (patch: Partial<LabInfo>) => setLab((l) => (l ? { ...l, ...patch } : l))
  const [tried, setTried] = useState(false)
  const slots = useStore((s) => slotsPerWeek(s.data.settings))

  const upTo = (max: number) => gradeOptions.filter((g) => g >= 5 && g <= max)
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((g) => b.includes(g))
  const toggleGrade = (g: number) => setGrades((xs) => (xs.includes(g) ? xs.filter((x) => x !== g) : [...xs, g].sort((a, b) => a - b)))
  const gradesError = grades.length === 0 ? 'Choose at least one class.' : undefined
  // What saving will do to the classes: new grades get the subject, dropped grades lose it.
  const id = subject?.id ?? 'new-subject'
  const synced = syncSubjectClasses(classes, subject ?? undefined, { id, name, code, color, grades, periods })
  const has = (c: { curriculum: { subjectId: string }[] }) => c.curriculum.some((i) => i.subjectId === id)
  const added = classes.filter((c, i) => !has(c) && has(synced[i]))
  const removed = classes.filter((c, i) => has(c) && !has(synced[i]))
  const overfull = added.filter((c) => c.curriculum.reduce((n, i) => n + i.periods, 0) + periods > slots)
  const list = (cs: typeof classes) => (cs.length <= 6 ? cs.map(className).join(', ') : `${cs.slice(0, 5).map(className).join(', ')} and ${cs.length - 5} more`)

  const finalCode = (codeTouched ? code : codeFrom(name)).trim().toUpperCase()
  const nameError = !name.trim() ? 'Enter a subject name.' : subjects.some((s) => s.id !== subject?.id && s.name.toLowerCase() === name.trim().toLowerCase()) ? 'A subject with this name already exists.' : undefined
  const codeError = !finalCode ? 'Enter a short code, like ENG.' : subjects.some((s) => s.id !== subject?.id && s.code === finalCode) ? `${finalCode} is already used by another subject.` : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (nameError || codeError || gradesError) {
      document.getElementById(nameError ? 'subj-name' : codeError ? 'subj-code' : 'subj-grades')?.focus()
      return
    }
    upsertSubject({ id: subject?.id ?? uid('s'), name: name.trim(), code: finalCode, color, grades, periods, ...(endOfDay > 0 ? { endOfDay } : {}), ...(lab ? { lab } : {}) })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Field label="Name" htmlFor="subj-name" error={tried ? nameError : undefined}>
        <Input id="subj-name" name="subject-name" placeholder="e.g. Mathematics…" value={name} aria-invalid={tried && !!nameError} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Short code" htmlFor="subj-code" hint="Shown in the routine grid. Up to 5 letters." error={tried ? codeError : undefined}>
        <Input
          id="subj-code"
          name="subject-code"
          spellCheck={false}
          maxLength={5}
          className="w-32 font-mono uppercase"
          placeholder="MATH"
          value={finalCode}
          aria-invalid={tried && !!codeError}
          onChange={(e) => { setCodeTouched(true); setCode(e.target.value) }}
        />
      </Field>
      <fieldset>
        <legend id="subj-grades" tabIndex={-1} className="text-sm font-medium outline-none">Taught in classes</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          <ToggleChip pressed={same(grades, upTo(10))} onClick={() => setGrades(upTo(10))}>Classes 5-10</ToggleChip>
          <ToggleChip pressed={same(grades, upTo(12))} onClick={() => setGrades(upTo(12))}>Classes 5-12</ToggleChip>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {gradeOptions.map((g) => (
            <ToggleChip key={g} pressed={grades.includes(g)} onClick={() => toggleGrade(g)}>
              <span className="sr-only">Class </span>{g}
            </ToggleChip>
          ))}
        </div>
        {tried && gradesError ? (
          <p role="alert" className="mt-2 text-[13px] text-danger">{gradesError}</p>
        ) : (
          <div aria-live="polite" className="mt-2 flex flex-col gap-1 text-[13px] leading-snug">
            {added.length > 0 && <p className="text-ink-2">Will be added to {list(added)}.</p>}
            {overfull.length > 0 && (
              <p className="text-warn">
                {list(overfull)} will then need more than the {slots} periods a week has. Lower the periods below, or remove a subject from {overfull.length === 1 ? 'that class' : 'those classes'}.
              </p>
            )}
            {removed.length > 0 && <p className="text-warn">Will be removed from {list(removed)}.</p>}
            {added.length + removed.length === 0 && <p className="text-ink-3">Only these classes can have this subject.</p>}
          </div>
        )}
      </fieldset>
      <Field label="Periods per week" htmlFor="subj-periods" hint="What each class gets when this subject is added to it. You can change it for any class.">
        <Stepper id="subj-periods" label="periods per week" value={periods} min={1} max={Math.max(1, slots)} onChange={setPeriods} />
      </Field>
      <fieldset>
        <legend className="text-sm font-medium">Time of day</legend>
        <p className="mt-1 text-[13px] text-ink-3">For subjects like Physical Ed. or Work Education that are taken at the end of the day.</p>
        <div className="mt-3">
          <Segmented
            label="Time of day"
            value={endOfDay > 0 ? 'end' : 'any'}
            options={[{ value: 'any', label: 'Any time' }, { value: 'end', label: 'End of day' }]}
            onChange={(v) => setEndOfDay(v === 'end' ? Math.min(2, Math.max(1, periodsPerDay - 1)) : 0)}
          />
        </div>
        {endOfDay > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <label htmlFor="subj-end">Only in the last</label>
            <Stepper id="subj-end" label="last periods of the day" value={endOfDay} min={1} max={Math.max(1, periodsPerDay - 1)} onChange={setEndOfDay} />
            <span>{endOfDay === 1 ? 'period' : 'periods'} of the day</span>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">Lab or practical</legend>
        <p className="mt-1 text-[13px] text-ink-3">
          For classes 11 and 12. A class can be split into lab sections that take turns in the labs, each with the subject teacher.
        </p>
        <div className="mt-3">
          <Segmented
            label="Lab or practical"
            value={lab ? 'lab' : 'none'}
            options={[{ value: 'none', label: 'No lab' }, { value: 'lab', label: 'Has a lab' }]}
            onChange={(v) => setLab(v === 'lab' ? (lab ?? { ...DEFAULT_LAB, periods: Math.min(DEFAULT_LAB.periods, periodsPerDay) }) : null)}
          />
        </div>
        {lab && (
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Number of labs" htmlFor="lab-rooms" hint="Rooms the school has for it.">
              <Stepper id="lab-rooms" label="number of labs" value={lab.rooms} min={1} max={10} onChange={(n) => setLabField({ rooms: n })} />
            </Field>
            <Field label="Session length" htmlFor="lab-len" hint={lab.periods === 1 ? 'One period.' : `${lab.periods} periods in a row.`}>
              <Stepper id="lab-len" label="lab session length in periods" value={lab.periods} min={1} max={Math.max(1, periodsPerDay)} onChange={(n) => setLabField({ periods: n })} />
            </Field>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">
          Color{' '}
          <span className="font-normal text-ink-3">{PALETTE.find((p) => p.hex === color)?.name ?? ''}</span>
        </legend>
        <div className="mt-3 grid grid-cols-8 gap-2 sm:grid-cols-12">
          {PALETTE.map(({ hex, name: colorName }) => {
            const users = subjects.filter((s) => s.id !== subject?.id && s.color === hex).map((s) => s.name)
            return (
              <button
                key={hex}
                type="button"
                aria-label={users.length ? `${colorName}, used by ${users.join(', ')}` : colorName}
                title={users.length ? `${colorName}: used by ${users.join(', ')}` : colorName}
                aria-pressed={color === hex}
                onClick={() => setColor(hex)}
                className={cx(
                  'relative flex aspect-square w-full max-w-9 items-center justify-center rounded-full text-white transition-transform duration-300 ease-(--ease-out) hover:scale-110',
                  color === hex && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
                )}
                style={{ background: hex }}
              >
                {color === hex
                  ? <Check weight="bold" aria-hidden />
                  : users.length > 0 && <span aria-hidden className="size-1.5 rounded-full bg-white/80" />}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[13px] text-ink-3">A dot means another subject already has that color.</p>
      </fieldset>
      <div className="-mx-6 -mb-4 flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit">{subject ? 'Save Changes' : 'Add Subject'}</Button>
      </div>
    </form>
  )
}
