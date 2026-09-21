import type { SchoolData } from '../engine/types'

export type Section = 'settings' | 'subjects' | 'teachers' | 'classes'
const SECTIONS: Section[] = ['settings', 'subjects', 'teachers', 'classes']

/** Which parts of the school changed between two saves, for the activity log. */
export function changedSections(before: SchoolData, after: SchoolData): Section[] {
  return SECTIONS.filter((k) => before[k] !== after[k] && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
}
