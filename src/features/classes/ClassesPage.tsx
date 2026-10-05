import { useMemo, useRef, useState } from 'react'
import { CopySimple, PencilSimple, Plus, Trash, UsersThree, X } from '@phosphor-icons/react'
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader, Select, Shell, Stepper, cx } from '../../components/ui'
import { className, isJunior, tierOf } from '../../engine/assign'
import { slotsPerWeek } from '../../engine/blocks'
import { curriculumFor, formatGrades, isOffered } from '../../engine/grades'
import { cleanSection, nextSection, sameSection } from '../../engine/sections'
import type { ClassSection, CurriculumItem, Subject } from '../../engine/types'
import { uid, useStore } from '../../store/store'

export function ClassesPage() {
  const classes = useStore((s) => s.data.classes)
  const subjects = useStore((s) => s.data.subjects)
  const settings = useStore((s) => s.data.settings)
  const removeClass = useStore((s) => s.removeClass)
  const copyCurriculum = useStore((s) => s.copyCurriculum)
  const addSection = useStore((s) => s.addSection)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [editing, setEditing] = useState<ClassSection | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ClassSection | null>(null)
  const [copying, setCopying] = useState<ClassSection | null>(null)
  const slots = slotsPerWeek(settings)
  const subjectById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  const grades = useMemo(() => {
    const m = new Map<number, ClassSection[]>()
    for (const c of [...classes].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))) {
      m.set(c.grade, [...(m.get(c.grade) ?? []), c])
    }
    return [...m.entries()]
  }, [classes])

  const siblings = (c: ClassSection) => classes.filter((x) => x.grade === c.grade && x.id !== c.id)
  const addButton = <Button variant="primary" icon={<Plus weight="bold" />} disabled={subjects.length === 0} onClick={() => setEditing('new')}>Add Class</Button>

  return (
    <>
      <PageHeader
        title="Classes"
        description={`Each class section and how many periods every subject gets in a week. A week has ${slots} periods.`}
        actions={classes.length > 0 && addButton}
      />

      {classes.length === 0 ? (
        <EmptyState
          icon={<UsersThree weight="light" />}
          title="No classes yet"
          action={subjects.length === 0 ? <Button variant="primary" onClick={() => { window.location.hash = 'subjects' }}>Add Subjects First</Button> : addButton}
        >
          Add a class like 9A. It starts with every subject taught in its grade, and you can change the periods or remove any.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-12">
          {grades.map(([grade, list], gi) => (
            <section key={grade} aria-labelledby={`grade-${grade}`} className="animate-rise" style={{ animationDelay: `${Math.min(gi, 8) * 50}ms` }}>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h2 id={`grade-${grade}`} className="text-xl font-semibold tracking-tight">Class {grade}</h2>
                {isJunior(list[0], settings)
                  ? <Badge tone="accent">Junior: any teacher</Badge>
                  : <Badge>Senior: skilled teachers only</Badge>}
                <Button size="sm" variant="ghost" className="ml-auto" icon={<Plus weight="bold" />} onClick={() => setRenaming(addSection(grade))}>
                  Add Section<span className="sr-only"> to class {grade}</span>
                </Button>
              </div>
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((c) => {
                  const misplaced = c.curriculum.filter((i) => !isOffered(subjectById.get(i.subjectId), c.grade))
                  const valid = c.curriculum.filter((i) => isOffered(subjectById.get(i.subjectId), c.grade))
                  const used = valid.reduce((n, i) => n + i.periods, 0)
                  const over = used > slots
                  return (
                    <li key={c.id}>
                      <Shell>
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {renaming === c.id
                                ? <SectionNameEditor cls={c} onDone={() => setRenaming(null)} />
                                : <h3 className="truncate text-lg font-semibold tracking-tight" title={`Class ${className(c)}`}>{className(c)}</h3>}
                              <p className={cx('mt-0.5 font-mono text-sm tabular-nums', over ? 'text-danger' : 'text-ink-2')}>
                                {used} <span className="font-sans">of</span> {slots} <span className="font-sans">periods</span>
                              </p>
                            </div>
                            <div className="-mr-2 -mt-1 flex">
                              {siblings(c).length > 0 && (
                                <IconButton label={`Copy ${className(c)} subjects to other class ${c.grade} sections`} onClick={() => setCopying(c)}><CopySimple weight="light" /></IconButton>
                              )}
                              <IconButton label={`Edit ${className(c)}`} onClick={() => setEditing(c)}><PencilSimple weight="light" /></IconButton>
                              <IconButton label={`Delete ${className(c)}`} className="hover:text-danger" onClick={() => setDeleting(c)}><Trash weight="light" /></IconButton>
                            </div>
                          </div>
                          <CompositionBar items={valid} slots={slots} byId={subjectById} />
                          {over && <p className="mt-2 text-[13px] text-danger">{used - slots} more than the week has. Remove some periods.</p>}
                          {misplaced.length > 0 && (
                            <p className="mt-2 text-[13px] leading-snug text-warn">
                              {misplaced.map((i) => subjectById.get(i.subjectId)?.name).join(', ')} {misplaced.length === 1 ? 'is' : 'are'} not taught in class {c.grade} and will be left out. Edit this class to remove {misplaced.length === 1 ? 'it' : 'them'}.
                            </p>
                          )}
                          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                            {valid.map((i) => {
                              const s = subjectById.get(i.subjectId)
                              return s ? (
                                <li key={i.subjectId} className="flex items-center gap-1.5 text-ink-2">
                                  <span translate="no" className="font-mono text-xs text-ink-3">{s.code}</span>
                                  <span className="font-mono tabular-nums text-ink">{i.periods}</span>
                                </li>
                              ) : null
                            })}
                            {c.curriculum.length === 0 && <li className="text-ink-3">No subjects yet</li>}
                          </ul>
                        </div>
                      </Shell>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ClassDialog cls={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && removeClass(deleting.id)}
        title={`Delete class ${deleting ? className(deleting) : ''}?`}
        confirmLabel="Delete Class"
      >
        Its subjects and periods are removed. Other classes are not affected.
      </ConfirmDialog>
      <ConfirmDialog
        open={copying !== null}
        onClose={() => setCopying(null)}
        onConfirm={() => copying && copyCurriculum(copying.id, siblings(copying).map((x) => x.id))}
        title={`Copy ${copying ? className(copying) : ''} subjects to the other sections?`}
        confirmLabel="Copy Subjects"
        tone="primary"
      >
        {copying && `${siblings(copying).map(className).join(', ')} will get the same subjects and periods. Pinned teachers are not copied.`}
      </ConfirmDialog>
    </>
  )
}

/** "Class 12 Commerce already exists." when another section of the grade has this name. */
function nameTaken(section: string, grade: number, others: ClassSection[]): string | undefined {
  const taken = others.find((c) => c.grade === grade && sameSection(c.section, section))
  return taken ? `Class ${className(taken)} already exists.` : undefined
}

/** Renames a section in place, right after Add Section creates it. Enter or leaving the field keeps the name. */
function SectionNameEditor({ cls, onDone }: { cls: ClassSection; onDone: () => void }) {
  const classes = useStore((s) => s.data.classes)
  const upsertClass = useStore((s) => s.upsertClass)
  const [value, setValue] = useState(cls.section)
  const closed = useRef(false)
  const error = nameTaken(value, cls.grade, classes.filter((c) => c.id !== cls.id))
  const commit = () => {
    if (closed.current) return
    closed.current = true
    if (!error) upsertClass({ ...cls, section: cleanSection(value) })
    onDone()
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!error) commit() }} className="-ml-1 -mt-1">
      <div className="flex items-center gap-2">
        <label htmlFor={`rename-${cls.id}`} className="pl-1 text-lg font-semibold tracking-tight">
          <span className="sr-only">Name for class </span>{cls.grade}
        </label>
        <Input
          id={`rename-${cls.id}`}
          autoFocus
          spellCheck={false}
          maxLength={24}
          autoComplete="off"
          className="h-9 min-w-0 flex-1 font-semibold"
          value={value}
          aria-invalid={!!error}
          aria-describedby={`rename-${cls.id}-hint`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closed.current = true; onDone() } }}
        />
      </div>
      <p id={`rename-${cls.id}-hint`} className={cx('mt-1 pl-1 text-[13px]', error ? 'text-danger' : 'text-ink-3')}>
        {error ?? 'Type a name, like B or Commerce. Press Enter to keep it.'}
      </p>
    </form>
  )
}

/** Proportional bar of the week, one segment per subject, in its color. */
function CompositionBar({ items, slots, byId }: { items: CurriculumItem[]; slots: number; byId: Map<string, Subject> }) {
  const used = items.reduce((n, i) => n + i.periods, 0)
  const total = Math.max(slots, used)
  return (
    <div className="mt-4 flex h-2 gap-px overflow-hidden rounded-full" role="img" aria-label={`${used} of ${slots} periods planned`}>
      {items.map((i) => (
        <span key={i.subjectId} className="h-full first:rounded-l-full" style={{ width: `${(i.periods / total) * 100}%`, background: byId.get(i.subjectId)?.color ?? 'var(--ink-3)' }} />
      ))}
      {used < slots && <span className="h-full flex-1 rounded-r-full bg-shell" />}
    </div>
  )
}

function ClassDialog({ cls, onClose }: { cls: ClassSection | 'new' | null; onClose: () => void }) {
  return (
    <Dialog open={cls !== null} onClose={onClose} wide title={cls === 'new' ? 'Add class' : `Edit class ${cls ? className(cls) : ''}`}>
      {cls !== null && <ClassForm key={cls === 'new' ? 'new' : cls.id} cls={cls === 'new' ? null : cls} onDone={onClose} />}
    </Dialog>
  )
}

function ClassForm({ cls, onDone }: { cls: ClassSection | null; onDone: () => void }) {
  const data = useStore((s) => s.data)
  const upsertClass = useStore((s) => s.upsertClass)
  const { subjects, teachers, settings, classes } = data
  const [grade, setGrade] = useState(cls?.grade ?? 9)
  const [section, setSection] = useState(cls?.section ?? nextSection(classes.filter((c) => c.grade === 9)))
  const [sectionTouched, setSectionTouched] = useState(cls !== null)
  // A new class starts like the grade's last section, or with every subject taught in its grade.
  const lastOf = (g: number) => [...classes].filter((c) => c.grade === g).sort((a, b) => a.section.localeCompare(b.section)).at(-1)
  const startFor = (g: number): CurriculumItem[] => {
    const sib = lastOf(g)
    return sib ? sib.curriculum.map(({ subjectId, periods }) => ({ subjectId, periods, pinnedTeacherId: null })) : curriculumFor(subjects, g)
  }
  const [items, setItems] = useState<CurriculumItem[]>(cls?.curriculum ?? startFor(9))
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [tried, setTried] = useState(false)
  const slots = slotsPerWeek(settings)
  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const offered = (id: string) => isOffered(subjectById.get(id), grade)
  const used = items.reduce((n, i) => n + (offered(i.subjectId) ? i.periods : 0), 0)
  const junior = grade <= settings.juniorMaxGrade

  const sectionError = nameTaken(section, grade, classes.filter((c) => c.id !== cls?.id))
  const preview = className({ id: '', grade, section: cleanSection(section), curriculum: [] })

  const changeGrade = (g: number) => {
    setGrade(g)
    if (cls) return
    // For a new class, follow the grade, leaving out any subject removed by hand.
    setItems(startFor(g).filter((i) => !removedIds.includes(i.subjectId)))
    if (!sectionTouched) setSection(nextSection(classes.filter((c) => c.grade === g)))
  }
  const removeItem = (idx: number) => {
    setRemovedIds((r) => [...r, items[idx].subjectId])
    setItems((xs) => xs.filter((_, i) => i !== idx))
  }

  const available = subjects.filter((s) => isOffered(s, grade))
  const unused = available.filter((s) => !items.some((i) => i.subjectId === s.id))
  const update = (idx: number, patch: Partial<CurriculumItem>) => setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, ...patch } : x)))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (sectionError) {
      document.getElementById('class-section')?.focus()
      return
    }
    upsertClass({ id: cls?.id ?? uid('c'), grade, section: cleanSection(section), curriculum: items.filter((i) => i.periods > 0) })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-7">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_minmax(0,15rem)_1fr] sm:items-start">
        <Field label="Class" htmlFor="class-grade">
          <Stepper id="class-grade" label="class" value={grade} min={1} max={12} onChange={changeGrade} />
        </Field>
        <Field
          label="Section or stream"
          htmlFor="class-section"
          hint={<>Shown as <strong className="font-medium text-ink">Class {preview}</strong></>}
          error={tried ? sectionError : undefined}
        >
          <Input
            id="class-section"
            name="section"
            spellCheck={false}
            autoComplete="off"
            maxLength={24}
            placeholder="A, B, Science, Commerce…"
            value={section}
            aria-invalid={tried && !!sectionError}
            onChange={(e) => { setSectionTouched(true); setSection(e.target.value) }}
          />
        </Field>
        <div className="sm:pt-8">
          {junior ? <Badge tone="accent">Junior: any teacher can take it</Badge> : <Badge>Senior: only skilled teachers</Badge>}
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">Subjects and periods per week</h3>
          <p aria-live="polite" className={cx('font-mono text-sm tabular-nums', used > slots ? 'text-danger' : 'text-ink-2')}>
            {used} <span className="font-sans">of</span> {slots}
            {used > slots && <span className="font-sans"> (too many)</span>}
          </p>
        </div>

        {!cls && items.length > 0 && (
          <p className="mt-1 text-[13px] text-ink-3">
            {lastOf(grade) ? `Copied from ${className(lastOf(grade)!)}.` : 'Filled in from the Subjects page.'} Remove any this class doesn't have.
          </p>
        )}
        {items.length === 0 ? (
          <p className="mt-3 rounded-core bg-shell/70 px-4 py-6 text-center text-sm text-ink-2">No subjects yet. Add the first one below.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {items.map((item, idx) => {
              const eligible = junior ? teachers : teachers.filter((t) => tierOf(t, item.subjectId) !== 'none')
              const sorted = [...eligible].sort((a, b) => rank(tierOf(a, item.subjectId)) - rank(tierOf(b, item.subjectId)) || a.name.localeCompare(b.name))
              return (
                <li key={idx} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-core bg-shell/60 p-2 sm:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1.3fr)_auto]">
                  <Select aria-label="Subject" value={item.subjectId} onChange={(e) => update(idx, { subjectId: e.target.value, pinnedTeacherId: null })}>
                    {subjects.filter((s) => s.id === item.subjectId || (isOffered(s, grade) && !items.some((i) => i.subjectId === s.id))).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}{isOffered(s, grade) ? '' : ` (not taught in class ${grade})`}</option>
                    ))}
                  </Select>
                  <Stepper label={`${subjects.find((s) => s.id === item.subjectId)?.name ?? 'subject'} periods per week`} value={item.periods} min={1} max={slots} onChange={(n) => update(idx, { periods: n })} />
                  <Select aria-label="Teacher" className="col-span-2 sm:col-span-1" value={item.pinnedTeacherId ?? ''} onChange={(e) => update(idx, { pinnedTeacherId: e.target.value || null })}>
                    <option value="">Any suitable teacher</option>
                    {sorted.map((t) => {
                      const tier = tierOf(t, item.subjectId)
                      return <option key={t.id} value={t.id}>{t.name}{tier === 'primary' ? ' (main subject)' : tier === 'secondary' ? ' (extra subject)' : ''}</option>
                    })}
                  </Select>
                  <IconButton label={`Remove ${subjectById.get(item.subjectId)?.name ?? 'subject'}`} className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto" onClick={() => removeItem(idx)}>
                    <X weight="light" />
                  </IconButton>
                  {!offered(item.subjectId) && (
                    <p className="col-span-full px-2 pb-1 text-[13px] leading-snug text-warn">
                      {subjectById.get(item.subjectId)?.name} is only taught in classes {formatGrades(subjectById.get(item.subjectId)?.grades ?? [])}, so it will be left out. Remove it, or change its classes on the Subjects page.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <Button
          size="sm"
          className="mt-3"
          icon={<Plus weight="bold" />}
          disabled={unused.length === 0}
          onClick={() => setItems((xs) => [...xs, { subjectId: unused[0].id, periods: 4, pinnedTeacherId: null }])}
        >
          Add Subject
        </Button>
        {available.length === 0 && (
          <p className="mt-2 text-[13px] text-ink-3">No subject is set to be taught in class {grade} yet. Choose classes for each subject on the Subjects page.</p>
        )}
      </div>

      <div className="-mx-6 -mb-4 flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit">{cls ? 'Save Changes' : 'Add Class'}</Button>
      </div>
    </form>
  )
}

const rank = (t: string) => (t === 'primary' ? 0 : t === 'secondary' ? 1 : 2)
