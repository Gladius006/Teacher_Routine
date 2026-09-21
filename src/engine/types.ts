export type Id = string

export interface Settings {
  dayNames: string[]
  periodsPerDay: number
  /** Lunch break falls after this period (1-based). null = no break. */
  lunchAfter: number | null
  /** Classes with grade <= this are junior: any teacher may take them. */
  juniorMaxGrade: number
  maxSubjectPerDay: number
  defaultMaxPerDay: number
  defaultMaxPerWeek: number
}

export interface Subject {
  id: Id
  name: string
  code: string
  color: string
  /** Class grades this subject is taught in. Missing = every grade (files saved before this option). */
  grades?: number[]
}

export interface Teacher {
  id: Id
  name: string
  code: string
  primary: Id[]
  secondary: Id[]
  maxPerDay: number
  maxPerWeek: number
}

export interface CurriculumItem {
  subjectId: Id
  periods: number
  pinnedTeacherId?: Id | null
}

export interface ClassSection {
  id: Id
  grade: number
  section: string
  curriculum: CurriculumItem[]
}

export interface SchoolData {
  settings: Settings
  subjects: Subject[]
  teachers: Teacher[]
  classes: ClassSection[]
}

export type SkillTier = 'primary' | 'secondary' | 'none'

export interface Assignment {
  classId: Id
  subjectId: Id
  periods: number
  teacherId: Id | null
  tier: SkillTier | null
  pinned: boolean
}

export interface Cell {
  subjectId: Id
  teacherId: Id
}

/** Per class: cells indexed by day * periodsPerDay + period. null = free period. */
export type Grid = Record<Id, (Cell | null)[]>

export type IssueKind =
  | 'clash'
  | 'overDay'
  | 'restMissed'
  | 'subjectRepeat'
  | 'gap'
  | 'unassigned'
  | 'unplaced'
  | 'outsideSkill'
  | 'overCapacity'
  | 'pinInvalid'
  | 'notOffered'

export type Severity = 'error' | 'warning' | 'info'

export interface Issue {
  kind: IssueKind
  severity: Severity
  message: string
  classId?: Id
  teacherId?: Id
  subjectId?: Id
  day?: number
  period?: number
}

export interface RoutineStats {
  lessons: number
  restGiven: number
  restMissed: number
  clashes: number
  score: number
  ms: number
  iterations: number
}

export interface Routine {
  generatedAt: number
  inputHash: string
  seed: number
  assignments: Assignment[]
  grid: Grid
  issues: Issue[]
  stats: RoutineStats
}
