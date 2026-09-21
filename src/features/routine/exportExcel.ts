import type { Workbook, Worksheet } from 'exceljs'
import { className } from '../../engine/assign'
import { isAdjacent } from '../../engine/blocks'
import { teacherSlots } from '../../engine/evaluate'
import type { Routine, SchoolData } from '../../engine/types'

const INK = 'FF15201B'
const MUTED = 'FF5C6661'
const LINE = 'FFC9CFCB'
const HEADER_FILL = 'FFE8EBE6'
const LUNCH_FILL = 'FFDDE9E2'
const WARN_FILL = 'FFF8EAD4'

/** Subject color mixed with white, so text on it stays readable when printed. */
function tint(hex: string, amount = 0.8): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, '0')
  return `FF${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`.toUpperCase()
}

const thin = { style: 'thin' as const, color: { argb: LINE } }
const BORDER = { top: thin, left: thin, bottom: thin, right: thin }

/** Excel sheet names: max 31 chars, no []:*?/\ and unique. */
function sheetName(wb: Workbook, raw: string): string {
  const base = raw.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim()
  let name = base
  for (let i = 2; wb.getWorksheet(name); i++) name = `${base.slice(0, 27)} (${i})`
  return name
}

function title(ws: Worksheet, text: string, sub: string, width: number) {
  ws.mergeCells(1, 1, 1, width)
  const t = ws.getCell(1, 1)
  t.value = text
  t.font = { size: 16, bold: true, color: { argb: INK } }
  ws.getRow(1).height = 26
  ws.mergeCells(2, 1, 2, width)
  const s = ws.getCell(2, 1)
  s.value = sub
  s.font = { size: 10, color: { argb: MUTED } }
}

function headerCell(ws: Worksheet, row: number, col: number, value: string) {
  const c = ws.getCell(row, col)
  c.value = value
  c.font = { bold: true, color: { argb: INK } }
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
  c.alignment = { horizontal: 'center', vertical: 'middle' }
  c.border = BORDER
}

/**
 * Days as rows, periods as columns, with a lunch column, matching the app's grid.
 * `cell` returns [first line, second line, color, flagged] or null for a free period.
 */
function weekSheet(
  wb: Workbook,
  data: SchoolData,
  name: string,
  heading: string,
  sub: string,
  cell: (slot: number) => { top: string; bottom: string; color?: string; flag?: boolean } | null,
) {
  const { settings } = data
  const P = settings.periodsPerDay
  const lunch = settings.lunchAfter !== null && settings.lunchAfter > 0 && settings.lunchAfter < P ? settings.lunchAfter : null
  const cols = P + 1 + (lunch ? 1 : 0)
  const ws = wb.addWorksheet(sheetName(wb, name), {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  })
  title(ws, heading, sub, cols)

  const colOf = (p: number) => 2 + p + (lunch !== null && p >= lunch ? 1 : 0)
  ws.getColumn(1).width = 8
  headerCell(ws, 3, 1, 'Day')
  for (let p = 0; p < P; p++) {
    ws.getColumn(colOf(p)).width = 17
    headerCell(ws, 3, colOf(p), `Period ${p + 1}`)
  }
  if (lunch !== null) {
    ws.getColumn(lunch + 2).width = 7
    headerCell(ws, 3, lunch + 2, 'Lunch')
    ws.mergeCells(4, lunch + 2, 3 + settings.dayNames.length, lunch + 2)
    const l = ws.getCell(4, lunch + 2)
    l.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LUNCH_FILL } }
    l.border = BORDER
  }

  settings.dayNames.forEach((day, d) => {
    const r = 4 + d
    ws.getRow(r).height = 34
    const dc = ws.getCell(r, 1)
    dc.value = day
    dc.font = { bold: true, color: { argb: INK } }
    dc.alignment = { vertical: 'middle' }
    dc.border = BORDER
    for (let p = 0; p < P; p++) {
      const c = ws.getCell(r, colOf(p))
      const v = cell(d * P + p)
      c.border = BORDER
      c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }
      if (!v) {
        c.value = 'Free'
        c.font = { italic: true, color: { argb: MUTED } }
        continue
      }
      c.value = { richText: [{ text: v.top, font: { bold: true, color: { argb: INK } } }, { text: `\n${v.bottom}`, font: { size: 9, color: { argb: MUTED } } }] }
      const fill = v.flag ? WARN_FILL : v.color ? tint(v.color) : undefined
      if (fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    }
  })
  return ws
}

