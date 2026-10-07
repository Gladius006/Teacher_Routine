import { isAdjacent, periodsOn, slotsPerWeek } from './blocks'
import { className } from './assign'
import { groupName, isLab } from './labs'
import type { Cell, Grid, Id, Issue, SchoolData } from './types'
import { W } from './weights'

export interface Evaluation {
  score: number
  issues: Issue[]
  lessons: number
  restGiven: number
  restMissed: number
  clashes: number
}

/** Where a teacher is in one period. */
export interface TeacherSlot {
  classId: Id
  subjectId: Id
  /** Set in a practical block: the group they have in the lab, and how the block runs. */
  group?: number
  lab?: { block: number; part: number; length: number }
}

/** Each teacher in a cell: one for a lesson, one per lab for a practical block. */
export function cellTeachers(cell: Cell): { teacherId: Id; subjectId: Id; group?: number }[] {
  return cell.lab ? cell.lab.stations : [{ teacherId: cell.teacherId, subjectId: cell.subjectId }]
}

/** True when a teacher's lab session carries on into the next period, so the two aren't back to back. */
export const continues = (here: TeacherSlot[]) => here.length === 1 && !!here[0].lab && here[0].lab.part < here[0].lab.length - 1

/** A teacher's week as a list of slots, each holding the classes they are in at that slot. */
export function teacherSlots(data: SchoolData, grid: Grid): Map<Id, TeacherSlot[][]> {
  const S = data.settings.dayNames.length * data.settings.periodsPerDay
  const map = new Map<Id, TeacherSlot[][]>()
  for (const t of data.teachers) map.set(t.id, Array.from({ length: S }, () => []))
  for (const cls of data.classes) {
    const cells = grid[cls.id]
    if (!cells) continue
    cells.forEach((cell, s) => {
      if (!cell || s >= S) return
      const lab = cell.lab && { block: cell.lab.block, part: cell.lab.part, length: cell.lab.length }
      for (const st of cellTeachers(cell)) {
        map.get(st.teacherId)?.[s].push({ classId: cls.id, subjectId: st.subjectId, ...(lab ? { group: st.group, lab } : {}) })
      }
    })
  }
  return map
}

/**
 * Scores a finished grid from scratch and lists every rule it breaks.
 * Uses the same weights as the search, so tests can check the search's running score.
 */
