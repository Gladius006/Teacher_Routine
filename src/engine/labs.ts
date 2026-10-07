import type { ClassSection, Id, LabInfo, Subject } from './types'

/** Classes that get a new lab by default. */
export const DEFAULT_LAB_GRADES = [11, 12]
export const DEFAULT_LAB: Omit<LabInfo, 'grades'> = { groups: 4, sessions: 1, periods: 2, rooms: 1 }

export interface LabBlock {
  /** Periods the block takes. */
  length: number
  /** Which group is in which subject's lab. Groups not listed are free. */
  stations: { group: number; subjectId: Id }[]
}

export interface LabPlan {
  /** Most groups any of the class's labs uses (for showing who is free). */
  groups: number
  blocks: LabBlock[]
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** A complete lab setting. Lab settings saved by earlier versions had other fields and are ignored. */
export function isLab(v: unknown): v is LabInfo {
  const l = v as LabInfo | null
  return !!l && typeof l === 'object' && Array.isArray(l.grades) && l.grades.every(num) &&
    num(l.groups) && num(l.sessions) && num(l.periods) && num(l.rooms)
}

/** The subject without an out-of-date lab setting. */
export function cleanLab(s: Subject): Subject {
  if (s.lab === undefined || isLab(s.lab)) return s
  const { lab: _old, ...rest } = s
  return rest
}

/** The class's lab subjects: subjects it has that have a lab for its grade. */
export function classLabs(cls: ClassSection, subjectById: Map<Id, Subject>): Subject[] {
  const out: Subject[] = []
  for (const item of cls.curriculum) {
    const s = subjectById.get(item.subjectId)
    if (s && isLab(s.lab) && s.lab.grades.includes(cls.grade) && !out.includes(s)) out.push(s)
  }
  return out
}

const int = (n: number, min: number) => Math.max(min, Math.round(n))

/**
 * Lab blocks for a class. In a block, the class has no ordinary lesson: each
 * lab takes one group, and groups without a lab are free. Labs run side by
 * side so the class loses as little time as possible: with 4 groups and
 * Physics, Chemistry and Biology labs, 4 blocks give every group every lab,
 * with one group free in each. Labs of different lengths go in separate blocks;
 * a second session a week runs a second round.
 */
export function labPlan(cls: ClassSection, subjectById: Map<Id, Subject>): LabPlan | null {
  const labs = classLabs(cls, subjectById)
  if (labs.length === 0) return null
  const blocks: LabBlock[] = []
  const lengths = [...new Set(labs.map((s) => int(s.lab!.periods, 1)))].sort((a, b) => b - a)
  for (const length of lengths) {
    const same = labs.filter((s) => int(s.lab!.periods, 1) === length)
    const rounds = Math.max(...same.map((s) => int(s.lab!.sessions, 0)))
    for (let r = 0; r < rounds; r++) {
      const active = same.filter((s) => int(s.lab!.sessions, 0) > r)
      // Rotate: in block b, lab k takes group (k + b) mod n, so over n blocks each lab sees every group once.
      const n = Math.max(active.length, ...active.map((s) => int(s.lab!.groups, 1)))
      for (let b = 0; b < n; b++) {
        const stations = active
          .map((s, k) => ({ group: (k + b) % n, subjectId: s.id }))
          .filter((st) => st.group < int(subjectById.get(st.subjectId)!.lab!.groups, 1))
        if (stations.length) blocks.push({ length, stations })
      }
    }
  }
  if (blocks.length === 0) return null
  return { groups: Math.max(...labs.map((s) => int(s.lab!.groups, 1))), blocks }
}

/** Periods a week the class spends in labs. */
export function labPeriods(plan: LabPlan | null): number {
  return plan ? plan.blocks.reduce((n, b) => n + b.length, 0) : 0
}

/** Periods a week a subject's teacher spends in this class's labs. */
export function labTeacherPeriods(plan: LabPlan | null, subjectId: Id): number {
  return plan ? plan.blocks.filter((b) => b.stations.some((st) => st.subjectId === subjectId)).reduce((n, b) => n + b.length, 0) : 0
}

/** "A" for group 0, "B" for group 1... */
export const groupName = (g: number) => (g < 26 ? String.fromCharCode(65 + g) : `G${g + 1}`)

/** "A, B, C, D" for 4 groups. */
export const groupNames = (n: number) => Array.from({ length: n }, (_, g) => groupName(g)).join(', ')