/** Builds the workbook: Overview, Workload, then one sheet per class and per teacher. */
export async function buildRoutineWorkbook(data: SchoolData, routine: Routine): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Routine Builder'
  wb.created = new Date(routine.generatedAt)

  const { settings } = data
  const P = settings.periodsPerDay
  const subject = new Map(data.subjects.map((s) => [s.id, s]))
  const teacher = new Map(data.teachers.map((t) => [t.id, t]))
  const cls = new Map(data.classes.map((c) => [c.id, c]))
  const slots = teacherSlots(data, routine.grid)
  const classes = [...data.classes].sort((a, b) => a.grade - b.grade || a.section.localeCompare(b.section))
  const teachers = [...data.teachers].sort((a, b) => a.name.localeCompare(b.name))
  const built = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(routine.generatedAt)
  const { restGiven, restMissed, lessons } = routine.stats
  const restPct = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })
    .format(restGiven + restMissed === 0 ? 1 : restGiven / (restGiven + restMissed))

  // Overview: who teaches what.
  const used = data.subjects.filter((s) => routine.assignments.some((a) => a.subjectId === s.id))
  const ov = wb.addWorksheet('Overview', { views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }] })
  title(ov, 'School routine', `Built ${built}. ${lessons} periods placed, rest after class ${restPct}.`, used.length + 1)
  ov.mergeCells(3, 1, 3, used.length + 1)
  ov.getCell(3, 1).value = 'Who teaches what (teacher chosen for each class and subject)'
  ov.getCell(3, 1).font = { bold: true, color: { argb: INK } }
  ov.getColumn(1).width = 10
  headerCell(ov, 5, 1, 'Class')
  used.forEach((s, i) => {
    ov.getColumn(i + 2).width = 18
    headerCell(ov, 5, i + 2, s.name)
    ov.getCell(5, i + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tint(s.color, 0.7) } }
  })
  const lookup = new Map(routine.assignments.map((a) => [`${a.classId}:${a.subjectId}`, a]))
  classes.forEach((c, ri) => {
    const r = 6 + ri
    const h = ov.getCell(r, 1)
    h.value = className(c)
    h.font = { bold: true }
    h.border = BORDER
    used.forEach((s, i) => {
      const a = lookup.get(`${c.id}:${s.id}`)
      const cell = ov.getCell(r, i + 2)
      cell.border = BORDER
      cell.alignment = { horizontal: 'center' }
      if (!a) return
      cell.value = a.teacherId ? teacher.get(a.teacherId)?.name ?? '' : 'No teacher'
      if (!a.teacherId) cell.font = { color: { argb: 'FFA8231B' }, bold: true }
    })
  })

  // Workload: periods per teacher per day.
  const wl = wb.addWorksheet('Workload', { views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }] })
  const wlCols = settings.dayNames.length + 4
  title(wl, 'Teacher workload', 'Periods taught each day. "No rest" counts back-to-back periods.', wlCols)
  wl.getColumn(1).width = 24
  headerCell(wl, 3, 1, 'Teacher')
  settings.dayNames.forEach((d, i) => { wl.getColumn(i + 2).width = 7; headerCell(wl, 3, i + 2, d) })
  const [cTotal, cLimit, cNoRest] = [settings.dayNames.length + 2, settings.dayNames.length + 3, settings.dayNames.length + 4]
  ;[[cTotal, 'Week'], [cLimit, 'Limit'], [cNoRest, 'No rest']].forEach(([c, t]) => { wl.getColumn(c as number).width = 9; headerCell(wl, 3, c as number, t as string) })
  teachers.forEach((t, ri) => {
    const r = 4 + ri
    const week = slots.get(t.id) ?? []
    let total = 0, noRest = 0
    wl.getCell(r, 1).value = t.name
    wl.getCell(r, 1).border = BORDER
    settings.dayNames.forEach((_, d) => {
      const n = week.slice(d * P, d * P + P).reduce((s, x) => s + x.length, 0)
      total += n
      const c = wl.getCell(r, d + 2)
      c.value = n
      c.alignment = { horizontal: 'center' }
      c.border = BORDER
      if (n > t.maxPerDay) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARN_FILL } }
    })
    for (let s = 0; s < week.length; s++) if (week[s].length && isAdjacent(settings, s % P) && week[s + 1]?.length) noRest++
    ;[[cTotal, total], [cLimit, t.maxPerWeek], [cNoRest, noRest]].forEach(([c, v]) => {
      const cell = wl.getCell(r, c)
      cell.value = v
      cell.alignment = { horizontal: 'center' }
      cell.border = BORDER
    })
  })

  // One sheet per class.
  for (const c of classes) {
    const cells = routine.grid[c.id] ?? []
    weekSheet(wb, data, `Class ${className(c)}`, `Class ${className(c)}`, `Weekly routine. Built ${built}.`, (s) => {
      const x = cells[s]
      if (!x) return null
      const subj = subject.get(x.subjectId)
      return { top: subj?.name ?? '', bottom: teacher.get(x.teacherId)?.name ?? '', color: subj?.color }
    })
  }

  // One sheet per teacher. Back-to-back periods are shaded so they are easy to spot.
  for (const t of teachers) {
    const week = slots.get(t.id) ?? []
    const total = week.reduce((n, s) => n + s.length, 0)
    weekSheet(wb, data, t.name, t.name, `${total} periods a week. Shaded: back to back, no rest.`, (s) => {
      const here = week[s]
      if (!here?.length) return null
      const p = s % P
      const prevBusy = p > 0 && isAdjacent(settings, p - 1) && (week[s - 1]?.length ?? 0) > 0
      const nextBusy = isAdjacent(settings, p) && (week[s + 1]?.length ?? 0) > 0
      const subj = subject.get(here[0].subjectId)
      return {
        top: `Class ${here.map((h) => className(cls.get(h.classId)!)).join(' + ')}`,
        bottom: subj?.name ?? '',
        color: subj?.color,
        flag: prevBusy || nextBusy,
      }
    })
  }

  return wb
}

export async function exportRoutineToExcel(data: SchoolData, routine: Routine): Promise<void> {
  const wb = await buildRoutineWorkbook(data, routine)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `school-routine-${new Date(routine.generatedAt).toLocaleDateString('en-CA')}.xlsx`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
