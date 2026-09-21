import { isAdjacent } from './blocks'
import { className } from './assign'
import type { Grid, Id, Issue, SchoolData } from './types'
import { W } from './weights'

export interface Evaluation {
  score: number
  issues: Issue[]
  lessons: number
  restGiven: number
  restMissed: number
  clashes: number
}

/** A teacher's week as a list of slots, each holding the classes they are in at that slot. */
export function teacherSlots(data: SchoolData, grid: Grid): Map<Id, { classId: Id; subjectId: Id }[][]> {
  const S = data.settings.dayNames.length * data.settings.periodsPerDay
  const map = new Map<Id, { classId: Id; subjectId: Id }[][]>()
  for (const t of data.teachers) map.set(t.id, Array.from({ length: S }, () => []))
  for (const cls of data.classes) {
    const cells = grid[cls.id]
    if (!cells) continue
    cells.forEach((cell, s) => {
      if (cell && s < S) map.get(cell.teacherId)?.[s].push({ classId: cls.id, subjectId: cell.subjectId })
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
      for (let p = 0; p < P; p++) {
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
        if (here.length > 0 && isAdjacent(settings, p)) {
          if (week[d * P + p + 1].length > 0) {
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
    const freeShare = Math.ceil(cells.filter((c) => !c).length / D)
    for (let d = 0; d < D; d++) {
      const counts = new Map<Id, number>()
      let gaps = 0, seen = false, free = 0
      for (let p = P - 1; p >= 0; p--) {
        const cell = cells[d * P + p]
        if (!cell) free++
        if (cell) {
          seen = true
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

  return { score, issues, lessons, restGiven, restMissed, clashes }
}
