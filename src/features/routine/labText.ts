import { groupName } from '../../engine/labs'
import type { Id, LabCell } from '../../engine/types'

/** Two lines for a practical block period in a class routine: "Practical" and where each group is. */
export function labCellText(lab: LabCell, subjectName: (id: Id) => string): [string, string] {
  const parts = lab.stations.map((st) => `${groupName(st.group)} ${subjectName(st.subjectId)}`)
  const off = Array.from({ length: lab.groups }, (_, g) => g).filter((g) => !lab.stations.some((st) => st.group === g))
  if (off.length) parts.push(`${off.map(groupName).join(', ')} off`)
  return [lab.groups > 1 ? 'Practical' : `${subjectName(lab.stations[0].subjectId)} lab`, parts.join(', ')]
}
