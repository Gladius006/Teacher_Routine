import type { SchoolData } from '../engine/types'

export const FILE_VERSION = 1

export function exportSchool(data: SchoolData): string {
  return JSON.stringify({ app: 'routine-builder', version: FILE_VERSION, data }, null, 2)
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)

/** Parses an exported file. Throws an Error with a message fit to show the user. */
export function importSchool(text: string): SchoolData {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON. Choose a file exported from Routine Builder.')
  }
  const obj = raw as { data?: unknown }
  const d = (obj && typeof obj === 'object' && 'data' in obj ? obj.data : raw) as Partial<SchoolData> | null
  const bad = (what: string) => new Error(`This file is missing or has broken ${what}. Choose a file exported from Routine Builder.`)
  if (!d || typeof d !== 'object') throw bad('school data')

  const s = d.settings
  if (
    !s || !isStrArr(s.dayNames) || !isNum(s.periodsPerDay) || !(s.lunchAfter === null || isNum(s.lunchAfter)) ||
    !isNum(s.juniorMaxGrade) || !isNum(s.maxSubjectPerDay) || !isNum(s.defaultMaxPerDay) || !isNum(s.defaultMaxPerWeek)
  ) throw bad('settings')

  if (!Array.isArray(d.subjects) || !d.subjects.every((x) => x && isStr(x.id) && isStr(x.name) && isStr(x.code) && isStr(x.color) &&
    (x.grades === undefined || (Array.isArray(x.grades) && x.grades.every(isNum)))))
    throw bad('subjects')
  if (!Array.isArray(d.teachers) || !d.teachers.every((x) =>
    x && isStr(x.id) && isStr(x.name) && isStr(x.code) && isStrArr(x.primary) && isStrArr(x.secondary) && isNum(x.maxPerDay) && isNum(x.maxPerWeek)))
    throw bad('teachers')
  if (!Array.isArray(d.classes) || !d.classes.every((x) =>
    x && isStr(x.id) && isNum(x.grade) && isStr(x.section) && Array.isArray(x.curriculum) &&
    x.curriculum.every((c) => c && isStr(c.subjectId) && isNum(c.periods))))
    throw bad('classes')

  return { settings: s, subjects: d.subjects, teachers: d.teachers, classes: d.classes }
}
