import { describe, expect, it } from 'vitest'
import { assignTeachers } from './assign'
import { evaluate, teacherSlots } from './evaluate'
import { packLine } from './lines'
import { placeLessons } from './place'
import { mulberry32 } from './rng'
import { DEFAULT_SETTINGS } from './sample'
import { generateRoutine, precheck } from './schedule'
import type { ClassSection, OptionLine, SchoolData, Subject, Teacher } from './types'
import { exportSchool, importSchool } from '../store/io'

const S = (id: string): Subject => ({ id, name: id, code: id.toUpperCase().slice(0, 4), color: '#888' })
const T = (id: string, primary: string[]): Teacher => ({ id, name: id, code: id.slice(0, 3).toUpperCase(), primary, secondary: [], maxPerDay: 6, maxPerWeek: 30 })
const C = (id: string, items: [string, number][]): ClassSection => ({
  id, grade: 11, section: id.slice(3), curriculum: items.map(([subjectId, periods]) => ({ subjectId, periods })),
})

/** XI Sc and XI Hu as in the school's routine: Physics / Nutrition / Economics in one line, Economics and Education with the same teacher. */
function school(): SchoolData {
  const subjects = ['eng', 'ben', 'math', 'chem', 'phy', 'nutn', 'econ', 'edcn', 'hist', 'pols'].map(S)
  const teachers = [
    T('psen', ['phy']), T('dd', ['phy']), T('nutnT', ['nutn']), T('smandal', ['econ', 'edcn']),
    T('engT', ['eng']), T('benT', ['ben']), T('mathT', ['math']), T('chemT', ['chem']), T('histT', ['hist']), T('polsT', ['pols']),
  ]
  const sc = C('11-Sc', [['eng', 6], ['ben', 6], ['math', 6], ['chem', 6], ['phy', 4]])
  const hu = C('11-Hu', [['eng', 6], ['ben', 6], ['hist', 6], ['pols', 6]])
  const line: OptionLine = {
    id: 'l1', name: 'XI Line 1', classIds: [sc.id, hu.id],
    items: [
      { subjectId: 'phy', classIds: [sc.id], periods: 4, teachers: [{ teacherId: 'psen', periods: 2 }, { teacherId: 'dd', periods: 2 }] },
      { subjectId: 'nutn', classIds: [sc.id, hu.id], periods: 4, teachers: [] },
      { subjectId: 'econ', classIds: [sc.id, hu.id], periods: 3, teachers: [{ teacherId: 'smandal', periods: 3 }] },
      { subjectId: 'edcn', classIds: [hu.id], periods: 2, teachers: [{ teacherId: 'smandal', periods: 2 }] },
    ],
  }
  return { settings: { ...DEFAULT_SETTINGS }, subjects, teachers, classes: [sc, hu], lines: [line] }
}

describe('packing a line', () => {
  it('runs each subject at most once a period and never gives a teacher two subjects at once', () => {
    const lessons = [
      ...Array.from({ length: 4 }, () => ({ subjectId: 'phy', teacherId: 'psen', classIds: ['sc'] })),
      ...Array.from({ length: 3 }, () => ({ subjectId: 'econ', teacherId: 'sm', classIds: ['sc', 'hu'] })),
      ...Array.from({ length: 2 }, () => ({ subjectId: 'edcn', teacherId: 'sm', classIds: ['hu'] })),
    ]
    const slots = packLine(lessons)
    expect(slots.flat()).toHaveLength(9)
    for (const slot of slots) {
      expect(new Set(slot.map((l) => l.subjectId)).size).toBe(slot.length)
      expect(new Set(slot.map((l) => l.teacherId)).size).toBe(slot.length)
    }
    // Economics and Education share S. Mandal, so they need 5 periods between them.
    expect(slots).toHaveLength(5)
  })
})

describe('option lines in the routine', () => {
  it('puts a line period at the same time for every class in it, with shared lessons taught once', () => {
    const data = school()
    const r = generateRoutine(data, { seed: 1 })
    const sc = r.grid['11-Sc'], hu = r.grid['11-Hu']
    const P = data.settings.periodsPerDay
    const subjectsIn = (cells: typeof sc, s: number) => (cells[s]?.line?.items ?? []).filter((i) => i.classIds.includes(cells === sc ? '11-Sc' : '11-Hu')).map((i) => i.subjectId)
    let econ = 0, nutn = 0, phy = 0, edcn = 0
    sc.forEach((cell, s) => {
      if (!cell?.line) return
      const items = cell.line.items
      // Any subject both classes take is in both grids at that time.
      if (items.some((i) => i.classIds.includes('11-Hu'))) expect(hu[s]?.line?.lineId, `slot ${s}`).toBe('l1')
      for (const i of items) {
        if (i.subjectId === 'econ') econ++
        if (i.subjectId === 'nutn') nutn++
        if (i.subjectId === 'phy') phy++
      }
      expect(subjectsIn(sc, s)).not.toContain('edcn')
    })
    hu.forEach((cell) => { for (const i of cell?.line?.items ?? []) if (i.subjectId === 'edcn') edcn++ })
    // Edcn-only periods appear in Hu; everything else is visible from Sc.
    expect([phy, nutn, econ]).toEqual([4, 4, 3])
    expect(edcn).toBe(2)
    // Physics' own periods aren't scheduled again as a normal lesson.
    expect(sc.filter((c) => c?.subjectId === 'phy')).toHaveLength(0)

    const slots = teacherSlots(data, r.grid)
    const weekly = (id: string) => slots.get(id)!.reduce((n, x) => n + x.length, 0)
    expect(weekly('smandal')).toBe(5) // 3 Economics (shared by Sc and Hu, counted once) + 2 Education
    expect(weekly('psen')).toBe(2)
    expect(weekly('dd')).toBe(2)
    expect(r.stats.clashes).toBe(0)
    expect(P).toBe(8)
  }, 30_000)

  it('splits a subject between the teachers chosen, with their periods', () => {
    const data = school()
    data.classes[0].curriculum = data.classes[0].curriculum.map((i) =>
      i.subjectId === 'math' ? { ...i, teachers: [{ teacherId: 'mathT', periods: 4 }, { teacherId: 'chemT', periods: 2 }] } : i)
    const r = generateRoutine(data, { seed: 2, maxIterations: 100_000 })
    const math = r.grid['11-Sc'].filter((c) => c?.subjectId === 'math')
    expect(math.filter((c) => c!.teacherId === 'mathT')).toHaveLength(4)
    expect(math.filter((c) => c!.teacherId === 'chemT')).toHaveLength(2)
  })

  it('search score matches a from-scratch evaluation', () => {
    const data = school()
    const rng = mulberry32(3)
    const { assignments } = assignTeachers(data, rng)
    const placed = placeLessons(data, assignments, rng, { maxIterations: 40_000 })
    expect(placed.score).toBe(Math.round(evaluate(data, placed.grid).score))
  })

  it('counts line periods when checking the week is long enough', () => {
    const data = school()
    data.classes[1].curriculum[0].periods = 40
    expect(precheck(data).some((i) => i.classId === '11-Hu' && i.kind === 'overCapacity')).toBe(true)
  })

  it('backups keep lines and shared teachers', () => {
    const data = school()
    data.classes[0].curriculum[0].teachers = [{ teacherId: 'engT', periods: 6 }]
    const back = importSchool(exportSchool(data))
    expect(back.lines).toEqual(data.lines)
    expect(back.classes[0].curriculum[0].teachers).toEqual([{ teacherId: 'engT', periods: 6 }])
  })
})
