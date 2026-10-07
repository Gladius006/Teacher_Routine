import { useState } from 'react'
import { BookOpenText, Check, Flask, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Button, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader, Segmented, Select, Shell, Stepper, ToggleChip, cx } from '../../components/ui'
import { className } from '../../engine/assign'
import { slotsPerWeek } from '../../engine/blocks'
import { DEFAULT_LAB, DEFAULT_LAB_GRADES, groupNames, isLab } from '../../engine/labs'
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
                        {isLab(s.lab) ? <span className="text-ink-3">, lab</span> : null}
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

      {subjects.length > 0 && <LabsSection />}
    </>
  )
}

/* ---------- Lab and Practical ---------- */

function LabsSection() {
  const subjects = useStore((s) => s.data.subjects)
  const classes = useStore((s) => s.data.classes)
  const upsertSubject = useStore((s) => s.upsertSubject)
  const [editing, setEditing] = useState<Subject | 'new' | null>(null)
  const [removing, setRemoving] = useState<Subject | null>(null)
  const labs = subjects.filter((s) => isLab(s.lab))
  const free = subjects.filter((s) => !isLab(s.lab))
  /** Classes that get this lab: in one of its grades, and they have the subject. */
  const classesWith = (s: Subject) =>
    classes
      .filter((c) => s.lab!.grades.includes(c.grade) && c.curriculum.some((i) => i.subjectId === s.id))
      .sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
  const remove = (s: Subject) => {
    const { lab: _lab, ...rest } = s
    upsertSubject(rest)
  }

  return (
    <section aria-labelledby="labs-heading" className="mt-16">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="labs-heading" className="text-2xl font-semibold tracking-tight">Lab and Practical</h2>
          <p className="mt-1.5 max-w-[64ch] text-[15px] leading-relaxed text-ink-2">
            For lab work a class is split into groups (A, B, C…). While some groups are in a lab, the others are free, and the class has no ordinary lesson. Each lab is taken by the class's own teacher for that subject.
          </p>
        </div>
        <Button icon={<Plus weight="bold" />} disabled={free.length === 0} onClick={() => setEditing('new')}>Add Lab</Button>
      </div>

      {labs.length === 0 ? (
        <Shell>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-2xl text-accent"><Flask weight="light" /></span>
            <p className="font-medium">No labs or practicals yet</p>
            <p className="max-w-[48ch] text-sm text-ink-2">Add a subject like Physics, Chemistry or Biology to give classes 11 and 12 lab sessions in groups.</p>
          </div>
        </Shell>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {labs.map((s) => {
            const lab = s.lab!
            const using = classesWith(s)
            return (
              <li key={s.id}>
                <Shell>
                  <div className="flex items-start gap-4 p-4 pl-5">
                    <span aria-hidden className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full text-xl text-white" style={{ background: s.color }}>
                      <Flask weight="light" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold tracking-tight">{s.name} lab</h3>
                      <p className="mt-0.5 text-sm text-ink-2">
                        Groups {groupNames(lab.groups)} · {lab.sessions} {lab.sessions === 1 ? 'session' : 'sessions'} a week each, {lab.periods} {lab.periods === 1 ? 'period' : 'periods'} long
                      </p>
                      <p className="text-[13px] text-ink-3">
                        {lab.rooms} {lab.rooms === 1 ? 'lab room' : 'lab rooms'} · {using.length ? `Classes ${using.map(className).join(', ')}` : `No class in ${formatGrades(lab.grades)} has ${s.name} yet`}
                      </p>
                    </div>
                    <IconButton label={`Edit ${s.name} lab`} onClick={() => setEditing(s)}><PencilSimple weight="light" /></IconButton>
                    <IconButton label={`Remove ${s.name} lab`} className="hover:text-danger" onClick={() => setRemoving(s)}><Trash weight="light" /></IconButton>
                  </div>
                </Shell>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add lab or practical' : `Edit ${editing ? editing.name : ''} lab`}>
        {editing !== null && <LabForm key={editing === 'new' ? 'new' : editing.id} subject={editing === 'new' ? null : editing} choices={free} onDone={() => setEditing(null)} />}
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove(removing)}
        title={`Remove the ${removing?.name ?? ''} lab?`}
        confirmLabel="Remove Lab"
      >
        {removing?.name} stays as a subject. Its lab sessions are taken out of the routine next time you generate.
      </ConfirmDialog>
    </section>
  )
}

function LabForm({ subject, choices, onDone }: { subject: Subject | null; choices: Subject[]; onDone: () => void }) {
  const subjects = useStore((s) => s.data.subjects)
  const periodsPerDay = useStore((s) => s.data.settings.periodsPerDay)
  const upsertSubject = useStore((s) => s.upsertSubject)
  const [subjectId, setSubjectId] = useState(subject?.id ?? choices[0]?.id ?? '')
  const chosen = subjects.find((s) => s.id === subjectId)
  const allowed = (s: Subject | undefined) => (s?.grades ?? GRADE_OPTIONS)
  const startGrades = (s: Subject | undefined) => DEFAULT_LAB_GRADES.filter((g) => allowed(s).includes(g))
  const [lab, setLab] = useState<LabInfo>(subject?.lab ?? { ...DEFAULT_LAB, periods: Math.min(DEFAULT_LAB.periods, periodsPerDay), grades: startGrades(chosen) })
  const set = (patch: Partial<LabInfo>) => setLab((l) => ({ ...l, ...patch }))
  const [tried, setTried] = useState(false)
  const gradesError = lab.grades.length === 0 ? 'Choose at least one class.' : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (!chosen || gradesError) return
    upsertSubject({ ...chosen, lab })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      {subject ? null : (
        <Field label="Subject" htmlFor="lab-subject" hint="Its teacher for each class takes that class's lab.">
          <Select id="lab-subject" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); set({ grades: startGrades(subjects.find((s) => s.id === e.target.value)) }) }}>
            {choices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
      )}
      <fieldset>
        <legend className="text-sm font-medium">Classes</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {allowed(chosen).map((g) => (
            <ToggleChip key={g} pressed={lab.grades.includes(g)} onClick={() => set({ grades: lab.grades.includes(g) ? lab.grades.filter((x) => x !== g) : [...lab.grades, g].sort((a, b) => a - b) })}>
              <span className="sr-only">Class </span>{g}
            </ToggleChip>
          ))}
        </div>
        {tried && gradesError
          ? <p role="alert" className="mt-2 text-[13px] text-danger">{gradesError}</p>
          : <p className="mt-2 text-[13px] text-ink-3">Every class of these grades that has {chosen?.name ?? 'the subject'} gets the lab.</p>}
      </fieldset>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Number of groups" htmlFor="lab-groups" hint={`Groups ${groupNames(lab.groups)}.`}>
          <Stepper id="lab-groups" label="number of groups" value={lab.groups} min={1} max={10} onChange={(n) => set({ groups: n })} />
        </Field>
        <Field label="Sessions a week" htmlFor="lab-sessions" hint="For each group.">
          <Stepper id="lab-sessions" label="lab sessions a week for each group" value={lab.sessions} min={1} max={5} onChange={(n) => set({ sessions: n })} />
        </Field>
        <Field label="Session length" htmlFor="lab-len" hint={lab.periods === 1 ? 'One period.' : `${lab.periods} periods in a row.`}>
          <Stepper id="lab-len" label="lab session length in periods" value={lab.periods} min={1} max={Math.max(1, periodsPerDay)} onChange={(n) => set({ periods: n })} />
        </Field>
        <Field label="Number of labs" htmlFor="lab-rooms" hint="Lab rooms the school has for it.">
          <Stepper id="lab-rooms" label="number of lab rooms" value={lab.rooms} min={1} max={10} onChange={(n) => set({ rooms: n })} />
        </Field>
      </div>
      <div className="-mx-6 -mb-4 flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={!chosen}>{subject ? 'Save Changes' : 'Add Lab'}</Button>
      </div>
    </form>
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
    upsertSubject({ id: subject?.id ?? uid('s'), name: name.trim(), code: finalCode, color, grades, periods, ...(endOfDay > 0 ? { endOfDay } : {}), ...(subject?.lab ? { lab: subject.lab } : {}) })
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
