import { describe, expect, it } from 'vitest'
import { sampleSchool } from '../engine/sample'
import { normalizeUsername, passwordError, usernameError, usernameToEmail } from './auth'
import { changedSections } from './diff'

describe('user IDs', () => {
  it('accepts simple IDs and normalises case and spaces', () => {
    expect(usernameError('Ananya.Sen')).toBeUndefined()
    expect(normalizeUsername('  Ananya.Sen ')).toBe('ananya.sen')
    expect(usernameToEmail('Ananya.Sen')).toBe('ananya.sen@users.example.com')
  })
  it('rejects IDs that are too short, too long or have other characters', () => {
    expect(usernameError('')).toMatch(/Enter/)
    expect(usernameError('ab')).toMatch(/3 to 32/)
    expect(usernameError('a'.repeat(33))).toMatch(/3 to 32/)
    expect(usernameError('ananya sen')).toMatch(/3 to 32/)
    expect(usernameError('ananya@school')).toMatch(/3 to 32/)
  })
  it('needs passwords of at least 8 characters', () => {
    expect(passwordError('')).toMatch(/Enter/)
    expect(passwordError('short')).toMatch(/8/)
    expect(passwordError('long enough')).toBeUndefined()
  })
})

describe('changed sections', () => {
  it('lists only the parts of the school that changed', () => {
    const a = sampleSchool()
    const b = { ...a, teachers: a.teachers.map((t, i) => (i === 0 ? { ...t, maxPerDay: 5 } : t)) }
    expect(changedSections(a, b)).toEqual(['teachers'])
    expect(changedSections(a, { ...a })).toEqual([])
    expect(changedSections(a, { ...a, settings: { ...a.settings, periodsPerDay: 7 }, classes: [] })).toEqual(['settings', 'classes'])
  })
  it('ignores copies with identical content', () => {
    const a = sampleSchool()
    expect(changedSections(a, structuredClone(a))).toEqual([])
  })
})
