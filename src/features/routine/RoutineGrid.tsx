import type { ReactNode } from 'react'
import { Coffee } from '@phosphor-icons/react'
import { cx } from '../../components/ui'
import type { Settings } from '../../engine/types'

export interface GridCell {
  key: string
  color?: string
  title?: ReactNode
  subtitle?: ReactNode
  label: string
  /** Teacher has no rest before or after this period. */
  noRest?: boolean
  clash?: boolean
}

/**
 * Days as rows, periods as columns, with the lunch break drawn between periods.
 * Scrolls sideways on small screens with the day column pinned.
 */
export function RoutineGrid({ settings, cells, highlight, caption }: {
  settings: Settings
  cells: (GridCell | null)[]
  highlight?: { day: number; period: number } | null
  caption: string
}) {
  const P = settings.periodsPerDay
  const lunch = settings.lunchAfter !== null && settings.lunchAfter > 0 && settings.lunchAfter < P ? settings.lunchAfter : null
  const cols = Array.from({ length: P }, (_, p) => p)

  return (
    <div className="-mx-1.5 overflow-x-auto px-1.5 pb-1">
      <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-1.5 text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="w-14 text-xs font-medium text-ink-3"><span className="sr-only">Day</span></th>
            {cols.map((p) => (
              <FragmentWithLunch key={p} lunchAfter={lunch === p + 1}>
                <th scope="col" className="pb-1 text-center font-mono text-xs font-medium tabular-nums text-ink-3">{p + 1}</th>
              </FragmentWithLunch>
            ))}
          </tr>
        </thead>
        <tbody>
          {settings.dayNames.map((day, d) => (
            <tr key={day}>
              <th scope="row" className="sticky left-0 z-[1] bg-surface pr-1 text-sm font-medium text-ink-2">{day}</th>
              {cols.map((p) => {
                const cell = cells[d * P + p]
                const hl = highlight?.day === d && highlight?.period === p
                return (
                  <FragmentWithLunch key={p} lunchAfter={lunch === p + 1} lunchRow={d === 0} rows={settings.dayNames.length}>
                    <td className="p-0 align-top">
                      {cell ? (
                        <div
                          title={cell.label}
                          className={cx(
                            'relative flex h-[4.25rem] min-w-0 flex-col justify-center overflow-hidden rounded-[10px] py-2 pl-3 pr-2 transition-shadow duration-300',
                            cell.clash ? 'bg-danger-soft ring-1 ring-danger/50' : cell.noRest ? 'bg-warn-soft ring-1 ring-warn/40' : 'bg-shell/80',
                            hl && 'ring-2! ring-accent! shadow-lift',
                          )}
                        >
                          <span aria-hidden className="absolute inset-y-2 left-1 w-[3px] rounded-full" style={{ background: cell.color }} />
                          <span className="truncate text-[13px] font-semibold leading-tight">{cell.title}</span>
                          <span className="mt-0.5 truncate text-xs leading-tight text-ink-2">{cell.subtitle}</span>
                          {cell.clash && <span className="sr-only">. Clash: teacher is in two classes at once.</span>}
                          {!cell.clash && cell.noRest && <span className="sr-only">. No rest next to this period.</span>}
                        </div>
                      ) : (
                        <div
                          className={cx('flex h-[4.25rem] items-center justify-center rounded-[10px] text-xs text-ink-3 border border-dashed border-line-strong', hl && 'ring-2 ring-accent')}
                        >
                          Free
                        </div>
                      )}
                    </td>
                  </FragmentWithLunch>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FragmentWithLunch({ children, lunchAfter, lunchRow, rows }: { children: ReactNode; lunchAfter: boolean; lunchRow?: boolean; rows?: number }) {
  return (
    <>
      {children}
      {lunchAfter && (lunchRow === undefined ? (
        <th scope="col" className="w-9"><span className="sr-only">Lunch</span></th>
      ) : lunchRow ? (
        <td rowSpan={rows} className="relative w-9 p-0">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[10px] bg-accent-soft py-3 text-accent">
            <Coffee aria-hidden weight="light" className="text-lg" />
            <span className="sr-only">Lunch break</span>
          </div>
        </td>
      ) : null)}
    </>
  )
}
