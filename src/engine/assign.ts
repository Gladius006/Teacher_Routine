import { restCapacityPerDay } from './blocks'
import type { Rng } from './rng'
import type { Assignment, ClassSection, Id, Issue, SchoolData, Settings, SkillTier, Teacher } from './types'

export function isJunior(c: ClassSection, settings: Settings): boolean {
  return c.grade <= settings.juniorMaxGrade
}

export function className(c: ClassSection): string {
  return c.section.length > 1 ? `${c.grade} ${c.section}` : `${c.grade}${c.section}`
}

export function tierOf(t: Teacher, subjectId: Id): SkillTier {
  if (t.primary.includes(subjectId)) return 'primary'
  if (t.secondary.includes(subjectId)) return 'secondary'
  return 'none'
}

const TIER_COST: Record<SkillTier, number> = { primary: 0, secondary: 4, none: 10 }

export function weeklyCapacity(t: Teacher, settings: Settings): number {
  return Math.min(t.maxPerWeek, t.maxPerDay * settings.dayNames.length)
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
  const restWeek = restCapacityPerDay(settings) * settings.dayNames.length
  const load = new Map<Id, number>(teachers.map((t) => [t.id, 0]))
  const issues: Issue[] = []
  const reqs: Requirement[] = []

  let order = 0
  for (const cls of data.classes) {
    const junior = isJunior(cls, settings)
    for (const item of cls.curriculum) {
      if (item.periods <= 0) continue
      const eligible = junior ? teachers : teachers.filter((t) => tierOf(t, item.subjectId) !== 'none')
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
    if (tier === 'none' && !isJunior(r.cls, settings)) {
      issues.push({
        kind: 'pinInvalid', severity: 'warning', classId: r.cls.id, teacherId: t.id, subjectId: r.subjectId,
        message: `${t.name} is pinned to ${label(r)} but doesn't have that subject as a skill. Add it to their extra subjects, or remove the pin.`,
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
      const score =
        TIER_COST[tierOf(t, r.subjectId)] + (12 * (l + r.periods)) / Math.max(1, cap) + 6 * overRest + rng() * 0.5
      if (score < bestScore) {
        bestScore = score
        best = t
      }
    }

    if (!best) {
      const why = r.eligible.length === 0
        ? `no teacher has ${subjectName.get(r.subjectId) ?? 'this subject'} as a skill. Add it to a teacher's main or extra subjects`
        : 'every teacher who can take it is at their weekly limit. Raise a limit or add a teacher'
      issues.push({
        kind: 'unassigned', severity: 'error', classId: r.cls.id, subjectId: r.subjectId,
        message: `${label(r)} has no teacher: ${why}.`,
      })
      result.set(r.order, { classId: r.cls.id, subjectId: r.subjectId, periods: r.periods, teacherId: null, tier: null, pinned: false })
      continue
    }

    load.set(best.id, load.get(best.id)! + r.periods)
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
