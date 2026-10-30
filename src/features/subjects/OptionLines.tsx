import { useState } from 'react'
import { PencilSimple, Plus, Rows, Trash, X } from '@phosphor-icons/react'
import { Button, ConfirmDialog, Dialog, Field, IconButton, Input, Segmented, Select, Shell, Stepper, ToggleChip, Swatch } from '../../components/ui'
import { className, tierOf } from '../../engine/assign'
import { slotsPerWeek } from '../../engine/blocks'
import { isOffered } from '../../engine/grades'
import { linePeriodsFor, validLines } from '../../engine/lines'
import type { LineItem, OptionLine, TeacherShare } from '../../engine/types'
import { uid, useStore } from '../../store/store'

const rank = (t: string) => (t === 'primary' ? 0 : t === 'secondary' ? 1 : 2)

/** Option lines: optional subjects that run at the same time, shared by several classes. */
export function OptionLinesSection() {
  const data = useStore((s) => s.data)
  const removeLine = useStore((s) => s.removeLine)
  const [editing, setEditing] = useState<OptionLine | 'new' | null>(null)
  const [removing, setRemoving] = useState<OptionLine | null>(null)
  const lines = data.lines ?? []
  const subjectById = new Map(data.subjects.map((s) => [s.id, s]))
  const teacherById = new Map(data.teachers.map((t) => [t.id, t]))
  const classById = new Map(data.classes.map((c) => [c.id, c]))
  const cName = (id: string) => (classById.get(id) ? className(classById.get(id)!) : '?')
  const valid = new Map(validLines(data).map((l) => [l.id, l]))

  return (
    <section aria-labelledby="lines-heading" className="mt-16">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="lines-heading" className="text-2xl font-semibold tracking-tight">Option Lines</h2>
          <p className="mt-1.5 max-w-[64ch] text-[15px] leading-relaxed text-ink-2">
            Optional subjects that run at the same time, like Physics / Nutrition / Economics. Each student takes one. Students of different classes who take the same subject sit together with one teacher.
          </p>
        </div>
        <Button icon={<Plus weight="bold" />} disabled={data.classes.length === 0} onClick={() => setEditing('new')}>Add Line</Button>
      </div>

      {lines.length === 0 ? (
        <Shell>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-accent-soft text-2xl text-accent"><Rows weight="light" /></span>
            <p className="font-medium">No option lines yet</p>
            <p className="max-w-[52ch] text-sm text-ink-2">Add one for classes like XI Science and XI Humanities, where students choose between subjects taught at the same time.</p>
          </div>
        </Shell>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {lines.map((line) => {
            const ok = valid.get(line.id)
            return (
              <li key={line.id}>
                <Shell>
                  <div className="flex items-start gap-4 p-4 pl-5">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold tracking-tight">{line.name}</h3>
                      <p className="mt-0.5 text-sm text-ink-2">
                        Classes {line.classIds.map(cName).join(', ')}
                        {ok && <span className="text-ink-3"> · {Math.max(...ok.classIds.map((c) => linePeriodsFor(ok, c)))} periods a week</span>}
                      </p>
                      <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
                        {line.items.map((i) => {
                          const s = subjectById.get(i.subjectId)
                          return (
                            <li key={i.subjectId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              {s && <Swatch color={s.color} />}
                              <span className="font-medium">{s?.name ?? 'Removed subject'}</span>
                              <span className="font-mono tabular-nums text-ink-2">{i.periods}</span>
                              <span className="text-ink-3">
                                {i.classIds.map(cName).join(' + ')} ·{' '}
                                {i.teachers.length ? i.teachers.map((t) => `${teacherById.get(t.teacherId)?.name ?? '?'} ${t.periods}`).join(', ') : 'teacher chosen automatically'}
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                      {!ok && <p className="mt-2 text-[13px] text-warn">This line has no subjects with classes and periods yet, so it is left out.</p>}
                    </div>
                    <IconButton label={`Edit ${line.name}`} onClick={() => setEditing(line)}><PencilSimple weight="light" /></IconButton>
                    <IconButton label={`Delete ${line.name}`} className="hover:text-danger" onClick={() => setRemoving(line)}><Trash weight="light" /></IconButton>
                  </div>
                </Shell>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} wide title={editing === 'new' ? 'Add option line' : `Edit ${editing ? editing.name : ''}`}>
        {editing !== null && <LineForm key={editing === 'new' ? 'new' : editing.id} line={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && removeLine(removing.id)}
        title={`Delete ${removing?.name ?? 'line'}?`}
        confirmLabel="Delete Line"
      >
        Its subjects go back to being ordinary lessons in each class, using the periods set on the Classes page.
      </ConfirmDialog>
    </section>
  )
}

function LineForm({ line, onDone }: { line: OptionLine | null; onDone: () => void }) {
  const data = useStore((s) => s.data)
  const upsertLine = useStore((s) => s.upsertLine)
  const slots = slotsPerWeek(data.settings)
  const classes = [...data.classes].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
  const classById = new Map(data.classes.map((c) => [c.id, c]))
  const [name, setName] = useState(line?.name ?? `Line ${(data.lines?.length ?? 0) + 1}`)
  const [classIds, setClassIds] = useState<string[]>(line?.classIds ?? [])
  const [items, setItems] = useState<LineItem[]>(line?.items ?? [])
  const [tried, setTried] = useState(false)

  const lineClasses = classes.filter((c) => classIds.includes(c.id))
  // Subjects taught in at least one of the line's classes.
  const offered = data.subjects.filter((s) => lineClasses.some((c) => isOffered(s, c.grade)))
  const unused = offered.filter((s) => !items.some((i) => i.subjectId === s.id))
  const update = (k: number, patch: Partial<LineItem>) => setItems((xs) => xs.map((x, i) => (i === k ? { ...x, ...patch } : x)))
  const toggleClass = (id: string) => {
    const next = classIds.includes(id) ? classIds.filter((x) => x !== id) : [...classIds, id]
    setClassIds(next)
    setItems((xs) => xs.map((i) => ({ ...i, classIds: i.classIds.filter((x) => next.includes(x)) })))
  }

  const nameError = !name.trim() ? 'Enter a name, like XI Line 1.' : undefined
  const classError = classIds.length === 0 ? 'Choose at least one class.' : undefined
  const itemError = items.length === 0
    ? 'Add at least one subject.'
    : items.some((i) => i.classIds.length === 0) ? 'Every subject needs at least one class taking it.' : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (nameError || classError || itemError) return
    upsertLine({ id: line?.id ?? uid('l'), name: name.trim(), classIds: lineClasses.map((c) => c.id), items })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-7">
      <Field label="Name" htmlFor="line-name" error={tried ? nameError : undefined}>
        <Input id="line-name" autoComplete="off" placeholder="e.g. XI Line 1" value={name} aria-invalid={tried && !!nameError} onChange={(e) => setName(e.target.value)} />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium">Classes in this line</legend>
        <p className="mt-1 text-[13px] text-ink-3">Their students choose between the subjects below, all taught at the same time.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {classes.map((c) => <ToggleChip key={c.id} pressed={classIds.includes(c.id)} onClick={() => toggleClass(c.id)}>{className(c)}</ToggleChip>)}
        </div>
        {tried && classError && <p role="alert" className="mt-2 text-[13px] text-danger">{classError}</p>}
      </fieldset>

      <div>
        <h3 className="text-sm font-medium">Subjects</h3>
        <p className="mt-1 text-[13px] text-ink-3">
          Each subject with the classes that take it and its periods a week. When classes share a subject they sit together in one lesson. A subject with fewer periods leaves its students free in the line's other periods.
        </p>
        {items.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3">
            {items.map((item, k) => (
              <LineItemRow
                key={k}
                item={item}
                classes={lineClasses.map((c) => ({ id: c.id, name: className(c), grade: c.grade }))}
                choices={offered.filter((s) => s.id === item.subjectId || !items.some((i) => i.subjectId === s.id))}
                slots={slots}
                onChange={(patch) => update(k, patch)}
                onRemove={() => setItems((xs) => xs.filter((_, i) => i !== k))}
              />
            ))}
          </ul>
        )}
        <Button
          size="sm" className="mt-3" icon={<Plus weight="bold" />}
          disabled={unused.length === 0 || lineClasses.length === 0}
          onClick={() => {
            const s = unused[0]
            setItems((xs) => [...xs, { subjectId: s.id, classIds: lineClasses.filter((c) => isOffered(s, c.grade)).map((c) => c.id), periods: 4, teachers: [] }])
          }}
        >
          Add Subject
        </Button>
        {lineClasses.length === 0 && <p className="mt-2 text-[13px] text-ink-3">Choose the line's classes first.</p>}
        {tried && itemError && <p role="alert" className="mt-2 text-[13px] text-danger">{itemError}</p>}
        {lineClasses.length > 0 && items.length > 0 && (
          <p className="mt-3 text-[13px] text-ink-2">
            {lineClasses.map((c) => `${className(classById.get(c.id)!)}: ${Math.max(0, ...items.filter((i) => i.classIds.includes(c.id)).map((i) => i.periods))} periods a week in this line`).join(' · ')}
          </p>
        )}
      </div>

      <div className="-mx-6 -mb-4 flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit">{line ? 'Save Changes' : 'Add Line'}</Button>
      </div>
    </form>
  )
}

function LineItemRow({ item, classes, choices, slots, onChange, onRemove }: {
  item: LineItem
  classes: { id: string; name: string; grade: number }[]
  choices: { id: string; name: string; grades?: number[] }[]
  slots: number
  onChange: (patch: Partial<LineItem>) => void
  onRemove: () => void
}) {
  const teachers = useStore((s) => s.data.teachers)
  const subjects = useStore((s) => s.data.subjects)
  const subject = subjects.find((s) => s.id === item.subjectId)
  const sorted = [...teachers].sort((a, b) => rank(tierOf(a, item.subjectId)) - rank(tierOf(b, item.subjectId)) || a.name.localeCompare(b.name))
  const chosen = item.teachers.length > 0
  const setShares = (shares: TeacherShare[]) => onChange({ teachers: shares, ...(shares.length ? { periods: shares.reduce((n, s) => n + s.periods, 0) } : {}) })
  const unusedTeachers = sorted.filter((t) => !item.teachers.some((s) => s.teacherId === t.id))

  return (
    <li className="flex flex-col gap-3 rounded-core bg-shell/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Subject" className="min-w-40 flex-1" value={item.subjectId} onChange={(e) => {
          const s = subjects.find((x) => x.id === e.target.value)
          onChange({ subjectId: e.target.value, teachers: [], classIds: classes.filter((c) => isOffered(s, c.grade)).map((c) => c.id) })
        }}>
          {choices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        {chosen ? (
          <span className="px-2 font-mono text-sm tabular-nums text-ink-2">{item.periods} <span className="font-sans">periods</span></span>
        ) : (
          <Stepper label={`${subject?.name ?? 'subject'} periods a week`} value={item.periods} min={1} max={slots} onChange={(n) => onChange({ periods: n })} />
        )}
        <IconButton label={`Remove ${subject?.name ?? 'subject'}`} onClick={onRemove}><X weight="light" /></IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-ink-2">Taken by</span>
        {classes.map((c) => (
          <ToggleChip key={c.id} pressed={item.classIds.includes(c.id)} onClick={() => onChange({ classIds: item.classIds.includes(c.id) ? item.classIds.filter((x) => x !== c.id) : [...item.classIds, c.id] })}>
            {c.name}
          </ToggleChip>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Segmented
          label={`${subject?.name ?? 'Subject'} teachers`}
          value={chosen ? 'chosen' : 'auto'}
          options={[{ value: 'auto', label: 'Any suitable teacher' }, { value: 'chosen', label: 'Choose teachers' }]}
          onChange={(v) => setShares(v === 'auto' ? [] : [{ teacherId: sorted[0]?.id ?? '', periods: item.periods }])}
        />
        {chosen && (
          <>
            {item.teachers.map((s, k) => (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <Select aria-label={`Teacher ${k + 1}`} className="min-w-0 flex-1" value={s.teacherId}
                  onChange={(e) => setShares(item.teachers.map((x, i) => (i === k ? { ...x, teacherId: e.target.value } : x)))}>
                  {sorted.filter((t) => t.id === s.teacherId || !item.teachers.some((x) => x.teacherId === t.id)).map((t) => {
                    const tier = tierOf(t, item.subjectId)
                    return <option key={t.id} value={t.id}>{t.name}{tier === 'primary' ? ' (main subject)' : tier === 'secondary' ? ' (extra subject)' : ''}</option>
                  })}
                </Select>
                <Stepper label={`periods for teacher ${k + 1}`} value={s.periods} min={1} max={slots}
                  onChange={(n) => setShares(item.teachers.map((x, i) => (i === k ? { ...x, periods: n } : x)))} />
                <IconButton label={`Remove teacher ${k + 1}`} disabled={item.teachers.length === 1}
                  onClick={() => setShares(item.teachers.filter((_, i) => i !== k))}><X weight="light" /></IconButton>
              </div>
            ))}
            <Button size="sm" variant="ghost" className="self-start" icon={<Plus weight="bold" />} disabled={unusedTeachers.length === 0}
              onClick={() => setShares([...item.teachers, { teacherId: unusedTeachers[0].id, periods: 1 }])}>
              Add Teacher
            </Button>
          </>
        )}
      </div>
    </li>
  )
}
