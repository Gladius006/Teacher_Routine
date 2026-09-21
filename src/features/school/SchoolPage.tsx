import { useRef, useState } from 'react'
import { ArrowRight, ArrowUpRight, BookOpenText, ChalkboardTeacher, CheckCircle, Circle, DownloadSimple, Sparkle, Table, Trash, UploadSimple, UsersThree } from '@phosphor-icons/react'
import { Badge, Button, ConfirmDialog, Field, PageHeader, Select, Shell, Stepper, ToggleChip, cx } from '../../components/ui'
import { restCapacityPerDay, slotsPerWeek } from '../../engine/blocks'
import { emptySchool, sampleSchool } from '../../engine/sample'
import { hashInputs } from '../../engine/schedule'
import { exportSchool, importSchool } from '../../store/io'
import { useStore } from '../../store/store'

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function SchoolPage() {
  const started = useStore((s) => s.started)
  const data = useStore((s) => s.data)
  const empty = data.subjects.length === 0 && data.teachers.length === 0 && data.classes.length === 0
  if (!started && empty) return <Welcome />
  return (
    <>
      <PageHeader
        title="Your school"
        description="Set the bell schedule once. Then add subjects, teachers and classes, and generate the routine."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <BellSchedule />
        <div className="flex flex-col gap-6 lg:col-span-5">
          <Progress />
          <DataCard />
        </div>
      </div>
    </>
  )
}

function Welcome() {
  const replaceData = useStore((s) => s.replaceData)
  return (
    <section className="grid min-h-[calc(100dvh-7rem)] grid-cols-1 items-center gap-10 py-12 lg:grid-cols-12 lg:gap-16">
      <div className="animate-rise lg:col-span-6">
        <h1 className="text-[2.5rem] font-semibold leading-[1.05] tracking-[-0.035em] md:text-6xl">
          A fair routine for every teacher, in minutes.
        </h1>
        <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-ink-2">
          Add your teachers and classes. The routine is built so nobody is double-booked and everyone rests after a class.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button variant="primary" trailingIcon={<ArrowRight weight="bold" />} onClick={() => replaceData(sampleSchool())}>
            Try a Sample School
          </Button>
          <Button onClick={() => replaceData(emptySchool())}>Start From Scratch</Button>
        </div>
      </div>
      <WelcomeSteps />
    </section>
  )
}

const DELAYS = ['[animation-delay:120ms]', '[animation-delay:210ms]', '[animation-delay:300ms]']

function WelcomeSteps() {
  const steps = [
    { icon: <ChalkboardTeacher weight="light" />, title: 'Teachers and their skills', text: 'Main subjects and extra subjects each teacher can take.' },
    { icon: <UsersThree weight="light" />, title: 'Classes and periods', text: 'How many periods each subject gets in a week.' },
    { icon: <Table weight="light" />, title: 'One click to generate', text: 'Senior classes get skilled teachers. Classes 5 to 7 can go to anyone.' },
  ]
  return (
    <div className="grid gap-4 lg:col-span-6 lg:pl-6">
      {steps.map((s, i) => (
        <Shell key={s.title} className={cx('animate-rise', DELAYS[i], i === 1 && 'lg:ml-10', i === 2 && 'lg:ml-20')}>
          <div className="flex items-start gap-4 p-5">
            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xl text-accent">{s.icon}</span>
            <div>
              <h2 className="font-semibold tracking-tight">{s.title}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{s.text}</p>
            </div>
          </div>
        </Shell>
      ))}
    </div>
  )
}

