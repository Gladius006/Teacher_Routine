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
  /** Set when the subject has a lab or practical (see the Lab and Practical part of the Subjects page). */
  lab?: LabInfo
}

export interface LabInfo {
  /** Classes (grades) that have this lab, e.g. [11, 12]. A class gets it if it also has the subject. */
  grades: number[]
  /** Groups a class is split into for this lab: A, B, C... */
  groups: number
  /** Lab sessions each group gets in a week. */
  sessions: number
  /** Length of one lab session, in periods. */
  periods: number
  /** How many lab rooms the school has for this subject. */
  rooms: number
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
  /** Two or more teachers sharing the subject, with the periods each takes. Overrides pinnedTeacherId. */
  teachers?: TeacherShare[]
}

export interface TeacherShare {
  teacherId: Id
  periods: number
}

/**
 * Optional subjects that run at the same time (e.g. Physics / Nutrition / Economics).
 * Each student takes one. Students of several classes taking the same subject sit
 * together with one teacher.
 */
export interface OptionLine {
  id: Id
  name: string
  /** Classes in the line, e.g. XI Sc and XI Hu. */
  classIds: Id[]
  items: LineItem[]
}

export interface LineItem {
  subjectId: Id
  /** Classes whose students can take it: a subset of the line's classes. */
  classIds: Id[]
  periods: number
  /** Chosen teachers and their periods; empty = chosen automatically. */
  teachers: TeacherShare[]
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
  /** Option lines. Missing in files saved before this option. */
  lines?: OptionLine[]
}

export type SkillTier = 'primary' | 'secondary' | 'none'

export interface Assignment {
  classId: Id
  subjectId: Id
  periods: number
  teacherId: Id | null
  tier: SkillTier | null
  pinned: boolean
  /** Set for a subject taught in an option line: the line, and every class whose students sit in this lesson. */
  lineId?: Id
  lineClassIds?: Id[]
}

export interface Cell {
  /** Empty for a practical block period; see `lab`. */
  subjectId: Id
  teacherId: Id
  /** Set when this period is part of a practical block, where the class's groups are spread over the labs. */
  lab?: LabCell
  /** Set when this period belongs to an option line: the subjects running now. */
  line?: LineCell
}

export interface LineCell {
  lineId: Id
  name: string
  /** Subjects running in this period; each lists the classes whose students sit in it. */
  items: { subjectId: Id; teacherId: Id; classIds: Id[] }[]
}

export interface LabStation {
  /** 0-based group number: 0 = A. */
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
  /** Which group is in which lab; groups not listed are free this block. */
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
