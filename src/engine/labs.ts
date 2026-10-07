import type { ClassSection, CurriculumItem, Id, LabInfo, Subject } from './types'

/** Classes that can have lab sessions. */
export const LAB_GRADES = [11, 12]
export const DEFAULT_LAB: LabInfo = { rooms: 1, capacity: 25, periods: 2 }

export interface LabPlan {
  /** How many groups the class is split into. */
  groups: number
  /** Periods in one practical block (the longest lab session among its subjects). */
  length: number
  /** Each block: which group is in which subject's lab. Groups not listed are off. */
  blocks: { group: number; subjectId: Id }[][]
}

/** The class's subjects that have lab sessions. */
export function labItems(cls: ClassSection, subjectById: Map<Id, Subject>): CurriculumItem[] {
  return cls.curriculum.filter((i) => (i.labSessions ?? 0) > 0 && subjectById.get(i.subjectId)?.lab)
}

/** Groups needed so no lab holds more students than it fits. */
export function labGroups(cls: ClassSection, subjectById: Map<Id, Subject>): number {
  const students = cls.students ?? 0
  if (students <= 0) return 1
  const caps = labItems(cls, subjectById).map((i) => Math.max(1, subjectById.get(i.subjectId)!.lab!.capacity))
  return caps.length ? Math.max(1, ...caps.map((c) => Math.ceil(students / c))) : 1
}

/**
 * Practical blocks for a class, with groups rotating together through the labs.
 * In each block every lab takes a different group; over a round of blocks every
 * group visits every lab once. E.g. 4 groups and 3 labs (Physics, Chemistry,
 * Biology) give 4 blocks, with one group off in each. A subject with 2 sessions
 * a week runs a second round.
 */
export function labPlan(cls: ClassSection, subjectById: Map<Id, Subject>): LabPlan | null {
  const items = labItems(cls, subjectById)
  if (items.length === 0) return null
  const groups = labGroups(cls, subjectById)
  const length = Math.max(1, ...items.map((i) => Math.round(subjectById.get(i.subjectId)!.lab!.periods)))
  const rounds = Math.max(...items.map((i) => Math.round(i.labSessions!)))
  const blocks: LabPlan['blocks'] = []
  for (let r = 0; r < rounds; r++) {
    const active = items.filter((i) => Math.round(i.labSessions!) > r)
    const n = Math.max(groups, active.length)
    for (let b = 0; b < n; b++) {
      const block = active
        .map((i, k) => ({ group: (k + b) % n, subjectId: i.subjectId }))
        .filter((st) => st.group < groups)
      if (block.length) blocks.push(block)
    }
  }
  return { groups, length, blocks }
}

/** Periods a week the class spends in practical blocks. */
export function labPeriods(plan: LabPlan | null): number {
  return plan ? plan.blocks.length * plan.length : 0
}

/** Periods a week a subject's teacher spends in this class's labs. */
export function labTeacherPeriods(plan: LabPlan | null, subjectId: Id): number {
  return plan ? plan.blocks.filter((b) => b.some((st) => st.subjectId === subjectId)).length * plan.length : 0
}

/** "G1" for group 0. */
export const groupName = (g: number) => `G${g + 1}`
