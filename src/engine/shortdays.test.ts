import { describe, expect, it } from 'vitest'
import { assignTeachers, weeklyCapacity } from './assign'
import { isAdjacent, isOpen, periodsOn, restCapacityPerDay, restCapacityPerWeek, slotsPerWeek } from './blocks'
import { evaluate, teacherSlots } from './evaluate'
import { curriculumFor, syncSubjectClasses } from './grades'
import { placeLessons } from './place'
import { mulberry32 } from './rng'
import { DEFAULT_SETTINGS, sampleSchool } from './sample'
import { generateRoutine } from './schedule'
import { cleanSection, nextSection } from './sections'
import type { ClassSection, SchoolData, Settings, Subject } from './types'

const settings = (over: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...over })
const halfSat = settings({ shortDays: { Sat: 4 } })

describe('shorter days', () => {
  it('counts the periods of each day', () => {
    expect(periodsOn(halfSat, 5)).toBe(4)
    expect(periodsOn(halfSat, 0)).toBe(8)
    expect(slotsPerWeek(halfSat)).toBe(44)
    expect(slotsPerWeek(settings())).toBe(48)
    // A short day longer than the normal day is just a normal day.
    expect(periodsOn(settings({ shortDays: { Sat: 12 } }), 5)).toBe(8)
  })

  it('closes the slots after a short day ends', () => {
    expect(isOpen(halfSat, 5 * 8 + 3)).toBe(true)
    expect(isOpen(halfSat, 5 * 8 + 4)).toBe(false)
    expect(isOpen(halfSat, 4 * 8 + 7)).toBe(true)
  })

  it('has no lunch or rest after the last period of a short day', () => {
    // Lunch after period 4 never happens on a 4-period Saturday.
    expect(restCapacityPerDay(halfSat, 5)).toBe(2)
    expect(restCapacityPerWeek(halfSat)).toBe(5 * 4 + 2)
    expect(isAdjacent(halfSat, 3, 5)).toBe(false)
    expect(isAdjacent(halfSat, 2, 5)).toBe(true)
  })

  it('a teacher cannot be given more than the short day holds', () => {
    const t = { id: 't', name: 'T', code: 'T', primary: [], secondary: [], maxPerDay: 6, maxPerWeek: 99 }
    expect(weeklyCapacity(t, halfSat)).toBe(5 * 6 + 4)
  })

  it('never puts a lesson after a short day ends', () => {
    const data: SchoolData = { ...sampleSchool(), settings: halfSat }
    const r = generateRoutine(data, { seed: 3, maxIterations: 150_000 })
    for (const cls of data.classes) {
      r.grid[cls.id].forEach((cell, s) => {
        if (!isOpen(halfSat, s)) expect(cell, `${cls.id} slot ${s}`).toBeNull()
      })
      // Every period of the class still fits: the sample's classes need at most 43 of 44.
      const placed = r.grid[cls.id].filter(Boolean).length
      expect(placed).toBe(cls.curriculum.reduce((n, i) => n + i.periods, 0))
    }
    expect(r.stats.clashes).toBe(0)
  })

  it('search score still matches a from-scratch evaluation', () => {
    const data: SchoolData = { ...sampleSchool(), settings: halfSat }
    const rng = mulberry32(9)
    const { assignments } = assignTeachers(data, rng)
    const placed = placeLessons(data, assignments, rng, { maxIterations: 30_000 })
    expect(placed.score).toBe(Math.round(evaluate(data, placed.grid).score))
    expect(() => teacherSlots(data, placed.grid)).not.toThrow()
  })

  it('reports lessons that no longer fit once a day is shortened', () => {
    const data: SchoolData = { ...sampleSchool(), settings: settings({ shortDays: { Fri: 4, Sat: 4 } }) }
    const r = generateRoutine(data, { seed: 1, maxIterations: 20_000 })
    expect(r.issues.some((i) => i.kind === 'overCapacity')).toBe(true)
    expect(r.issues.some((i) => i.kind === 'unplaced')).toBe(true)
  })
})

const subj = (id: string, grades?: number[], periods?: number): Subject => ({ id, name: id, code: id, color: '#888', grades, periods })
const cls = (id: string, grade: number, subjectIds: string[] = []): ClassSection => ({
  id, grade, section: id.slice(-1), curriculum: subjectIds.map((subjectId) => ({ subjectId, periods: 3 })),
})

describe('subjects added to classes automatically', () => {
  const classes = [cls('5A', 5), cls('5B', 5), cls('8A', 8), cls('11A', 11)]

  it('a new subject joins every class in its grades', () => {
    const out = syncSubjectClasses(classes, undefined, subj('art', [5, 6, 7], 2))
    expect(out.map((c) => c.curriculum.map((i) => `${i.subjectId}:${i.periods}`))).toEqual([['art:2'], ['art:2'], [], []])
  })

  it('uses 4 periods when the subject has no default', () => {
    const out = syncSubjectClasses(classes, undefined, subj('eng'))
    expect(out.every((c) => c.curriculum[0]?.periods === 4)).toBe(true)
  })

  it('adds to newly allowed grades and removes from dropped ones', () => {
    const before = subj('art', [5, 8])
    const start = [cls('5A', 5, ['art']), cls('8A', 8, ['art']), cls('11A', 11)]
    const out = syncSubjectClasses(start, before, subj('art', [5, 11]))
    expect(out.map((c) => c.curriculum.map((i) => i.subjectId))).toEqual([['art'], [], ['art']])
  })

  it('does not re-add a subject removed from one class by hand', () => {
    const before = subj('art', [5])
    const start = [cls('5A', 5, ['art']), cls('5B', 5, [])]
    const out = syncSubjectClasses(start, before, { ...before, name: 'Fine Art' })
    expect(out[1].curriculum).toEqual([])
    expect(out).toEqual(start)
  })

  it('keeps periods and pins of classes that already had it', () => {
    const start = [{ ...cls('5A', 5), curriculum: [{ subjectId: 'art', periods: 6, pinnedTeacherId: 't1' }] }]
    expect(syncSubjectClasses(start, undefined, subj('art', [5]))).toEqual(start)
  })

  it('a new class starts with every subject of its grade', () => {
    const items = curriculumFor([subj('art', [5, 6], 2), subj('phy', [9, 10]), subj('eng')], 5)
    expect(items.map((i) => `${i.subjectId}:${i.periods}`)).toEqual(['art:2', 'eng:4'])
  })
})

describe('section names', () => {
  const g = (...names: string[]) => names.map((s, i) => ({ id: `${i}`, grade: 12, section: s, curriculum: [] }))

  it('follows on from the last letter', () => {
    expect(nextSection([])).toBe('A')
    expect(nextSection(g('A'))).toBe('B')
    expect(nextSection(g('A', 'B', 'C'))).toBe('D')
    expect(nextSection(g('A', 'C'))).toBe('D')
  })

  it('follows on from a stream name ending in a letter', () => {
    expect(nextSection(g('Commerce A'))).toBe('Commerce B')
    expect(nextSection(g('Science A', 'Science B'))).toBe('Science C')
  })

  it('falls back to the first free letter', () => {
    expect(nextSection(g('Sci'))).toBe('A')
    expect(nextSection(g('Commerce', 'A'))).toBe('B')
    expect(nextSection(g('Z'))).toBe('A')
  })

  it('cleans up spacing', () => {
    expect(cleanSection('  Commerce   A ')).toBe('Commerce A')
  })
})
