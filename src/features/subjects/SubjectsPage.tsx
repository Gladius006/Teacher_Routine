import { useState } from 'react'
import { BookOpenText, Check, PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { Button, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, PageHeader, Shell, cx } from '../../components/ui'
import type { Subject } from '../../engine/types'
import { uid, useStore } from '../../store/store'

export const SUBJECT_COLORS = [
  '#3b6fd8', '#6d4fd1', '#a21caf', '#be185d', '#dc2626', '#c2410c',
  '#b45309', '#4d7c0f', '#0f8a6a', '#047857', '#0e7490', '#475569',
]
const COLOR_NAMES = ['Blue', 'Violet', 'Magenta', 'Pink', 'Red', 'Orange', 'Amber', 'Olive', 'Teal', 'Green', 'Cyan', 'Slate']

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
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length])
  const [tried, setTried] = useState(false)

  const finalCode = (codeTouched ? code : codeFrom(name)).trim().toUpperCase()
  const nameError = !name.trim() ? 'Enter a subject name.' : subjects.some((s) => s.id !== subject?.id && s.name.toLowerCase() === name.trim().toLowerCase()) ? 'A subject with this name already exists.' : undefined
  const codeError = !finalCode ? 'Enter a short code, like ENG.' : subjects.some((s) => s.id !== subject?.id && s.code === finalCode) ? `${finalCode} is already used by another subject.` : undefined

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    if (nameError || codeError) {
      document.getElementById(nameError ? 'subj-name' : 'subj-code')?.focus()
      return
    }
    upsertSubject({ id: subject?.id ?? uid('s'), name: name.trim(), code: finalCode, color })
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
        <legend className="text-sm font-medium">Color</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUBJECT_COLORS.map((c, ci) => (
            <button
              key={c}
              type="button"
              aria-label={COLOR_NAMES[ci]}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cx(
                'flex size-9 items-center justify-center rounded-full text-white transition-transform duration-300 ease-(--ease-out) hover:scale-110',
                color === c && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
              )}
              style={{ background: c }}
            >
              {color === c && <Check weight="bold" aria-hidden />}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="-mx-6 -mb-4 flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button variant="primary" type="submit">{subject ? 'Save Changes' : 'Add Subject'}</Button>
      </div>
    </form>
  )
}
