import { useMemo, useState } from 'react'
import { ChartBar } from '@phosphor-icons/react'
import { Button, EmptyState, PageHeader, Segmented, Shell, cx } from '../../components/ui'
import { isAdjacent, restCapacityPerDay } from '../../engine/blocks'
import { teacherSlots } from '../../engine/evaluate'
import { useStore } from '../../store/store'

type Sort = 'load' | 'rest' | 'name'

interface Row {
  id: string
  name: string
  code: string
  days: number[]
  total: number
  maxPerWeek: number
  backToBack: number
}

/** Maps periods in a day onto the 7-step sequential ramp. */
const step = (v: number, P: number) => (v <= 0 ? 0 : Math.max(1, Math.min(7, Math.round((v / P) * 7))))

export function WorkloadPage() {
  const data = useStore((s) => s.data)
  const routine = useStore((s) => s.routine)
  const [sort, setSort] = useState<Sort>('load')
  const { settings } = data
  const P = settings.periodsPerDay
  const D = settings.dayNames.length
  const restCap = restCapacityPerDay(settings)

  const rows: Row[] = useMemo(() => {
    if (!routine) return []
    const slots = teacherSlots(data, routine.grid)
    return data.teachers.map((t) => {
      const week = slots.get(t.id) ?? []
      const days = Array.from({ length: D }, (_, d) => week.slice(d * P, d * P + P).reduce((n, s) => n + s.length, 0))
      let backToBack = 0
      for (let s = 0; s < week.length; s++) {
        if (week[s].length && isAdjacent(settings, s % P) && week[s + 1]?.length) backToBack++
      }
      return { id: t.id, name: t.name, code: t.code, days, total: days.reduce((a, b) => a + b, 0), maxPerWeek: t.maxPerWeek, backToBack }
    })
  }, [data, routine, settings, D, P])

  const sorted = useMemo(() => {
    const r = [...rows]
    if (sort === 'name') r.sort((a, b) => a.name.localeCompare(b.name))
    if (sort === 'load') r.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    if (sort === 'rest') r.sort((a, b) => b.backToBack - a.backToBack || b.total - a.total)
    return r
  }, [rows, sort])

  if (!routine) {
    return (
      <>
        <PageHeader title="Workload" description="How many periods each teacher teaches, day by day." />
        <EmptyState
          icon={<ChartBar weight="light" />}
          title="Build a routine first"
          action={<Button variant="primary" onClick={() => { window.location.hash = 'routine' }}>Go to Routine</Button>}
        >
          Workload is worked out from the generated routine.
        </EmptyState>
      </>
    )
  }

  const scaleMax = Math.max(1, ...rows.map((r) => Math.max(r.total, r.maxPerWeek)))
  const teaching = rows.filter((r) => r.total > 0)
  const avg = teaching.length ? teaching.reduce((n, r) => n + r.total, 0) / teaching.length : 0
  const heaviest = [...rows].sort((a, b) => b.total - a.total)[0]
  const overDays = rows.reduce((n, r) => n + r.days.filter((v) => v > restCap).length, 0)
  const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

  return (
    <>
      <PageHeader
        title="Workload"
        description={`Periods per teacher per day. With your bell schedule, a teacher can rest after every class if they teach ${restCap} or fewer periods in a day.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="Average per teacher" value={`${fmt.format(avg)}`} note="periods a week" delay="" />
        <Tile label="Heaviest week" value={`${heaviest?.total ?? 0}`} note={heaviest?.name ?? ''} delay="[animation-delay:40ms]" />
        <Tile label="Days above the rest limit" value={`${overDays}`} note={`more than ${restCap} periods`} tone={overDays > 0 ? 'warn' : undefined} delay="[animation-delay:80ms]" />
        <Tile label="Teachers not used" value={`${rows.length - teaching.length}`} note={`of ${rows.length}`} delay="[animation-delay:120ms]" />
      </div>

      <Shell as="section" className="animate-rise [animation-delay:160ms]">
        <div className="p-4 md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Periods per day</h2>
            <Segmented<Sort>
              label="Sort teachers by"
              value={sort}
              onChange={setSort}
              options={[{ value: 'load', label: 'Busiest' }, { value: 'rest', label: 'Least rest' }, { value: 'name', label: 'Name' }]}
            />
          </div>

          <div className="-mx-1.5 overflow-x-auto px-1.5">
            <table className="w-full min-w-[720px] border-separate border-spacing-x-1 border-spacing-y-1 text-sm">
              <caption className="sr-only">Periods taught by each teacher on each day, with weekly totals and back-to-back periods</caption>
              <thead>
                <tr className="text-xs font-medium text-ink-3">
                  <th scope="col" className="pb-2 text-left font-medium">Teacher</th>
                  {settings.dayNames.map((d) => <th key={d} scope="col" className="w-14 pb-2 text-center font-medium">{d}</th>)}
                  <th scope="col" className="w-[28%] pb-2 pl-3 text-left font-medium">Week</th>
                  <th scope="col" className="w-24 pb-2 text-right font-medium">No rest</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="sticky left-0 z-[1] max-w-48 truncate bg-surface pr-3 text-left font-medium">{r.name}</th>
                    {r.days.map((v, d) => {
                      const k = step(v, P)
                      const over = v > restCap
                      return (
                        <td key={d} className="p-0">
                          <div
                            title={`${r.name}, ${settings.dayNames[d]}: ${v} ${v === 1 ? 'period' : 'periods'}${over ? `, more than the ${restCap} that allow full rest` : ''}`}
                            className={cx(
                              'flex h-9 items-center justify-center rounded-lg font-mono text-[13px] tabular-nums',
                              k === 0 && 'border border-dashed border-line-strong text-ink-3',
                              over && 'ring-2 ring-warn ring-offset-1 ring-offset-surface',
                            )}
                            style={k === 0 ? undefined : { background: `var(--seq-${k})`, color: k >= 5 ? 'var(--seq-ink-high)' : 'var(--seq-ink-low)' }}
                          >
                            {v}
                            {over && <span className="sr-only"> (above the rest limit)</span>}
                          </div>
                        </td>
                      )
                    })}
                    <td className="pl-3">
                      <div className="flex items-center gap-3">
                        <div className="relative h-4 flex-1" aria-hidden>
                          <div
                            className="absolute inset-y-0 left-0 rounded-r-[4px] bg-accent"
                            style={{ width: `${(r.total / scaleMax) * 100}%` }}
                          />
                          <div
                            className="absolute -inset-y-1 w-0.5 rounded-full bg-ink-3"
                            style={{ left: `calc(${(r.maxPerWeek / scaleMax) * 100}% - 1px)` }}
                            title={`Limit ${r.maxPerWeek}`}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right font-mono text-[13px] tabular-nums">
                          {r.total}<span className="text-ink-3">/{r.maxPerWeek}</span>
                        </span>
                      </div>
                    </td>
                    <td className={cx('text-right font-mono text-[13px] tabular-nums', r.backToBack > 0 ? 'text-warn' : 'text-ink-3')}>
                      {r.backToBack}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 px-1 text-[13px] text-ink-2">
            <span className="inline-flex items-center gap-2">
              <span>Fewer</span>
              <span aria-hidden className="flex gap-0.5">
                {[1, 2, 3, 4, 5, 6, 7].map((k) => <span key={k} className="h-3 w-4 first:rounded-l-[4px] last:rounded-r-[4px]" style={{ background: `var(--seq-${k})` }} />)}
              </span>
              <span>More periods</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="size-3 rounded-[4px] ring-2 ring-warn ring-offset-1 ring-offset-surface" />
              Above {restCap} a day, so some classes run back to back
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="h-3.5 w-0.5 rounded-full bg-ink-3" />
              Weekly limit
            </span>
          </div>
        </div>
      </Shell>
    </>
  )
}

function Tile({ label, value, note, tone, delay }: { label: string; value: string; note: string; tone?: 'warn'; delay: string }) {
  return (
    <Shell className={cx('animate-rise', delay)}>
      <div className="flex h-full flex-col justify-between gap-5 p-5">
        <p className="text-sm font-medium text-ink-2">{label}</p>
        <div>
          <p className={cx('font-mono text-3xl font-medium tabular-nums', tone === 'warn' ? 'text-warn' : 'text-ink')}>{value}</p>
          <p className="mt-1 truncate text-[13px] text-ink-3">{note}</p>
        </div>
      </div>
    </Shell>
  )
}
