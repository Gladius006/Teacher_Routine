import type { ClassSection, CurriculumItem, SchoolData, Subject } from './types'

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

/** Periods a week a subject gets when it is added to a class without being asked. */
export const DEFAULT_SUBJECT_PERIODS = 4

export const subjectPeriods = (s: Subject) => Math.max(1, Math.round(s.periods ?? DEFAULT_SUBJECT_PERIODS))

/** The starting subject list for a new class: every subject taught in its grade. */
export function curriculumFor(subjects: Subject[], grade: number): CurriculumItem[] {
  return subjects.filter((s) => isOffered(s, grade)).map(newItem)
}

/** A subject as it first goes into a class, with its default periods. */
function newItem(s: Subject): CurriculumItem {
  return { subjectId: s.id, periods: subjectPeriods(s), pinnedTeacherId: null }
}

/**
 * Keeps classes in step with a subject's grades after it is added or edited:
 * classes in a newly allowed grade get it, classes in a grade it was taken
 * out of lose it. Classes whose grade didn't change are left alone, so a
 * subject someone removed from one class by hand stays removed.
 */
export function syncSubjectClasses(classes: ClassSection[], before: Subject | undefined, after: Subject): ClassSection[] {
  return classes.map((c) => {
    const was = before !== undefined && isOffered(before, c.grade)
    const now = isOffered(after, c.grade)
    const has = c.curriculum.some((i) => i.subjectId === after.id)
    if (now && !was && !has) return { ...c, curriculum: [...c.curriculum, newItem(after)] }
    if (!now && was && has) return { ...c, curriculum: c.curriculum.filter((i) => i.subjectId !== after.id) }
    return c
  })
}
