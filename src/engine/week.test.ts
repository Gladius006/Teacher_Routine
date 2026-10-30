import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './sample'
import type { LabInfo, SchoolData, Subject } from './types'
import { describeWeek, weekUse } from './week'

const S = (id: string, lab?: Partial<LabInfo>): Subject => ({
  id, name: id, code: id, color: '#888',
  ...(lab ? { lab: { grades: [11, 12], groups: 4, sessions: 1, periods: 2, rooms: 1, ...lab } } : {}),
})

/** XI Science as entered from the school's routine: 32 subject periods, with a half-day Saturday (44 a week). */
function xiScience(sessions: number): SchoolData {
  return {
    settings: { ...DEFAULT_SETTINGS, shortDays: { Sat: 4 } },
    subjects: [S('ben'), S('eng'), S('math'), S('phy', { sessions }), S('che', { sessions }), S('bio', { groups: 5, sessions })],
    teachers: [],
    classes: [{
      id: 'xi', grade: 11, section: 'Science',
      curriculum: [['ben', 6], ['eng', 6], ['math', 8], ['phy', 4], ['che', 4], ['bio', 4]].map(([subjectId, periods]) => ({ subjectId: subjectId as string, periods: periods as number })),
    }],
  }
}

describe('where a class week goes', () => {
  it('one lab a week per group: 5 lab times, 42 of 44', () => {
    const data = xiScience(1)
    const w = weekUse(data, data.classes[0])
    expect(w.plan!.blocks).toHaveLength(5)
    expect(describeWeek(w)).toBe('Subjects 32 + Labs 10 = 42 of 44')
  })

  it('two labs a week per group doubles the lab time', () => {
    const data = xiScience(2)
    expect(describeWeek(weekUse(data, data.classes[0]))).toBe('Subjects 32 + Labs 20 = 52 of 44')
  })
})
