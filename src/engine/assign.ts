import { periodsOn, restCapacityPerWeek } from './blocks'
import type { Rng } from './rng'
import type { Assignment, ClassSection, Id, Issue, SchoolData, Settings, SkillTier, Teacher } from './types'

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
  pinnedTeacherId: Id | null
  eligible: Teacher[]
  order: number
}

/**
 * Phase 1: choose one teacher per (class, subject).
 * Senior classes only get teachers with the skill; junior classes may get anyone,
 * preferring primary skill, then secondary, then the lightest load.
 */
export function assignTeachers(data: SchoolData, rng: Rng) {
  const { settings, teachers, subjects } = data
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]))
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

  let order = 0
  for (const cls of data.classes) {
    const junior = isJunior(cls, settings)
    for (const item of cls.curriculum) {
      if (item.periods <= 0) continue
      const eligible = teachers.filter((t) => canTake(t, item.subjectId, junior))
      reqs.push({
        cls,
        subjectId: item.subjectId,
        periods: item.periods,
        pinnedTeacherId: item.pinnedTeacherId && teacherById.has(item.pinnedTeacherId) ? item.pinnedTeacherId : null,
        eligible,
        order: order++,
      })
    }
  }

  const result = new Map<number, Assignment>()
  const label = (r: Requirement) => `Class ${className(r.cls)} ${subjectName.get(r.subjectId) ?? 'subject'}`

  // Pins first: they are fixed decisions and consume capacity before anything else.
  for (const r of reqs) {
    if (!r.pinnedTeacherId) continue
    const t = teacherById.get(r.pinnedTeacherId)!
    const tier = tierOf(t, r.subjectId)
    const newLoad = load.get(t.id)! + r.periods
    load.set(t.id, newLoad)
    if (endOf.get(r.subjectId)) endLoad.set(t.id, endLoad.get(t.id)! + r.periods)
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
    result.set(r.order, { classId: r.cls.id, subjectId: r.subjectId, periods: r.periods, teacherId: t.id, tier, pinned: true })
  }

  // Most constrained first: fewest eligible teachers, then the biggest chunk of periods.
  const open = reqs
    .filter((r) => !r.pinnedTeacherId)
    .sort((a, b) => a.eligible.length - b.eligible.length || b.periods - a.periods || a.order - b.order)

  for (const r of open) {
    let best: Teacher | null = null
    let bestScore = Infinity
    for (const t of r.eligible) {
      const cap = weeklyCapacity(t, settings)
      const l = load.get(t.id)!
      if (l + r.periods > cap) continue
      const overRest = Math.max(0, l + r.periods - restWeek)
      const end = endOf.get(r.subjectId) ?? 0
      const endAfter = end ? endLoad.get(t.id)! + r.periods : 0
      const overEnd = end ? Math.max(0, endAfter - endCap(end)) : 0
      const overEndRest = end ? Math.max(0, endAfter - endRestCap(end)) : 0
      const score =
        TIER_COST[tierOf(t, r.subjectId)] + (12 * (l + r.periods)) / Math.max(1, cap) + 6 * overRest + 8 * overEnd + 3 * overEndRest + rng() * 0.5
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
      result.set(r.order, { classId: r.cls.id, subjectId: r.subjectId, periods: r.periods, teacherId: null, tier: null, pinned: false })
      continue
    }

    load.set(best.id, load.get(best.id)! + r.periods)
    if (endOf.get(r.subjectId)) endLoad.set(best.id, endLoad.get(best.id)! + r.periods)
    const tier = tierOf(best, r.subjectId)
    if (tier === 'none') {
      issues.push({
        kind: 'outsideSkill', severity: 'info', classId: r.cls.id, teacherId: best.id, subjectId: r.subjectId,
        message: `${best.name} takes ${label(r)} (junior class, outside their listed skills).`,
      })
    }
    result.set(r.order, { classId: r.cls.id, subjectId: r.subjectId, periods: r.periods, teacherId: best.id, tier, pinned: false })
  }

  const assignments = reqs.map((r) => result.get(r.order)!)
  return { assignments, issues, load }
}
