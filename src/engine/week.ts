import { slotsPerWeek } from './blocks'
import { isOffered } from './grades'
import { labPeriods, labPlan, type LabPlan } from './labs'
import { linePeriodsFor, lineSubjects, validLines } from './lines'
import type { ClassSection, SchoolData } from './types'

export interface WeekUse {
  /** Periods of the class's own subjects (not counting ones it takes in an option line). */
  subjects: number
  /** Periods spent in option lines. */
  lines: number
  /** Periods spent in lab times, and the lab plan behind them. */
  labs: number
  plan: LabPlan | null
  total: number
  slots: number
}

/** Where a class's week goes: its subjects, option lines and lab times, against the periods the week has. */
export function weekUse(data: SchoolData, cls: ClassSection): WeekUse {
  const subjectById = new Map(data.subjects.map((s) => [s.id, s]))
  const offered = cls.curriculum.filter((i) => isOffered(subjectById.get(i.subjectId), cls.grade))
  const inLines = lineSubjects(data, cls.id)
  const subjects = offered.reduce((n, i) => n + (inLines.has(i.subjectId) ? 0 : Math.max(0, i.periods)), 0)
  const lines = validLines(data).reduce((n, l) => n + linePeriodsFor(l, cls.id), 0)
  const plan = labPlan({ ...cls, curriculum: offered }, subjectById, data)
  const labs = labPeriods(plan)
  return { subjects, lines, labs, plan, total: subjects + lines + labs, slots: slotsPerWeek(data.settings) }
}

/** "Subjects 32 + Labs 10 = 42 of 44", leaving out parts that are zero. */
export function describeWeek(w: WeekUse): string {
  const parts = [`Subjects ${w.subjects}`]
  if (w.lines) parts.push(`Option lines ${w.lines}`)
  if (w.labs) parts.push(`Labs ${w.labs}`)
  return `${parts.join(' + ')} = ${w.total} of ${w.slots}`
}
