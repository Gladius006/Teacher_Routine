import { describe, expect, it } from 'vitest'
import { assignTeachers } from './assign'
import { periodsOn } from './blocks'
import { evaluate } from './evaluate'
import { placeLessons } from './place'
import { mulberry32 } from './rng'
import { DEFAULT_SETTINGS, sampleSchool } from './sample'
import { generateRoutine } from './schedule'
import type { Routine, SchoolData } from './types'
import { exportSchool, importSchool } from '../store/io'

/** Every period of a subject, as [day, period] pairs, across all classes. */
function placements(data: SchoolData, r: Routine, subjectId: string) {
  const P = data.settings.periodsPerDay
  const out: [number, number][] = []
  for (const cells of Object.values(r.grid)) cells.forEach((c, s) => c?.subjectId === subjectId && out.push([Math.floor(s / P), s % P]))
  return out
}

const withPE = (end: number, settings = DEFAULT_SETTINGS): SchoolData => {
  const d = sampleSchool()
  d.settings = { ...settings }
  d.subjects.find((s) => s.id === 's-pe')!.endOfDay = end
  return d
}

describe('end-of-day subjects', () => {
  it('puts every Physical Ed. period in the last two periods of the day', () => {
    const data = withPE(2)
    const r = generateRoutine(data, { seed: 1 })
    const pe = placements(data, r, 's-pe')
    expect(pe.length).toBe(data.classes.reduce((n, c) => n + (c.curriculum.find((i) => i.subjectId === 's-pe')?.periods ?? 0), 0))
    for (const [d, p] of pe) expect(p, `day ${d}`).toBeGreaterThanOrEqual(periodsOn(data.settings, d) - 2)
    expect(r.issues.some((i) => i.kind === 'notAtEnd')).toBe(false)
    expect(r.stats.clashes).toBe(0)
  }, 30_000)

  it('counts the last periods of a shorter day from where that day ends', () => {
    const data = withPE(2, { ...DEFAULT_SETTINGS, shortDays: { Sat: 4 } })
    const r = generateRoutine(data, { seed: 2 })
    for (const [d, p] of placements(data, r, 's-pe')) {
      if (d === 5) expect([2, 3]).toContain(p)
    }
    expect(r.issues.some((i) => i.kind === 'notAtEnd')).toBe(false)
  }, 30_000)

  it('spreads end-of-day classes over more teachers so they fit', () => {
    const { assignments } = assignTeachers(withPE(2), mulberry32(1))
    const perTeacher = new Map<string, number>()
    for (const a of assignments) if (a.subjectId === 's-pe' && a.teacherId) perTeacher.set(a.teacherId, (perTeacher.get(a.teacherId) ?? 0) + a.periods)
    // 6 days x 2 last periods = 12 end-of-day slots a week per teacher.
    for (const [, n] of perTeacher) expect(n).toBeLessThanOrEqual(12)
  })

  it('search score still matches a from-scratch evaluation', () => {
    const data = withPE(1)
    const rng = mulberry32(5)
    const { assignments } = assignTeachers(data, rng)
    const placed = placeLessons(data, assignments, rng, { maxIterations: 30_000 })
    expect(placed.score).toBe(Math.round(evaluate(data, placed.grid).score))
  })

  it('reports end-of-day periods that could not fit, and says how to fix it', () => {
    // Senior PE needs 16 periods but its two teachers have only 12 last periods between them.
    const r = generateRoutine(withPE(1), { seed: 1, maxIterations: 100_000 })
    const late = r.issues.filter((i) => i.kind === 'notAtEnd')
    expect(late.length).toBeGreaterThan(0)
    expect(late[0].message).toMatch(/not in the last period.*allow more last periods/)
  })

  it('backups keep the setting', () => {
    expect(importSchool(exportSchool(withPE(2))).subjects.find((s) => s.id === 's-pe')?.endOfDay).toBe(2)
  })
})
