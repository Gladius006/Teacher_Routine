import { describe, expect, it } from 'vitest'
import { assignTeachers } from './assign'
import { isAdjacent } from './blocks'
import { evaluate, teacherSlots } from './evaluate'
import { labGroups, labPlan, labTeacherPeriods } from './labs'
import { placeLessons } from './place'
import { mulberry32 } from './rng'
import { sampleSchool } from './sample'
import { generateRoutine, precheck } from './schedule'
import type { ClassSection, SchoolData, Subject } from './types'
import { exportSchool, importSchool } from '../store/io'

const sub = (id: string, lab?: Subject['lab']): Subject => ({ id, name: id, code: id, color: '#888', lab })
const LAB = { rooms: 1, capacity: 25, periods: 2 }
const byId = (subjects: Subject[]) => new Map(subjects.map((s) => [s.id, s]))
const science = (students: number, sessions: Record<string, number>): ClassSection => ({
  id: 'c', grade: 11, section: 'Sci', students,
  curriculum: Object.entries(sessions).map(([subjectId, labSessions]) => ({ subjectId, periods: 4, labSessions })),
})

describe('lab plan', () => {
  const subjects = [sub('phy', LAB), sub('che', LAB), sub('bio', LAB), sub('eng')]

  it('splits a class into groups that fit the smallest lab', () => {
    expect(labGroups(science(100, { phy: 1 }), byId(subjects))).toBe(4)
    expect(labGroups(science(101, { phy: 1 }), byId(subjects))).toBe(5)
    expect(labGroups({ ...science(100, { phy: 1 }), students: undefined }, byId(subjects))).toBe(1)
    const small = [sub('phy', { ...LAB, capacity: 20 }), sub('che', LAB)]
    expect(labGroups(science(100, { phy: 1, che: 1 }), byId(small))).toBe(5)
  })

  it('rotates 4 groups through 3 labs in 4 blocks, every group visiting every lab once', () => {
    const plan = labPlan(science(100, { phy: 1, che: 1, bio: 1 }), byId(subjects))!
    expect(plan.groups).toBe(4)
    expect(plan.length).toBe(2)
    expect(plan.blocks).toHaveLength(4)
    const visits = new Set<string>()
    for (const block of plan.blocks) {
      // One group per lab, and a group is in one lab at a time.
      expect(new Set(block.map((st) => st.subjectId)).size).toBe(block.length)
      expect(new Set(block.map((st) => st.group)).size).toBe(block.length)
      block.forEach((st) => visits.add(`${st.group}:${st.subjectId}`))
    }
    expect(visits.size).toBe(4 * 3)
    expect(labTeacherPeriods(plan, 'phy')).toBe(8)
  })

  it('runs a second round for a subject with two sessions a week', () => {
    const plan = labPlan(science(100, { phy: 2, che: 1 }), byId(subjects))!
    const phy = plan.blocks.flat().filter((st) => st.subjectId === 'phy')
    expect(phy).toHaveLength(8) // 4 groups x 2 sessions
    for (let g = 0; g < 4; g++) expect(phy.filter((st) => st.group === g)).toHaveLength(2)
  })

  it('a class without students goes to the labs as one group', () => {
    const plan = labPlan({ ...science(0, { phy: 1, che: 1 }) }, byId(subjects))!
    expect(plan.groups).toBe(1)
    expect(plan.blocks).toHaveLength(2)
    expect(plan.blocks.every((b) => b.length === 1)).toBe(true)
  })

  it('ignores subjects without a lab, and classes without lab sessions', () => {
    expect(labPlan(science(100, { eng: 1 }), byId(subjects))).toBeNull()
    expect(labPlan(science(100, { phy: 0 }), byId(subjects))).toBeNull()
  })
})

/** The sample school with Physics, Chemistry and Biology labs for classes 11 and 12 (100 students each). */
function labSchool(rooms = 1): SchoolData {
  const data = sampleSchool()
  for (const id of ['s-phy', 's-chem', 's-bio']) data.subjects.find((s) => s.id === id)!.lab = { ...LAB, rooms }
  for (const cls of data.classes) {
    if (cls.grade < 11) continue
    cls.students = 100
    // Make room in the week for 4 two-period practical blocks.
    cls.curriculum = cls.curriculum.map((i) => ({
      ...i,
      periods: ['s-phy', 's-chem', 's-bio'].includes(i.subjectId) ? i.periods - 2 : i.periods,
      labSessions: ['s-phy', 's-chem', 's-bio'].includes(i.subjectId) ? 1 : undefined,
    }))
  }
  return data
}

