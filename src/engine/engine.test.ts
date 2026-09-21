import { describe, expect, it } from 'vitest'
import { assignTeachers, isJunior, tierOf } from './assign'
import { blockLengths, isAdjacent, restCapacityPerDay } from './blocks'
import { evaluate, teacherSlots } from './evaluate'
import { placeLessons } from './place'
import { mulberry32, randInt } from './rng'
import { DEFAULT_SETTINGS, sampleSchool } from './sample'
import { generateRoutine, hashInputs } from './schedule'
import type { Routine, SchoolData, Settings } from './types'

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over })

/** Hard rules that must hold for every routine the engine produces. */
function assertHardRules(data: SchoolData, r: Routine) {
  const P = data.settings.periodsPerDay
  const D = data.settings.dayNames.length
  const unplaced = new Set(r.issues.filter((i) => i.kind === 'unplaced' || i.kind === 'unassigned').map((i) => `${i.classId}:${i.subjectId}`))

  for (const [tid, week] of teacherSlots(data, r.grid)) {
    const t = data.teachers.find((x) => x.id === tid)!
    week.forEach((slot) => expect(slot.length, `${t.name} double-booked`).toBeLessThanOrEqual(1))
    for (let d = 0; d < D; d++) {
      const n = week.slice(d * P, d * P + P).reduce((s, x) => s + x.length, 0)
      expect(n, `${t.name} over daily max`).toBeLessThanOrEqual(t.maxPerDay)
    }
    expect(week.reduce((s, x) => s + x.length, 0)).toBeLessThanOrEqual(t.maxPerWeek)
  }

  for (const cls of data.classes) {
    const cells = r.grid[cls.id]
    expect(cells).toHaveLength(D * P)
    for (const item of cls.curriculum) {
      const placed = cells.filter((c) => c?.subjectId === item.subjectId).length
      if (!unplaced.has(`${cls.id}:${item.subjectId}`)) expect(placed, `${cls.id} ${item.subjectId}`).toBe(item.periods)
    }
    if (!isJunior(cls, data.settings)) {
      for (const cell of cells) {
        if (!cell) continue
        const t = data.teachers.find((x) => x.id === cell.teacherId)!
        expect(tierOf(t, cell.subjectId), `${t.name} unskilled in senior class`).not.toBe('none')
      }
    }
  }
}

/** Random small school: enough teachers that a clash-free routine exists. */
function randomSchool(seed: number): SchoolData {
  const rng = mulberry32(seed)
  const subjects = ['A', 'B', 'C', 'D', 'E'].map((c, i) => ({ id: `s${i}`, name: `Subj ${c}`, code: c, color: '#888' }))
  const teachers = Array.from({ length: 8 }, (_, i) => ({
    id: `t${i}`, name: `Teacher ${i}`, code: `T${i}`,
    primary: [subjects[i % 5].id], secondary: [subjects[(i + 2) % 5].id],
    maxPerDay: 5, maxPerWeek: 22,
  }))
  const classes = Array.from({ length: 5 }, (_, i) => ({
    id: `c${i}`, grade: 5 + i, section: 'A',
    curriculum: subjects.map((s) => ({ subjectId: s.id, periods: 3 + randInt(rng, 4) })),
  }))
  return { settings: settings({ dayNames: ['M', 'T', 'W', 'T', 'F'], periodsPerDay: 6, lunchAfter: 3, juniorMaxGrade: 7 }), subjects, teachers, classes }
}

describe('blocks', () => {
  it('splits the day at lunch', () => {
    expect(blockLengths(settings())).toEqual([4, 4])
    expect(blockLengths(settings({ lunchAfter: null }))).toEqual([8])
    expect(blockLengths(settings({ lunchAfter: 8 }))).toEqual([8])
  })
  it('treats lunch as rest', () => {
    expect(isAdjacent(settings(), 3)).toBe(false) // period 4 -> 5 crosses lunch
    expect(isAdjacent(settings(), 2)).toBe(true)
    expect(isAdjacent(settings(), 7)).toBe(false) // last period
  })
  it('computes rest capacity', () => {
    expect(restCapacityPerDay(settings())).toBe(4)
    expect(restCapacityPerDay(settings({ periodsPerDay: 7, lunchAfter: 4 }))).toBe(4)
    expect(restCapacityPerDay(settings({ lunchAfter: null }))).toBe(4)
    expect(restCapacityPerDay(settings({ periodsPerDay: 7, lunchAfter: null }))).toBe(4)
  })
})