export function evaluate(data: SchoolData, grid: Grid): Evaluation {
  const { settings, teachers, classes, subjects } = data
  const D = settings.dayNames.length
  const P = settings.periodsPerDay
  const issues: Issue[] = []
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))
  const endOf = new Map(subjects.map((s) => [s.id, Math.max(0, Math.round(s.endOfDay ?? 0))]))
  const classById = new Map(classes.map((c) => [c.id, c]))
  const day = (d: number) => settings.dayNames[d] ?? `Day ${d + 1}`
  let score = 0, lessons = 0, restGiven = 0, restMissed = 0, clashes = 0

  const slots = teacherSlots(data, grid)
  for (const t of teachers) {
    const week = slots.get(t.id)!
    const weekly = week.reduce((n, s) => n + s.length, 0)
    const share = Math.ceil(weekly / D) + 1
    for (let d = 0; d < D; d++) {
      let dayLessons = 0
      const len = periodsOn(settings, d)
      for (let p = 0; p < len; p++) {
        const here = week[d * P + p]
        dayLessons += here.length
        if (here.length > 1) {
          clashes += here.length - 1
          score += W.clash * (here.length - 1)
          issues.push({
            kind: 'clash', severity: 'error', teacherId: t.id, day: d, period: p,
            message: `${t.name} is in ${here.map((h) => className(classById.get(h.classId)!)).join(' and ')} at the same time (${day(d)}, period ${p + 1}). Generate again, or check the teachers you pinned.`,
          })
        }
        if (here.length > 0 && isAdjacent(settings, p, d)) {
          const next = week[d * P + p + 1]
          if (next.length > 0 && next.length === 1 && continues(here)) {
            // The two periods of one lab session.
          } else if (next.length > 0) {
            restMissed++
            score += W.rest
            issues.push({
              kind: 'restMissed', severity: 'warning', teacherId: t.id, day: d, period: p + 1,
              message: `${t.name} teaches periods ${p + 1} and ${p + 2} back to back on ${day(d)}.`,
            })
          } else {
            restGiven++
          }
        }
      }
      lessons += dayLessons
      if (dayLessons > t.maxPerDay) {
        score += W.overDay * (dayLessons - t.maxPerDay)
        issues.push({
          kind: 'overDay', severity: 'error', teacherId: t.id, day: d,
          message: `${t.name} has ${dayLessons} periods on ${day(d)}, above their daily limit of ${t.maxPerDay}. Generate again, or raise their limit.`,
        })
      }
      score += W.imbalance * Math.max(0, dayLessons - share)
    }
  }

  for (const cls of classes) {
    const cells = grid[cls.id]
    if (!cells) continue
    const freeShare = Math.ceil(Math.max(0, slotsPerWeek(settings) - cells.filter(Boolean).length) / D)
    for (let d = 0; d < D; d++) {
      const counts = new Map<Id, number>()
      let gaps = 0, seen = false, free = 0
      const len = periodsOn(settings, d)
      for (let p = len - 1; p >= 0; p--) {
        const cell = cells[d * P + p]
        if (!cell) free++
        if (cell?.lab) seen = true
        else if (cell) {
          seen = true
          const end = endOf.get(cell.subjectId) ?? 0
          if (end > 0 && p < len - end) {
            score += W.endOfDay
            issues.push({
              kind: 'notAtEnd', severity: 'warning', classId: cls.id, subjectId: cell.subjectId, teacherId: cell.teacherId, day: d, period: p,
              message: `Class ${className(cls)} has ${subjectName.get(cell.subjectId)} in period ${p + 1} on ${day(d)}, not in the last ${end === 1 ? 'period' : `${end} periods`}. Its teachers can't fit every class at the end of the day: allow more last periods for it, or add a teacher.`,
            })
          }
          counts.set(cell.subjectId, (counts.get(cell.subjectId) ?? 0) + 1)
        } else if (seen) gaps++
      }
      for (const [sid, n] of counts) {
        if (n > settings.maxSubjectPerDay) {
          score += W.subjectRepeat * (n - settings.maxSubjectPerDay)
          issues.push({
            kind: 'subjectRepeat', severity: 'warning', classId: cls.id, subjectId: sid, day: d,
            message: `Class ${className(cls)} has ${subjectName.get(sid)} ${n} times on ${day(d)}.`,
          })
        }
      }
      score += W.freeSpread * Math.max(0, free - freeShare)
      if (gaps > 0) {
        score += W.gap * gaps
        issues.push({
          kind: 'gap', severity: 'info', classId: cls.id, day: d,
          message: `Class ${className(cls)} has ${gaps} free period${gaps > 1 ? 's' : ''} in the middle of ${day(d)}.`,
        })
      }
    }
  }

  // Labs: no more groups in a lab at once than the school has rooms for it.
  const S = D * P
  for (const subject of subjects) {
    if (!isLab(subject.lab)) continue
    const rooms = Math.max(1, Math.round(subject.lab.rooms))
    for (let s = 0; s < S; s++) {
      const users: string[] = []
      for (const cls of classes) {
        const cell = grid[cls.id]?.[s]
        for (const st of cell?.lab?.stations ?? []) if (st.subjectId === subject.id) users.push(`${className(cls)} group ${groupName(st.group)}`)
      }
      if (users.length > rooms) {
        const d = Math.floor(s / P), p = s % P
        score += W.clash * (users.length - rooms)
        issues.push({
          kind: 'labClash', severity: 'error', subjectId: subject.id, day: d, period: p,
          message: `The ${subject.name} lab is needed by ${users.join(' and ')} at the same time (${day(d)}, period ${p + 1}), but there ${rooms === 1 ? 'is only 1 lab' : `are only ${rooms} labs`}. Generate again, or add a ${subject.name} lab.`,
        })
      }
    }
  }

  return { score, issues, lessons, restGiven, restMissed, clashes }
}
