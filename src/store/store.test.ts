import { beforeEach, describe, expect, it } from 'vitest'
import { sampleSchool } from '../engine/sample'
import { generateRoutine } from '../engine/schedule'
import { evaluate, teacherSlots } from '../engine/evaluate'
import { useStore } from './store'

describe('store', () => {
  beforeEach(() => {
    const data = sampleSchool()
    useStore.getState().replaceData(data)
    useStore.getState().setRoutine(generateRoutine(data, { seed: 1, maxIterations: 20_000 }))
  })

  it('drops the routine when the grid shape changes', () => {
    useStore.getState().setSettings({ periodsPerDay: 7 })
    expect(useStore.getState().routine).toBeNull()
  })

  it('keeps the routine for changes that keep the shape', () => {
    useStore.getState().setSettings({ maxSubjectPerDay: 3 })
    expect(useStore.getState().routine).not.toBeNull()
  })

  it('removing a subject strips it from teachers and classes', () => {
    useStore.getState().removeSubject('s-math')
    const { teachers, classes } = useStore.getState().data
    expect(teachers.some((t) => t.primary.includes('s-math') || t.secondary.includes('s-math'))).toBe(false)
    expect(classes.some((c) => c.curriculum.some((i) => i.subjectId === 's-math'))).toBe(false)
  })

  it('removing a teacher clears their pins', () => {
    const cls = useStore.getState().data.classes[0]
    useStore.getState().upsertClass({ ...cls, curriculum: cls.curriculum.map((i, k) => (k === 0 ? { ...i, pinnedTeacherId: 't-01' } : i)) })
    useStore.getState().removeTeacher('t-01')
    expect(useStore.getState().data.classes[0].curriculum[0].pinnedTeacherId).toBeNull()
  })
})

describe('mismatched routine data', () => {
  it('does not crash when a routine is longer than the current week', () => {
    const data = sampleSchool()
    const r = generateRoutine(data, { seed: 1, maxIterations: 5_000 })
    const smaller = { ...data, settings: { ...data.settings, periodsPerDay: 6 } }
    expect(() => teacherSlots(smaller, r.grid)).not.toThrow()
    expect(() => evaluate(smaller, r.grid)).not.toThrow()
  })
})

describe('store: classes and subjects', () => {
  beforeEach(() => useStore.getState().replaceData(sampleSchool()))

  it('adding a subject puts it in every class of its grades', () => {
    useStore.getState().upsertSubject({ id: 's-music', name: 'Music', code: 'MUS', color: '#888', grades: [5, 6], periods: 1 })
    const { classes } = useStore.getState().data
    for (const c of classes) {
      const item = c.curriculum.find((i) => i.subjectId === 's-music')
      if (c.grade <= 6) expect(item?.periods).toBe(1)
      else expect(item).toBeUndefined()
    }
  })

  it('adds a section with the next letter and the same subjects', () => {
    const id = useStore.getState().addSection(9)
    const { classes } = useStore.getState().data
    const added = classes.find((c) => c.id === id)!
    const nineB = classes.find((c) => c.id === 'c-9B')!
    expect(added.section).toBe('C')
    expect(added.grade).toBe(9)
    expect(added.curriculum).toEqual(nineB.curriculum.map(({ subjectId, periods }) => ({ subjectId, periods })))
  })

  it('drops the routine when a day gets shorter', () => {
    useStore.getState().setRoutine(generateRoutine(useStore.getState().data, { seed: 1, maxIterations: 5_000 }))
    useStore.getState().setSettings({ shortDays: { Sat: 4 } })
    expect(useStore.getState().routine).toBeNull()
  })
})

describe('store: junior subjects', () => {
  it('removing a subject strips it from junior lists', () => {
    const data = sampleSchool()
    data.teachers[0] = { ...data.teachers[0], junior: ['s-art', 's-math'] }
    useStore.getState().replaceData(data)
    useStore.getState().removeSubject('s-art')
    expect(useStore.getState().data.teachers[0].junior).toEqual(['s-math'])
    expect(useStore.getState().data.teachers[1].junior).toBeUndefined()
  })
})