describe('assignTeachers', () => {
  const base = (): SchoolData => ({
    settings: settings(),
    subjects: [{ id: 'm', name: 'Maths', code: 'M', color: '#000' }, { id: 'p', name: 'Physics', code: 'P', color: '#000' }],
    teachers: [
      { id: 'tm', name: 'Maths T', code: 'TM', primary: ['m'], secondary: [], maxPerDay: 6, maxPerWeek: 30 },
      { id: 'tp', name: 'Physics T', code: 'TP', primary: ['p'], secondary: ['m'], maxPerDay: 6, maxPerWeek: 30 },
    ],
    classes: [],
  })

  it('senior class only gets skilled teachers and prefers primary', () => {
    const data = base()
    data.classes = [{ id: 'c', grade: 10, section: 'A', curriculum: [{ subjectId: 'm', periods: 5 }, { subjectId: 'p', periods: 5 }] }]
    const { assignments } = assignTeachers(data, mulberry32(1))
    expect(assignments.find((a) => a.subjectId === 'm')!.teacherId).toBe('tm')
    expect(assignments.find((a) => a.subjectId === 'p')!.teacherId).toBe('tp')
  })

  it('senior class with no skilled teacher is unassigned', () => {
    const data = base()
    data.subjects.push({ id: 'b', name: 'Biology', code: 'B', color: '#000' })
    data.classes = [{ id: 'c', grade: 11, section: 'A', curriculum: [{ subjectId: 'b', periods: 4 }] }]
    const { assignments, issues } = assignTeachers(data, mulberry32(1))
    expect(assignments[0].teacherId).toBeNull()
    expect(issues.some((i) => i.kind === 'unassigned')).toBe(true)
  })

  it('junior class may go to a teacher without the skill', () => {
    const data = base()
    data.subjects.push({ id: 'b', name: 'Biology', code: 'B', color: '#000' })
    data.classes = [{ id: 'c', grade: 5, section: 'A', curriculum: [{ subjectId: 'b', periods: 4 }] }]
    const { assignments, issues } = assignTeachers(data, mulberry32(1))
    expect(assignments[0].teacherId).not.toBeNull()
    expect(assignments[0].tier).toBe('none')
    expect(issues.some((i) => i.kind === 'outsideSkill')).toBe(true)
  })

  it('keeps pins even when another teacher scores better', () => {
    const data = base()
    data.classes = [{ id: 'c', grade: 10, section: 'A', curriculum: [{ subjectId: 'm', periods: 5, pinnedTeacherId: 'tp' }] }]
    const { assignments } = assignTeachers(data, mulberry32(1))
    expect(assignments[0]).toMatchObject({ teacherId: 'tp', pinned: true, tier: 'secondary' })
  })

  it('never exceeds weekly capacity', () => {
    const data = base()
    data.teachers[0].maxPerWeek = 8
    data.teachers[1].secondary = []
    data.classes = [
      { id: 'c1', grade: 10, section: 'A', curriculum: [{ subjectId: 'm', periods: 6 }] },
      { id: 'c2', grade: 10, section: 'B', curriculum: [{ subjectId: 'm', periods: 6 }] },
    ]
    const { assignments, issues } = assignTeachers(data, mulberry32(1))
    expect(assignments.filter((a) => a.teacherId === 'tm')).toHaveLength(1)
    expect(issues.some((i) => i.kind === 'unassigned')).toBe(true)
  })
})

describe('placement', () => {
  it('search score matches a from-scratch evaluation', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const data = randomSchool(seed)
      const rng = mulberry32(seed)
      const { assignments } = assignTeachers(data, rng)
      const placed = placeLessons(data, assignments, rng, { maxIterations: 40_000 })
      expect(placed.score).toBe(evaluate(data, placed.grid).score)
    }
  })

  it('gives full rest on an easy school', () => {
    const data = randomSchool(3)
    data.teachers.forEach((t) => (t.maxPerWeek = 30))
    data.classes = data.classes.slice(0, 2).map((c) => ({ ...c, curriculum: c.curriculum.map((i) => ({ ...i, periods: 2 })) }))
    const r = generateRoutine(data, { seed: 7, maxIterations: 100_000 })
    expect(r.stats.restMissed).toBe(0)
    expect(r.stats.clashes).toBe(0)
  })

  it('reports classes that need more periods than the week has', () => {
    const data = randomSchool(4)
    data.teachers.forEach((t) => { t.maxPerDay = 6; t.maxPerWeek = 30 })
    data.classes[0].curriculum[0].periods = 20 // with the other subjects this is over the 30-slot week
    const r = generateRoutine(data, { seed: 1, maxIterations: 20_000 })
    expect(r.issues.some((i) => i.kind === 'overCapacity' && i.classId === data.classes[0].id)).toBe(true)
    expect(r.issues.some((i) => i.kind === 'unplaced')).toBe(true)
    assertHardRules(data, r)
  })
})

describe('generateRoutine', () => {
  it('holds hard rules across many random schools and seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const data = randomSchool(seed)
      const r = generateRoutine(data, { seed, maxIterations: 150_000 })
      assertHardRules(data, r)
      expect(r.stats.clashes).toBe(0)
    }
  })

  it('is repeatable for a seed and varies between seeds', () => {
    const data = randomSchool(9)
    const a = generateRoutine(data, { seed: 42, maxIterations: 30_000 })
    const b = generateRoutine(data, { seed: 42, maxIterations: 30_000 })
    const c = generateRoutine(data, { seed: 43, maxIterations: 30_000 })
    expect(b.grid).toEqual(a.grid)
    expect(c.grid).not.toEqual(a.grid)
  })

  it('handles the sample school well and fast', () => {
    const data = sampleSchool()
    const r = generateRoutine(data, { seed: 2026 })
    assertHardRules(data, r)
    expect(r.stats.clashes).toBe(0)
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([])
    const restRate = r.stats.restGiven / (r.stats.restGiven + r.stats.restMissed)
    expect(restRate).toBeGreaterThanOrEqual(0.95)
    expect(r.stats.ms).toBeLessThan(10_000)
  }, 20_000)

  it('input hash changes when data changes', () => {
    const data = sampleSchool()
    const h = hashInputs(data)
    data.teachers[0].maxPerDay = 5
    expect(hashInputs(data)).not.toBe(h)
  })
})
