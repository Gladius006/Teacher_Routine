import type { SchoolData, Subject } from './types'

/** Grades shown in the subject editor. */
export const GRADE_OPTIONS = [5, 6, 7, 8, 9, 10, 11, 12]

export const gradesUpTo = (max: number) => GRADE_OPTIONS.filter((g) => g <= max)

export function isOffered(subject: Subject | undefined, grade: number): boolean {
  return !subject?.grades || subject.grades.includes(grade)
}

/** "5-7, 9, 11-12" for a list of grades. */
export function formatGrades(grades: number[]): string {
  const g = [...new Set(grades)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < g.length; i++) {
    let j = i
    while (j + 1 < g.length && g[j + 1] === g[j] + 1) j++
    parts.push(j === i ? `${g[i]}` : `${g[i]}-${g[j]}`)
    i = j
  }
  return parts.join(', ')
}

/** Every class that has a subject it isn't taught in, e.g. Art in class 9. */
export function misplacedSubjects(data: SchoolData) {
  const byId = new Map(data.subjects.map((s) => [s.id, s]))
  const out: { classId: string; subjectId: string; periods: number }[] = []
  for (const c of data.classes) {
    for (const item of c.curriculum) {
      if (item.periods > 0 && !isOffered(byId.get(item.subjectId), c.grade)) {
        out.push({ classId: c.id, subjectId: item.subjectId, periods: item.periods })
      }
    }
  }
  return out
}
