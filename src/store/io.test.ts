import { describe, expect, it } from 'vitest'
import { sampleSchool } from '../engine/sample'
import { exportSchool, importSchool } from './io'

describe('import/export', () => {
  it('round-trips a school', () => {
    const data = sampleSchool()
    expect(importSchool(exportSchool(data))).toEqual(data)
  })
  it('rejects invalid JSON with a readable message', () => {
    expect(() => importSchool('{nope')).toThrow(/not valid JSON/)
  })
  it('rejects files with broken sections', () => {
    const data = sampleSchool() as unknown as { teachers: unknown }
    data.teachers = [{ id: 1 }]
    expect(() => importSchool(JSON.stringify(data))).toThrow(/teachers/)
  })
})

describe('older backup files', () => {
  it('load when subjects have no grade list', () => {
    const data = sampleSchool()
    data.subjects.forEach((s) => delete s.grades)
    expect(importSchool(exportSchool(data)).subjects[0].grades).toBeUndefined()
  })
  it('reject a broken grade list', () => {
    const data = sampleSchool() as unknown as { subjects: { grades: unknown }[] }
    data.subjects[0].grades = ['nine']
    expect(() => importSchool(JSON.stringify(data))).toThrow(/subjects/)
  })
})
