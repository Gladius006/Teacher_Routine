import { className } from '../../engine/assign'
import { teacherSlots } from '../../engine/evaluate'
import type { Routine, SchoolData } from '../../engine/types'

/** Plain black-on-white routines, one per page, shown only when printing. */
export function PrintSheet({ data, routine, mode }: { data: SchoolData; routine: Routine; mode: 'class' | 'teacher' }) {
  const { settings } = data
  const P = settings.periodsPerDay
  const subject = new Map(data.subjects.map((s) => [s.id, s]))
  const teacher = new Map(data.teachers.map((t) => [t.id, t]))
  const cls = new Map(data.classes.map((c) => [c.id, c]))
  const slots = teacherSlots(data, routine.grid)

  const pages =
    mode === 'class'
      ? [...data.classes]
          .sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
          .map((c) => ({
            id: c.id,
            title: `Class ${className(c)}`,
            cell: (s: number) => {
              const x = routine.grid[c.id]?.[s]
              return x ? [subject.get(x.subjectId)?.name ?? '', teacher.get(x.teacherId)?.name ?? ''] : null
            },
          }))
      : [...data.teachers]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((t) => ({
            id: t.id,
            title: t.name,
            cell: (s: number) => {
              const here = slots.get(t.id)?.[s] ?? []
              return here.length
                ? [here.map((h) => className(cls.get(h.classId)!)).join(' + '), subject.get(here[0].subjectId)?.name ?? '']
                : null
            },
          }))

  return (
    <div className="print-only text-black">
      {pages.map((page) => (
        <section key={page.id} className="print-page">
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 10 }}>{page.title}</h1>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={cellStyle}>Day</th>
                {Array.from({ length: P }, (_, p) => (
                  <th key={p} style={{ ...cellStyle, borderRight: settings.lunchAfter === p + 1 ? '3px double #000' : cellStyle.border }}>
                    {p + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {settings.dayNames.map((day, d) => (
                <tr key={day}>
                  <th style={cellStyle}>{day}</th>
                  {Array.from({ length: P }, (_, p) => {
                    const v = page.cell(d * P + p)
                    return (
                      <td key={p} style={{ ...cellStyle, height: 44, borderRight: settings.lunchAfter === p + 1 ? '3px double #000' : cellStyle.border }}>
                        {v ? (<><strong>{v[0]}</strong><br />{v[1]}</>) : <span style={{ color: '#666' }}>Free</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {settings.lunchAfter !== null && <p style={{ fontSize: 10, marginTop: 6 }}>Double line: lunch break after period {settings.lunchAfter}.</p>}
        </section>
      ))}
    </div>
  )
}

const cellStyle = { border: '1px solid #999', padding: '4px 6px', textAlign: 'left' as const, verticalAlign: 'top' as const }
