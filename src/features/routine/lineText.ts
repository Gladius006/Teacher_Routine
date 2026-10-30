import { lineItemsFor } from '../../engine/lines'
import type { Id, LineCell } from '../../engine/types'

/** Two lines for an option line period in a class routine: the line's name and "Physics (P. Sen) / Nutrition (R. Das)". */
export function lineCellText(line: LineCell, classId: Id, subjectName: (id: Id) => string, teacherName: (id: Id) => string): [string, string] {
  const items = lineItemsFor(line, classId)
  return [line.name, items.map((i) => `${subjectName(i.subjectId)} (${teacherName(i.teacherId)})`).join(' / ')]
}

/** "XI Sc + XI Hu" for a lesson shared by several classes. */
export const sharedClasses = (classIds: Id[], className: (id: Id) => string) => classIds.map(className).join(' + ')

/** Who a teacher has in a period: "11 Sci", "11 Sci, Group A" (lab) or "XI Sc + XI Hu" (shared line lesson). */
export function slotClasses(h: { classId: Id; group?: number; lab?: unknown; classIds?: Id[] }, className: (id: Id) => string): string {
  if (h.lab) return `${className(h.classId)}, Group ${String.fromCharCode(65 + (h.group ?? 0))}`
  if (h.classIds) return sharedClasses(h.classIds, className)
  return className(h.classId)
}
