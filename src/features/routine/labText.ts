import { groupName } from '../../engine/labs'
import type { Id, LabCell } from '../../engine/types'

/** Each group in a lab period, in order: "A: Physics", "B: Chemistry", "D: Free". */
export function labGroupsText(lab: LabCell, subjectName: (id: Id) => string): string[] {
  return Array.from({ length: lab.groups }, (_, g) => {
    const st = lab.stations.find((x) => x.group === g)
    return `${groupName(g)}: ${st ? subjectName(st.subjectId) : 'Free'}`
  })
}

/** Two lines for a lab period in a class routine: "Lab" and where each group is. */
export function labCellText(lab: LabCell, subjectName: (id: Id) => string): [string, string] {
  return [lab.groups > 1 ? 'Lab' : `${subjectName(lab.stations[0].subjectId)} lab`, labGroupsText(lab, subjectName).join(', ')]
}

/** "11 Sci, Group A" for a teacher's lab period. */
export const groupLabel = (cls: string, group: number | undefined) => `${cls}, Group ${groupName(group ?? 0)}`