describe('lab blocks in the routine', () => {
  it('keeps every block together, never double-books a lab or teacher', () => {
    const data = labSchool()
    const r = generateRoutine(data, { seed: 1 })
    const P = data.settings.periodsPerDay
    for (const cls of data.classes.filter((c) => c.grade >= 11)) {
      const cells = r.grid[cls.id]
      const byBlock = new Map<number, number[]>()
      cells.forEach((c, s) => c?.lab && byBlock.set(c.lab.block, [...(byBlock.get(c.lab.block) ?? []), s]))
      expect(byBlock.size, cls.id).toBe(4)
      for (const slots of byBlock.values()) {
        expect(slots).toHaveLength(2)
        const [a, b] = slots
        expect(b - a).toBe(1)
        expect(Math.floor(a / P)).toBe(Math.floor(b / P))
        expect(isAdjacent(data.settings, a % P, Math.floor(a / P))).toBe(true)
        expect(cells[a]!.lab!.part).toBe(0)
      }
      // Theory periods are all still there.
      for (const item of cls.curriculum) {
        expect(cells.filter((c) => c?.subjectId === item.subjectId).length).toBe(item.periods)
      }
    }
    expect(r.issues.filter((i) => i.kind === 'labClash')).toEqual([])
    expect(r.stats.clashes).toBe(0)
  }, 30_000)

  it('the subject teacher takes the lab', () => {
    const data = labSchool()
    const r = generateRoutine(data, { seed: 2, maxIterations: 100_000 })
    const teacherOf = new Map(r.assignments.map((a) => [`${a.classId}:${a.subjectId}`, a.teacherId]))
    for (const [classId, cells] of Object.entries(r.grid)) {
      for (const c of cells) for (const st of c?.lab?.stations ?? []) expect(st.teacherId).toBe(teacherOf.get(`${classId}:${st.subjectId}`))
    }
  })

  it('a lab session is not counted as back-to-back classes', () => {
    const data = labSchool()
    const r = generateRoutine(data, { seed: 3, maxIterations: 100_000 })
    const slots = teacherSlots(data, r.grid)
    const P = data.settings.periodsPerDay
    for (const issue of r.issues.filter((i) => i.kind === 'restMissed')) {
      const s = issue.day! * P + issue.period! - 1
      const here = slots.get(issue.teacherId!)![s]
      expect(here.length === 1 && !!here[0].lab && here[0].lab.part === 0).toBe(false)
    }
  })

  it('search score matches a from-scratch evaluation', () => {
    const data = labSchool()
    const rng = mulberry32(4)
    const { assignments } = assignTeachers(data, rng)
    const placed = placeLessons(data, assignments, rng, { maxIterations: 40_000 })
    expect(placed.score).toBe(Math.round(evaluate(data, placed.grid).score))
  })

  it('lets two classes share a subject with two labs', () => {
    const r = generateRoutine(labSchool(2), { seed: 5, maxIterations: 100_000 })
    expect(r.issues.filter((i) => i.kind === 'labClash')).toEqual([])
  })

  it('counts lab periods when checking the week is long enough', () => {
    const data = labSchool()
    const cls = data.classes.find((c) => c.grade === 11)!
    cls.curriculum[0].periods += 10
    expect(precheck(data).find((i) => i.classId === cls.id)?.message).toMatch(/of them in labs/)
  })

  it('backups keep lab settings', () => {
    const back = importSchool(exportSchool(labSchool()))
    expect(back.subjects.find((s) => s.id === 's-phy')?.lab).toEqual(LAB)
    const c = back.classes.find((x) => x.grade === 12)!
    expect(c.students).toBe(100)
    expect(c.curriculum.find((i) => i.subjectId === 's-phy')?.labSessions).toBe(1)
  })
})
