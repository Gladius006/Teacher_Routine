import { describe, expect, it } from 'vitest'
import { assignTeachers } from './assign'
import { isAdjacent } from './blocks'
import { evaluate, teacherSlots } from './evaluate'
import { cleanLab, groupName, labPeriods, labPlan, labTeacherPeriods } from './labs'
import { placeLessons } from './place'
import { mulberry32 } from './rng'
import { sampleSchool } from './sample'
import { generateRoutine, precheck } from './schedule'
import type { ClassSection, LabInfo, SchoolData, Subject } from './types'
import { exportSchool, importSchool } from '../store/io'

const LAB: LabInfo = { grades: [11, 12], groups: 4, sessions: 1, periods: 2, rooms: 1 }
const sub = (id: string, lab?: Partial<LabInfo>): Subject => ({ id, name: id, code: id, color: '#888', ...(lab ? { lab: { ...LAB, ...lab } } : {}) })
const byId = (subjects: Subject[]) => new Map(subjects.map((s) => [s.id, s]))
const cls = (grade: number, ...subjectIds: string[]): ClassSection => ({
  id: 'c', grade, section: 'Sci', curriculum: subjectIds.map((subjectId) => ({ subjectId, periods: 4 })),
})

describe('lab plan', () => {
  const subjects = [sub('phy', {}), sub('che', {}), sub('bio', {}), sub('eng')]

  it('names groups A, B, C, D', () => {
    expect([0, 1, 2, 3].map(groupName)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('runs the three labs side by side: 4 lab times, one group free in each', () => {
    const plan = labPlan(cls(11, 'phy', 'che', 'bio', 'eng'), byId(subjects))!
    expect(plan.groups).toBe(4)
    expect(plan.blocks).toHaveLength(4)
    const visits = new Set<string>()
    for (const block of plan.blocks) {
      expect(block.length).toBe(2)
      expect(block.stations).toHaveLength(3)
      // A lab takes one group at a time, and a group is in one lab at a time.
      expect(new Set(block.stations.map((st) => st.subjectId)).size).toBe(3)
      expect(new Set(block.stations.map((st) => st.group)).size).toBe(3)
      block.stations.forEach((st) => visits.add(`${st.group}:${st.subjectId}`))
    }
    expect(visits.size).toBe(4 * 3)
    expect(labPeriods(plan)).toBe(8)
    expect(labTeacherPeriods(plan, 'phy')).toBe(8)
  })

  it('only gives labs to the grades chosen, and only for subjects the class has', () => {
    expect(labPlan(cls(10, 'phy', 'che'), byId(subjects))).toBeNull()
    expect(labPlan(cls(11, 'eng'), byId(subjects))).toBeNull()
    expect(labPlan(cls(11, 'phy'), byId(subjects))!.blocks).toHaveLength(4)
  })

  it('lets each lab have its own number of groups', () => {
    const mixed = [sub('phy', {}), sub('comp', { groups: 2 })]
    const plan = labPlan(cls(11, 'phy', 'comp'), byId(mixed))!
    expect(plan.groups).toBe(4)
    const comp = plan.blocks.flatMap((b) => b.stations).filter((st) => st.subjectId === 'comp')
    expect(comp.map((st) => st.group).sort()).toEqual([0, 1])
    expect(plan.blocks.flatMap((b) => b.stations).filter((st) => st.subjectId === 'phy')).toHaveLength(4)
  })

  it('keeps labs of different lengths in separate lab times', () => {
    const mixed = [sub('phy', {}), sub('comp', { periods: 3 })]
    const plan = labPlan(cls(11, 'phy', 'comp'), byId(mixed))!
    for (const b of plan.blocks) expect(new Set(b.stations.map((st) => st.subjectId)).size).toBe(1)
    expect(labPeriods(plan)).toBe(4 * 3 + 4 * 2)
  })

  it('runs a second round for two sessions a week', () => {
    const plan = labPlan(cls(11, 'phy', 'che'), byId([sub('phy', { sessions: 2 }), sub('che', {})]))!
    const phy = plan.blocks.flatMap((b) => b.stations).filter((st) => st.subjectId === 'phy')
    expect(phy).toHaveLength(8)
    for (let g = 0; g < 4; g++) expect(phy.filter((st) => st.group === g)).toHaveLength(2)
  })

  it('a lab with one group takes the whole class', () => {
    const plan = labPlan(cls(11, 'phy'), byId([sub('phy', { groups: 1 })]))!
    expect(plan.groups).toBe(1)
    expect(plan.blocks).toEqual([{ length: 2, stations: [{ group: 0, subjectId: 'phy' }] }])
  })

  it('ignores lab settings saved by earlier versions', () => {
    const old = { ...sub('phy'), lab: { rooms: 1, capacity: 25, periods: 2 } } as unknown as Subject
    expect(labPlan(cls(11, 'phy'), byId([old]))).toBeNull()
    expect(cleanLab(old).lab).toBeUndefined()
  })
})

/** The sample school with Physics, Chemistry and Biology labs (4 groups) for classes 11 and 12. */
function labSchool(rooms = 1): SchoolData {
  const data = sampleSchool()
  for (const id of ['s-phy', 's-chem', 's-bio']) data.subjects.find((s) => s.id === id)!.lab = { ...LAB, rooms }
  for (const c of data.classes) {
    if (c.grade < 11) continue
    // Make room in the week for 4 two-period lab times.
    c.curriculum = c.curriculum.map((i) => (['s-phy', 's-chem', 's-bio'].includes(i.subjectId) ? { ...i, periods: i.periods - 2 } : i))
  }
  return data
}

describe('labs in the routine', () => {
  it('keeps every lab time together, never double-books a lab or teacher', () => {
    const data = labSchool()
    const r = generateRoutine(data, { seed: 1 })
    const P = data.settings.periodsPerDay
    for (const c of data.classes.filter((x) => x.grade >= 11)) {
      const cells = r.grid[c.id]
      const byBlock = new Map<number, number[]>()
      cells.forEach((cell, s) => cell?.lab && byBlock.set(cell.lab.block, [...(byBlock.get(cell.lab.block) ?? []), s]))
      expect(byBlock.size, c.id).toBe(4)
      for (const slots of byBlock.values()) {
        expect(slots).toHaveLength(2)
        const [a, b] = slots
        expect(b - a).toBe(1)
        expect(isAdjacent(data.settings, a % P, Math.floor(a / P))).toBe(true)
      }
      for (const item of c.curriculum) expect(cells.filter((x) => x?.subjectId === item.subjectId).length).toBe(item.periods)
    }
    expect(r.issues.filter((i) => i.kind === 'labClash')).toEqual([])
    expect(r.stats.clashes).toBe(0)
  }, 30_000)

  it('the class teacher for the subject takes its lab', () => {
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
      const here = slots.get(issue.teacherId!)![issue.day! * P + issue.period! - 1]
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
    const c = data.classes.find((x) => x.grade === 11)!
    c.curriculum[0].periods += 10
    expect(precheck(data).find((i) => i.classId === c.id)?.message).toMatch(/of them in labs/)
  })

  it('backups keep lab settings and drop out-of-date ones', () => {
    const data = labSchool()
    expect(importSchool(exportSchool(data)).subjects.find((s) => s.id === 's-phy')?.lab).toEqual(LAB)
    const raw = JSON.parse(exportSchool(data))
    raw.data.subjects.find((s: Subject) => s.id === 's-phy').lab = { rooms: 1, capacity: 25, periods: 2 }
    expect(importSchool(JSON.stringify(raw)).subjects.find((s) => s.id === 's-phy')?.lab).toBeUndefined()
  })
})
