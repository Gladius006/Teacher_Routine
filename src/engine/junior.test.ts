import { describe, expect, it } from 'vitest'
import { assignTeachers, canTake, canTakeJunior } from './assign'
import { mulberry32 } from './rng'
import { DEFAULT_SETTINGS } from './sample'
import { generateRoutine } from './schedule'
import type { SchoolData, Teacher } from './types'
import { importSchool, exportSchool } from '../store/io'

const T = (id: string, primary: string[], secondary: string[] = [], junior?: string[]): Teacher => ({
  id, name: id, code: id, primary, secondary, junior, maxPerDay: 6, maxPerWeek: 30,
})

describe('junior class subjects', () => {
  const phy = T('phy', ['s-phy'], ['s-chem'], ['s-math'])

  it('a teacher with a junior list only takes their own subjects and that list', () => {
    expect(canTakeJunior(phy, 's-phy')).toBe(true)
    expect(canTakeJunior(phy, 's-chem')).toBe(true)
    expect(canTakeJunior(phy, 's-math')).toBe(true)
    expect(canTakeJunior(phy, 's-ben')).toBe(false)
  })

  it('a teacher without a list can take any subject in junior classes, as before', () => {
    expect(canTakeJunior(T('old', ['s-phy']), 's-ben')).toBe(true)
  })

  it('junior lists never let a teacher into a senior class', () => {
    expect(canTake(phy, 's-math', false)).toBe(false)
    expect(canTake(phy, 's-chem', false)).toBe(true)
  })

  const school = (teachers: Teacher[]): SchoolData => ({
    settings: { ...DEFAULT_SETTINGS },
    subjects: [
      { id: 's-ben', name: 'Bengali', code: 'BEN', color: '#888' },
      { id: 's-phy', name: 'Physics', code: 'PHY', color: '#888' },
    ],
    teachers,
    classes: [{ id: 'c-6A', grade: 6, section: 'A', curriculum: [{ subjectId: 's-ben', periods: 5 }] }],
  })

  it('never gives Bengali in a junior class to a physics teacher who may not take it', () => {
    const data = school([T('phy', ['s-phy'], [], []), T('ben', ['s-ben'])])
    for (let seed = 1; seed <= 20; seed++) {
      const { assignments } = assignTeachers(data, mulberry32(seed))
      expect(assignments[0].teacherId).toBe('ben')
    }
  })

  it('reports a junior subject nobody may take', () => {
    const r = generateRoutine(school([T('phy', ['s-phy'], [], [])]), { seed: 1, maxIterations: 2_000 })
    const issue = r.issues.find((i) => i.kind === 'unassigned')
    expect(issue?.message).toContain('in junior classes')
  })

  it('warns about a pin that breaks the junior list', () => {
    const data = school([T('phy', ['s-phy'], [], []), T('ben', ['s-ben'])])
    data.classes[0].curriculum[0].pinnedTeacherId = 'phy'
    const { issues } = assignTeachers(data, mulberry32(1))
    expect(issues.some((i) => i.kind === 'pinInvalid' && i.message.includes('junior class subjects'))).toBe(true)
  })

  it('backups keep the junior list and reject a broken one', () => {
    const data = school([T('phy', ['s-phy'], [], ['s-ben'])])
    expect(importSchool(exportSchool(data)).teachers[0].junior).toEqual(['s-ben'])
    const broken = JSON.parse(exportSchool(data))
    broken.data.teachers[0].junior = 'Bengali'
    expect(() => importSchool(JSON.stringify(broken))).toThrow(/teachers/)
  })
})
