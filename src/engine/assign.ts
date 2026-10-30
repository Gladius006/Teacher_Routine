import { periodsOn, restCapacityPerWeek } from './blocks'
import { labPlan, labTeacherPeriods } from './labs'
import { lineSubjects, validLines } from './lines'
import type { Rng } from './rng'
import type { Assignment, ClassSection, Id, Issue, SchoolData, Settings, SkillTier, Teacher, TeacherShare } from './types'

export function isJunior(c: ClassSection, settings: Settings): boolean {
  return c.grade <= settings.juniorMaxGrade
}

/** "9A" for a one-letter section, "12 Commerce" for a longer name, "12" when there is none. */
export function className(c: ClassSection): string {
  return c.section.length > 1 ? `${c.grade} ${c.section}` : `${c.grade}${c.section}`
}

export function tierOf(t: Teacher, subjectId: Id): SkillTier {
  if (t.primary.includes(subjectId)) return 'primary'
  if (t.secondary.includes(subjectId)) return 'secondary'
  return 'none'
}

/** Whether a teacher may take a subject in a junior class: their own subjects, plus their junior list (or anything if they have none). */
export function canTakeJunior(t: Teacher, subjectId: Id): boolean {
  return tierOf(t, subjectId) !== 'none' || !t.junior || t.junior.includes(subjectId)
}

/** Senior classes need the subject as a main or extra skill; junior classes follow canTakeJunior. */
export function canTake(t: Teacher, subjectId: Id, junior: boolean): boolean {
  return junior ? canTakeJunior(t, subjectId) : tierOf(t, subjectId) !== 'none'
}

const TIER_COST: Record<SkillTier, number> = { primary: 0, secondary: 4, none: 10 }

export function weeklyCapacity(t: Teacher, settings: Settings): number {
  const days = settings.dayNames.reduce((n, _, d) => n + Math.min(t.maxPerDay, periodsOn(settings, d)), 0)
  return Math.min(t.maxPerWeek, days)
}

interface Requirement {
  cls: ClassSection
  subjectId: Id
  periods: number
  /** Lab periods on top: they go to the (first) teacher too. */
  lab: number
  load: number
  /** Teachers chosen by hand and their periods; empty = choose one automatically. */
  pins: TeacherShare[]
  eligible: Teacher[]
  order: number
  /** For a subject in an option line: the line, its name, and the classes sitting in the lesson. */
  lineId?: Id
  lineName?: string
  lineClassIds?: Id[]
}

/**
 * Phase 1: choose one teacher per (class, subject).
 * Senior classes only get teachers with the skill; junior classes may get anyone,
 * preferring primary skill, then secondary, then the lightest load.
 */