function BellSchedule() {
  const settings = useStore((s) => s.data.settings)
  const setSettings = useStore((s) => s.setSettings)
  const teachers = useStore((s) => s.data.teachers)
  const upsertTeacher = useStore((s) => s.upsertTeacher)
  const [applied, setApplied] = useState(false)
  const P = settings.periodsPerDay

  const toggleDay = (d: string) => {
    const on = settings.dayNames.includes(d)
    if (on && settings.dayNames.length === 1) return
    setSettings({ dayNames: ALL_DAYS.filter((x) => (x === d ? !on : settings.dayNames.includes(x))) })
  }
  const setPeriods = (n: number) =>
    setSettings({
      periodsPerDay: n,
      lunchAfter: settings.lunchAfter !== null && settings.lunchAfter >= n ? null : settings.lunchAfter,
      maxSubjectPerDay: Math.min(settings.maxSubjectPerDay, n),
    })

  const rest = restCapacityPerDay(settings)
  const applyLimits = () => {
    teachers.forEach((t) => upsertTeacher({ ...t, maxPerDay: settings.defaultMaxPerDay, maxPerWeek: settings.defaultMaxPerWeek }))
    setApplied(true)
    window.setTimeout(() => setApplied(false), 2400)
  }

  return (
    <Shell as="section" className="animate-rise lg:col-span-7">
      <div className="p-6 md:p-8">
        <h2 className="text-xl font-semibold tracking-tight">Bell schedule</h2>
        <p className="mt-1 text-[15px] text-ink-2">
          {slotsPerWeek(settings)} periods a week per class. A teacher can rest after every class for up to{' '}
          <strong className="font-semibold text-ink">{rest} periods a day</strong>.
        </p>

        <fieldset className="mt-8">
          <legend className="text-sm font-medium">Working days</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {ALL_DAYS.map((d) => (
              <ToggleChip key={d} pressed={settings.dayNames.includes(d)} onClick={() => toggleDay(d)}>{d}</ToggleChip>
            ))}
          </div>
        </fieldset>

        <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-7 sm:grid-cols-2">
          <Field label="Periods per day" htmlFor="ppd">
            <Stepper id="ppd" label="periods per day" value={P} min={1} max={12} onChange={setPeriods} />
          </Field>
          <Field label="Lunch break" htmlFor="lunch" hint="Lunch counts as a rest period.">
            <Select id="lunch" value={settings.lunchAfter ?? ''} onChange={(e) => setSettings({ lunchAfter: e.target.value === '' ? null : Number(e.target.value) })}>
              <option value="">No break</option>
              {Array.from({ length: Math.max(0, P - 1) }, (_, i) => (
                <option key={i} value={i + 1}>After period {i + 1}</option>
              ))}
            </Select>
          </Field>
          <Field label="Junior classes go up to" htmlFor="junior" hint={`Any teacher can take class ${settings.juniorMaxGrade} and below.`}>
            <Stepper id="junior" label="junior class cut-off grade" value={settings.juniorMaxGrade} min={0} max={12} onChange={(n) => setSettings({ juniorMaxGrade: n })} />
          </Field>
          <Field label="Same subject per day, at most" htmlFor="subj" hint="Per class. Keeps subjects spread over the week.">
            <Stepper id="subj" label="same subject per day" value={settings.maxSubjectPerDay} min={1} max={P} onChange={(n) => setSettings({ maxSubjectPerDay: n })} />
          </Field>
        </div>

        <div className="mt-10 border-t border-line pt-8">
          <h3 className="font-semibold tracking-tight">Default teacher limits</h3>
          <p className="mt-1 text-sm text-ink-2">Used for new teachers. You can change them for each teacher.</p>
          <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-7 sm:grid-cols-2">
            <Field label="Periods per day" htmlFor="dmax">
              <Stepper id="dmax" label="default periods per day" value={settings.defaultMaxPerDay} min={1} max={P} onChange={(n) => setSettings({ defaultMaxPerDay: n })} />
            </Field>
            <Field label="Periods per week" htmlFor="wmax">
              <Stepper id="wmax" label="default periods per week" value={settings.defaultMaxPerWeek} min={1} max={84} onChange={(n) => setSettings({ defaultMaxPerWeek: n })} />
            </Field>
          </div>
          {teachers.length > 0 && (
            <div className="mt-6 flex items-center gap-3">
              <Button size="sm" variant="secondary" onClick={applyLimits}>Apply to All {teachers.length} Teachers</Button>
              <span aria-live="polite" className="text-sm text-accent">{applied ? 'Applied.' : ''}</span>
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}

function Progress() {
  const data = useStore((s) => s.data)
  const routine = useStore((s) => s.routine)
  const stale = routine !== null && routine.inputHash !== hashInputs(data)
  const items = [
    { href: '#subjects', icon: <BookOpenText weight="light" />, label: 'Subjects', count: data.subjects.length, done: data.subjects.length > 0 },
    { href: '#teachers', icon: <ChalkboardTeacher weight="light" />, label: 'Teachers', count: data.teachers.length, done: data.teachers.length > 0 },
    { href: '#classes', icon: <UsersThree weight="light" />, label: 'Classes', count: data.classes.length, done: data.classes.length > 0 },
  ]
  const ready = items.every((i) => i.done)
  return (
    <Shell as="section" className="animate-rise [animation-delay:80ms]">
      <div className="p-6 md:p-8">
        <h2 className="text-xl font-semibold tracking-tight">Setup</h2>
        <ul className="mt-5 flex flex-col gap-1">
          {items.map((i) => (
            <li key={i.label}>
              <a href={i.href} className="group flex items-center gap-3 rounded-core px-3 py-3 transition-colors hover:bg-shell">
                {i.done
                  ? <CheckCircle weight="fill" className="text-xl text-accent" aria-label="Done" />
                  : <Circle weight="light" className="text-xl text-ink-3" aria-label="To do" />}
                <span aria-hidden className="text-lg text-ink-3">{i.icon}</span>
                <span className="flex-1 font-medium">{i.label}</span>
                <span className="font-mono text-sm tabular-nums text-ink-2">{i.count}</span>
                <ArrowUpRight aria-hidden weight="light" className="text-ink-3 transition-transform duration-300 ease-(--ease-out) group-hover:-translate-y-px group-hover:translate-x-0.5" />
              </a>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-core bg-shell/70 px-4 py-3.5">
          <div className="text-sm">
            {routine === null ? (
              <span className="text-ink-2">No routine yet.</span>
            ) : stale ? (
              <Badge tone="warn">Routine out of date</Badge>
            ) : (
              <Badge tone="accent">Routine up to date</Badge>
            )}
          </div>
          <Button
            size="sm"
            variant={ready ? 'primary' : 'secondary'}
            disabled={!ready}
            trailingIcon={<Sparkle weight="fill" />}
            onClick={() => { window.location.hash = 'routine' }}
          >
            {routine === null ? 'Generate Routine' : 'Open Routine'}
          </Button>
        </div>
      </div>
    </Shell>
  )
}

function DataCard() {
  const data = useStore((s) => s.data)
  const replaceData = useStore((s) => s.replaceData)
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<'sample' | 'clear' | null>(null)

  const download = () => {
    const blob = new Blob([exportSchool(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `school-routine-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage({ tone: 'ok', text: 'Backup file saved.' })
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      replaceData(importSchool(await file.text()))
      setMessage({ tone: 'ok', text: `Loaded ${file.name}.` })
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Could not read that file.' })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Shell as="section" className="animate-rise [animation-delay:160ms]">
      <div className="p-6 md:p-8">
        <h2 className="text-xl font-semibold tracking-tight">Your data</h2>
        <p className="mt-1 text-[15px] leading-relaxed text-ink-2">
          Saved in this browser automatically. Download a backup to move it to another computer.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" icon={<DownloadSimple weight="light" />} onClick={download}>Download Backup</Button>
          <Button size="sm" icon={<UploadSimple weight="light" />} onClick={() => fileRef.current?.click()}>Open Backup</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-hidden tabIndex={-1} onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <p aria-live="polite" className={cx('mt-3 min-h-5 text-sm', message?.tone === 'error' ? 'text-danger' : 'text-accent')}>
          {message?.text}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-5">
          <Button size="sm" variant="ghost" icon={<Sparkle weight="light" />} onClick={() => setConfirm('sample')}>Load Sample School</Button>
          <Button size="sm" variant="ghost" className="text-danger hover:text-danger" icon={<Trash weight="light" />} onClick={() => setConfirm('clear')}>Clear Everything</Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'sample'}
        onClose={() => setConfirm(null)}
        onConfirm={() => replaceData(sampleSchool())}
        title="Replace your data with the sample school?"
        confirmLabel="Load Sample"
      >
        Your current subjects, teachers, classes and routine will be replaced. Download a backup first if you want to keep them.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'clear'}
        onClose={() => setConfirm(null)}
        onConfirm={() => replaceData({ ...emptySchool(), settings: data.settings })}
        title="Clear all subjects, teachers and classes?"
        confirmLabel="Clear Everything"
      >
        The bell schedule is kept. Everything else, including the routine, is removed. This can't be undone unless you have a backup.
      </ConfirmDialog>
    </Shell>
  )
}
