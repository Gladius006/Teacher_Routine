import { useMemo, useState } from 'react'
import { CopySimple, PencilSimple, Plus, Trash, UsersThree, X } from '@phosphor-icons/react'
import { Badge, Button, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader, Select, Shell, Stepper, cx } from '../../components/ui'
import { className, isJunior, tierOf } from '../../engine/assign'
import { slotsPerWeek } from '../../engine/blocks'
import type { ClassSection, CurriculumItem, Subject } from '../../engine/types'
import { uid, useStore } from '../../store/store'

export function ClassesPage() {
  const classes = useStore((s) => s.data.classes)
  const subjects = useStore((s) => s.data.subjects)
  const settings = useStore((s) => s.data.settings)
  const removeClass = useStore((s) => s.removeClass)
  const copyCurriculum = useStore((s) => s.copyCurriculum)
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
          Add a class like 9A, then set how many periods each subject gets per week.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-12">
          {grades.map(([grade, list], gi) => (
            <section key={grade} aria-labelledby={`grade-${grade}`} className="animate-rise" style={{ animationDelay: `${Math.min(gi, 8) * 50}ms` }}>
              <div className="mb-4 flex items-center gap-3">
                <h2 id={`grade-${grade}`} className="text-xl font-semibold tracking-tight">Class {grade}</h2>
                {isJunior(list[0], settings)
                  ? <Badge tone="accent">Junior: any teacher</Badge>
                  : <Badge>Senior: skilled teachers only</Badge>}
              </div>
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {list.map((c) => {
                  const used = c.curriculum.reduce((n, i) => n + i.periods, 0)
                  const over = used > slots
                  return (
                    <li key={c.id}>
                      <Shell>
                        <div className="p-5">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-lg font-semibold tracking-tight">{className(c)}</h3>
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
                          <CompositionBar items={c.curriculum} slots={slots} byId={subjectById} />
                          {over && <p className="mt-2 text-[13px] text-danger">{used - slots} more than the week has. Remove some periods.</p>}
                          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                            {c.curriculum.map((i) => {
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
  const [section, setSection] = useState(cls?.section ?? 'A')
  const [items, setItems] = useState<CurriculumItem[]>(cls?.curriculum ?? [])
  const [tried, setTried] = useState(false)
  const slots = slotsPerWeek(settings)
  const used = items.reduce((n, i) => n + i.periods, 0)
  const junior = grade <= settings.juniorMaxGrade

  const sectionError = !section.trim()
    ? 'Enter a section, like A.'
    : classes.some((c) => c.id !== cls?.id && c.grade === grade && c.section.toLowerCase() === section.trim().toLowerCase())
      ? `Class ${grade}${section.trim()} already exists.`
      : undefined

  const unused = subjects.filter((s) => !items.some((i) => i.subjectId === s.id))
  const update = (idx: number, patch: Partial<CurriculumItem>) => setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, ...patch } : x)))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (sectionError) {
      document.getElementById('class-section')?.focus()
      return
    }
    upsertClass({ id: cls?.id ?? uid('c'), grade, section: section.trim(), curriculum: items.filter((i) => i.periods > 0) })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-7">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_10rem_1fr] sm:items-start">
        <Field label="Class" htmlFor="class-grade">
          <Stepper id="class-grade" label="class" value={grade} min={1} max={12} onChange={setGrade} />
        </Field>
        <Field label="Section" htmlFor="class-section" error={tried ? sectionError : undefined}>
          <Input id="class-section" name="section" spellCheck={false} maxLength={8} placeholder="A" value={section} aria-invalid={tried && !!sectionError} onChange={(e) => setSection(e.target.value)} />
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
                    {subjects.filter((s) => s.id === item.subjectId || !items.some((i) => i.subjectId === s.id)).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
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
                  <IconButton label="Remove subject" className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto" onClick={() => setItems((xs) => xs.filter((_, i) => i !== idx))}>
                    <X weight="light" />
                  </IconButton>
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
      </div>

      <div className="-mx-6 -mb-4 flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit">{cls ? 'Save Changes' : 'Add Class'}</Button>
      </div>
    </form>
  )
}

const rank = (t: string) => (t === 'primary' ? 0 : t === 'secondary' ? 1 : 2)