export function assignTeachers(data: SchoolData, rng: Rng) {
  const { settings, teachers, subjects } = data
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))
  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const teacherById = new Map(teachers.map((t) => [t.id, t]))
  const restWeek = restCapacityPerWeek(settings)
  const load = new Map<Id, number>(teachers.map((t) => [t.id, 0]))
  // End-of-day subjects: a teacher can only be in one class in each of the last periods.
  const endOf = new Map(subjects.map((s) => [s.id, Math.max(0, Math.round(s.endOfDay ?? 0))]))
  const endCap = (n: number) => settings.dayNames.reduce((s, _, d) => s + Math.min(n, periodsOn(settings, d)), 0)
  // ...and resting between them means every other one of those periods.
  const endRestCap = (n: number) => settings.dayNames.reduce((s, _, d) => s + Math.ceil(Math.min(n, periodsOn(settings, d)) / 2), 0)
  const endLoad = new Map<Id, number>(teachers.map((t) => [t.id, 0]))
  const issues: Issue[] = []
  const reqs: Requirement[] = []

  const validShares = (shares: TeacherShare[] | undefined) =>
    (shares ?? []).filter((s) => teacherById.has(s.teacherId) && s.periods > 0)

  let order = 0
  const classById = new Map(data.classes.map((c) => [c.id, c]))
  const plans = new Map(data.classes.map((c) => [c.id, labPlan(c, subjectById, data)]))
  for (const cls of data.classes) {
    const junior = isJunior(cls, settings)
    const plan = plans.get(cls.id)!
    // Subjects this class takes in an option line are taught there instead.
    const inLines = lineSubjects(data, cls.id)
    for (const item of cls.curriculum) {
      const lab = labTeacherPeriods(plan, item.subjectId)
      const periods = inLines.has(item.subjectId) ? 0 : Math.max(0, item.periods)
      if (periods <= 0 && lab === 0) continue
      const shares = validShares(item.teachers)
      const pins = shares.length > 0
        ? (periods > 0 ? shares : shares.slice(0, 1).map((s) => ({ ...s, periods: 0 })))
        : item.pinnedTeacherId && teacherById.has(item.pinnedTeacherId) ? [{ teacherId: item.pinnedTeacherId, periods }] : []
      reqs.push({
        cls, subjectId: item.subjectId, periods, lab, load: periods + lab, pins,
        eligible: teachers.filter((t) => canTake(t, item.subjectId, junior)),
        order: order++,
      })
    }
  }

  // Option line subjects: one lesson for every class taking it, with one set of teachers.
  for (const line of validLines(data)) {
    for (const item of line.items) {
      const classes = item.classIds.map((id) => classById.get(id)!).filter(Boolean)
      const lab = classes.reduce((n, c) => n + labTeacherPeriods(plans.get(c.id)!, item.subjectId), 0)
      const junior = classes.every((c) => isJunior(c, settings))
      reqs.push({
        cls: classes[0], subjectId: item.subjectId, periods: item.periods, lab, load: item.periods + lab,
        pins: validShares(item.teachers),
        eligible: teachers.filter((t) => canTake(t, item.subjectId, junior)),
        order: order++,
        lineId: line.id, lineName: line.name, lineClassIds: item.classIds,
      })
    }
  }

  const result = new Map<number, Assignment[]>()
  const label = (r: Requirement) => r.lineId
    ? `${r.lineName} ${subjectName.get(r.subjectId) ?? 'subject'}`
    : `Class ${className(r.cls)} ${subjectName.get(r.subjectId) ?? 'subject'}`
  const lineFields = (r: Requirement) => (r.lineId ? { lineId: r.lineId, lineClassIds: r.lineClassIds } : {})

  // Pins first: they are fixed decisions and consume capacity before anything else.
  for (const r of reqs) {
    if (r.pins.length === 0) continue
    const out: Assignment[] = []
    r.pins.forEach((pin, k) => {
      const t = teacherById.get(pin.teacherId)!
      const tier = tierOf(t, r.subjectId)
      // The first teacher also takes the labs.
      const newLoad = load.get(t.id)! + pin.periods + (k === 0 ? r.lab : 0)
      load.set(t.id, newLoad)
      if (endOf.get(r.subjectId)) endLoad.set(t.id, endLoad.get(t.id)! + pin.periods)
      if (!canTake(t, r.subjectId, isJunior(r.cls, settings))) {
        issues.push({
          kind: 'pinInvalid', severity: 'warning', classId: r.cls.id, teacherId: t.id, subjectId: r.subjectId,
          message: isJunior(r.cls, settings)
            ? `${t.name} is pinned to ${label(r)} but can't take that subject in junior classes. Add it to their junior class subjects, or remove the pin.`
            : `${t.name} is pinned to ${label(r)} but doesn't have that subject as a skill. Add it to their extra subjects, or remove the pin.`,
        })
      }
      if (newLoad > weeklyCapacity(t, settings)) {
        issues.push({
          kind: 'pinInvalid', severity: 'warning', classId: r.cls.id, teacherId: t.id, subjectId: r.subjectId,
          message: `Pins give ${t.name} ${newLoad} periods a week, above their limit of ${weeklyCapacity(t, settings)}. Raise their limit or remove a pin.`,
        })
      }
      out.push({ classId: r.cls.id, subjectId: r.subjectId, periods: pin.periods, teacherId: t.id, tier, pinned: true, ...lineFields(r) })
    })
    result.set(r.order, out)
  }

  // Most constrained first: fewest eligible teachers, then the biggest chunk of periods.
  const open = reqs
    .filter((r) => r.pins.length === 0)
    .sort((a, b) => a.eligible.length - b.eligible.length || b.load - a.load || a.order - b.order)

  for (const r of open) {
    let best: Teacher | null = null
    let bestScore = Infinity
    for (const t of r.eligible) {
      const cap = weeklyCapacity(t, settings)
      const l = load.get(t.id)!
      if (l + r.load > cap) continue
      const overRest = Math.max(0, l + r.load - restWeek)
      const end = endOf.get(r.subjectId) ?? 0
      const endAfter = end ? endLoad.get(t.id)! + r.periods : 0
      const overEnd = end ? Math.max(0, endAfter - endCap(end)) : 0
      const overEndRest = end ? Math.max(0, endAfter - endRestCap(end)) : 0
      const score =
        TIER_COST[tierOf(t, r.subjectId)] + (12 * (l + r.load)) / Math.max(1, cap) + 6 * overRest + 8 * overEnd + 3 * overEndRest + rng() * 0.5
      if (score < bestScore) {
        bestScore = score
        best = t
      }
    }

    if (!best) {
      const subj = subjectName.get(r.subjectId) ?? 'this subject'
      const why = r.eligible.length === 0
        ? isJunior(r.cls, settings)
          ? `no teacher can take ${subj} in junior classes. Add it to a teacher's subjects or junior class subjects`
          : `no teacher has ${subj} as a skill. Add it to a teacher's main or extra subjects`
        : 'every teacher who can take it is at their weekly limit. Raise a limit or add a teacher'
      issues.push({
        kind: 'unassigned', severity: 'error', classId: r.cls.id, subjectId: r.subjectId,
        message: `${label(r)} has no teacher: ${why}.`,
      })
      result.set(r.order, [{ classId: r.cls.id, subjectId: r.subjectId, periods: r.periods, teacherId: null, tier: null, pinned: false, ...lineFields(r) }])
      continue
    }

    load.set(best.id, load.get(best.id)! + r.load)
    if (endOf.get(r.subjectId)) endLoad.set(best.id, endLoad.get(best.id)! + r.periods)
    const tier = tierOf(best, r.subjectId)
    if (tier === 'none') {
      issues.push({
        kind: 'outsideSkill', severity: 'info', classId: r.cls.id, teacherId: best.id, subjectId: r.subjectId,
        message: `${best.name} takes ${label(r)} (junior class, outside their listed skills).`,
      })
    }
    result.set(r.order, [{ classId: r.cls.id, subjectId: r.subjectId, periods: r.periods, teacherId: best.id, tier, pinned: false, ...lineFields(r) }])
  }

  const assignments = reqs.flatMap((r) => result.get(r.order)!)
  return { assignments, issues, load }
}
