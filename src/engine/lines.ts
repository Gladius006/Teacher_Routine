import type { Id, LineCell, OptionLine, SchoolData } from './types'

/** Lines, dropping classes and subjects that no longer exist. */
export function validLines(data: SchoolData): OptionLine[] {
  const classIds = new Set(data.classes.map((c) => c.id))
  const subjectIds = new Set(data.subjects.map((s) => s.id))
  return (data.lines ?? [])
    .map((l) => {
      const lineClasses = l.classIds.filter((id) => classIds.has(id))
      return {
        ...l,
        classIds: lineClasses,
        items: l.items
          .filter((i) => subjectIds.has(i.subjectId))
          .map((i) => ({ ...i, classIds: i.classIds.filter((id) => lineClasses.includes(id)) }))
          .filter((i) => i.classIds.length > 0 && i.periods > 0),
      }
    })
    .filter((l) => l.classIds.length > 0 && l.items.length > 0)
}

/** Subjects a class takes through option lines; its own periods for these are not scheduled separately. */
export function lineSubjects(data: SchoolData, classId: Id): Set<Id> {
  const out = new Set<Id>()
  for (const l of validLines(data)) for (const i of l.items) if (i.classIds.includes(classId)) out.add(i.subjectId)
  return out
}

/** Periods a week a class spends in a line, at least: the longest of its subjects there. */
export function linePeriodsFor(line: OptionLine, classId: Id): number {
  return Math.max(0, ...line.items.filter((i) => i.classIds.includes(classId)).map((i) => i.periods))
}

/** One period's worth of a line subject with its teacher. */
export interface LineLesson {
  subjectId: Id
  teacherId: Id
  classIds: Id[]
}

/**
 * Packs a line's lessons into shared periods. Every subject runs at most once in
 * a period, and a teacher is never in two subjects at once (e.g. Economics and
 * Education with the same teacher go in different periods). Subjects with the
 * most periods go first, so the line takes as few periods as it can.
 */
export function packLine(lessons: LineLesson[]): LineLesson[][] {
  const count = new Map<Id, number>()
  for (const l of lessons) count.set(l.subjectId, (count.get(l.subjectId) ?? 0) + 1)
  const ordered = [...lessons].sort((a, b) => count.get(b.subjectId)! - count.get(a.subjectId)!)
  const slots: LineLesson[][] = []
  for (const l of ordered) {
    const slot = slots.find((s) => !s.some((x) => x.subjectId === l.subjectId || x.teacherId === l.teacherId))
    if (slot) slot.push(l)
    else slots.push([l])
  }
  return slots
}

/** The subjects in a line period that a class's students take. */
export const lineItemsFor = (line: LineCell, classId: Id) => line.items.filter((i) => i.classIds.includes(classId))
