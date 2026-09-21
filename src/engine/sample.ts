import type { ClassSection, SchoolData, Settings, Subject, Teacher } from './types'

export const DEFAULT_SETTINGS: Settings = {
  dayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  periodsPerDay: 8,
  lunchAfter: 4,
  juniorMaxGrade: 7,
  maxSubjectPerDay: 2,
  defaultMaxPerDay: 6,
  defaultMaxPerWeek: 30,
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

const subjects: Subject[] = [
  { id: 's-eng', name: 'English', code: 'ENG', color: '#3b6fd8', grades: range(5, 12) },
  { id: 's-ben', name: 'Bengali', code: 'BEN', color: '#c2410c', grades: range(5, 10) },
  { id: 's-hin', name: 'Hindi', code: 'HIN', color: '#b45309', grades: range(5, 8) },
  { id: 's-math', name: 'Mathematics', code: 'MATH', color: '#6d4fd1', grades: range(5, 12) },
  { id: 's-sci', name: 'Science', code: 'SCI', color: '#0f8a6a', grades: range(5, 8) },
  { id: 's-phy', name: 'Physics', code: 'PHY', color: '#0e7490', grades: range(9, 12) },
  { id: 's-chem', name: 'Chemistry', code: 'CHEM', color: '#be185d', grades: range(9, 12) },
  { id: 's-bio', name: 'Biology', code: 'BIO', color: '#4d7c0f', grades: range(9, 12) },
  { id: 's-hist', name: 'History', code: 'HIST', color: '#92400e', grades: range(5, 10) },
  { id: 's-geo', name: 'Geography', code: 'GEO', color: '#047857', grades: range(5, 10) },
  { id: 's-comp', name: 'Computer', code: 'COMP', color: '#475569', grades: range(5, 12) },
  { id: 's-pe', name: 'Physical Ed.', code: 'PE', color: '#dc2626', grades: range(5, 12) },
  { id: 's-art', name: 'Art', code: 'ART', color: '#a21caf', grades: range(5, 7) },
]

const T = (id: string, name: string, code: string, primary: string[], secondary: string[] = []): Teacher => ({
  id, name, code, primary, secondary, maxPerDay: 6, maxPerWeek: 30,
})

const teachers: Teacher[] = [
  T('t-01', 'Ananya Sen', 'AS', ['s-eng'], ['s-hist']),
  T('t-02', 'Rahul Bose', 'RB', ['s-eng']),
  T('t-03', 'Priya Das', 'PD', ['s-eng'], ['s-ben']),
  T('t-04', 'Soumitra Roy', 'SR', ['s-eng'], ['s-geo']),
  T('t-05', 'Moumita Ghosh', 'MG', ['s-ben'], ['s-hist']),
  T('t-06', 'Arijit Paul', 'AP', ['s-ben'], ['s-eng']),
  T('t-07', 'Sunita Mondal', 'SM', ['s-ben']),
  T('t-08', 'Neha Sharma', 'NS', ['s-hin'], ['s-eng']),
  T('t-09', 'Kaushik Dutta', 'KD', ['s-math'], ['s-phy']),
  T('t-10', 'Debashis Kar', 'DK', ['s-math'], ['s-comp']),
  T('t-11', 'Tanushree Saha', 'TS', ['s-math'], ['s-sci']),
  T('t-12', 'Sanjay Mitra', 'SJ', ['s-math']),
  T('t-13', 'Rituparna Nag', 'RN', ['s-math'], ['s-phy']),
  T('t-14', 'Amit Banerjee', 'AB', ['s-phy'], ['s-math']),
  T('t-15', 'Sreya Chatterjee', 'SC', ['s-phy'], ['s-chem']),
  T('t-16', 'Pradip Halder', 'PH', ['s-chem'], ['s-bio']),
  T('t-17', 'Madhumita Pal', 'MP', ['s-chem'], ['s-sci']),
  T('t-18', 'Suman Sarkar', 'SS', ['s-bio'], ['s-sci']),
  T('t-19', 'Payel Mukherjee', 'PM', ['s-bio'], ['s-chem']),
  T('t-20', 'Indrani Basu', 'IB', ['s-sci'], ['s-bio']),
  T('t-21', 'Tapas Majumdar', 'TM', ['s-sci'], ['s-math']),
  T('t-22', 'Joydeep Ganguly', 'JG', ['s-hist'], ['s-geo']),
  T('t-23', 'Rina Chakraborty', 'RC', ['s-geo'], ['s-hist']),
  T('t-24', 'Abhijit Sinha', 'ABS', ['s-hist'], ['s-ben']),
  T('t-25', 'Kakoli Dey', 'KDY', ['s-geo'], ['s-eng']),
  T('t-26', 'Sourav Kundu', 'SK', ['s-comp'], ['s-math']),
  T('t-27', 'Barnali Hazra', 'BH', ['s-comp']),
  T('t-28', 'Rajesh Yadav', 'RY', ['s-pe']),
  T('t-29', 'Mita Biswas', 'MB', ['s-art'], ['s-hin']),
  T('t-30', 'Nirmal Jana', 'NJ', ['s-pe'], ['s-geo']),
]

type Plan = [string, number][]
const junior: Plan = [['s-eng', 7], ['s-ben', 6], ['s-hin', 4], ['s-math', 7], ['s-sci', 6], ['s-hist', 3], ['s-geo', 3], ['s-comp', 2], ['s-pe', 3], ['s-art', 2]]
const middle: Plan = [['s-eng', 7], ['s-ben', 6], ['s-hin', 3], ['s-math', 8], ['s-sci', 7], ['s-hist', 3], ['s-geo', 3], ['s-comp', 2], ['s-pe', 2]]
const secondary: Plan = [['s-eng', 7], ['s-ben', 6], ['s-math', 8], ['s-phy', 4], ['s-chem', 4], ['s-bio', 4], ['s-hist', 3], ['s-geo', 3], ['s-comp', 2], ['s-pe', 2]]
const higher: Plan = [['s-eng', 6], ['s-math', 8], ['s-phy', 7], ['s-chem', 7], ['s-bio', 6], ['s-comp', 4], ['s-pe', 2]]

const C = (grade: number, section: string, plan: Plan): ClassSection => ({
  id: `c-${grade}${section}`,
  grade,
  section,
  curriculum: plan.map(([subjectId, periods]) => ({ subjectId, periods })),
})

const classes: ClassSection[] = [
  C(5, 'A', junior), C(5, 'B', junior),
  C(6, 'A', junior), C(6, 'B', junior),
  C(7, 'A', junior), C(7, 'B', junior),
  C(8, 'A', middle), C(8, 'B', middle),
  C(9, 'A', secondary), C(9, 'B', secondary),
  C(10, 'A', secondary), C(10, 'B', secondary),
  C(11, 'Sci', higher), C(12, 'Sci', higher),
]

export function sampleSchool(): SchoolData {
  return structuredClone({ settings: DEFAULT_SETTINGS, subjects, teachers, classes })
}

export function emptySchool(): SchoolData {
  return { settings: structuredClone(DEFAULT_SETTINGS), subjects: [], teachers: [], classes: [] }
}
