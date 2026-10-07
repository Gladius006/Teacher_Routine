export type Id = string

export interface Settings {
  dayNames: string[]
  periodsPerDay: number
  /** Days with fewer periods, e.g. { Sat: 4 } for a Saturday half day. Missing = every day is full. */
  shortDays?: Record<string, number>
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
  /** Periods a week it gets when it is added to a class automatically. Missing = DEFAULT_SUBJECT_PERIODS. */
  periods?: number
  /** Only in the last N periods of each day, e.g. 2 for Physical Ed. Missing or 0 = any time. */
  endOfDay?: number
  /** Set when the subject has labs (or practical rooms). */
  lab?: LabInfo
}

export interface LabInfo {
  /** How many lab rooms the school has for this subject. */
  rooms: number
  /** Students that fit in one lab; a bigger class is split into groups. */
  capacity: number
  /** Length of one lab session, in periods. */
  periods: number
}

export interface Teacher {
  id: Id
  name: string
  code: string
  primary: Id[]
  secondary: Id[]
  /**
   * Other subjects they may take in junior classes, on top of main and extra.
   * Missing = any subject (the rule before this option existed).
   */
  junior?: Id[]
  maxPerDay: number
  maxPerWeek: number
}

export interface CurriculumItem {
  subjectId: Id
  periods: number
  pinnedTeacherId?: Id | null
  /** Lab sessions each group gets in a week, for a subject with labs. Missing or 0 = no lab. */
  labSessions?: number
}

export interface ClassSection {
  id: Id
  grade: number
  section: string
  curriculum: CurriculumItem[]
  /** Number of students, used to split the class into lab groups. Missing = one group. */
  students?: number
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
  /** Empty for a practical block period; see `lab`. */
  subjectId: Id
  teacherId: Id
  /** Set when this period is part of a practical block, where the class's groups are spread over the labs. */
  lab?: LabCell
}

export interface LabStation {
  /** 0-based group number. */
  group: number
  subjectId: Id
  teacherId: Id
}

export interface LabCell {
  /** Block number within the class, so the periods of one block can be drawn together. */
  block: number
  /** Which period of the block this is (0-based) and how long the block is. */
  part: number
  length: number
  groups: number
  /** One group in each lab; groups not listed are off this block. */
  stations: LabStation[]
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
  | 'notAtEnd'
  | 'labClash'

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
