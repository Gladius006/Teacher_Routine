import type { ClassSection } from './types'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Trims and collapses spaces, so "  Commerce   A " and "Commerce A" are the same name. */
export const cleanSection = (s: string) => s.trim().replace(/\s+/g, ' ')

export const sameSection = (a: string, b: string) => cleanSection(a).toLowerCase() === cleanSection(b).toLowerCase()

/**
 * A free name for one more section of a grade.
 * Follows on from the last section's letter ("B" after "A", "Commerce B" after
 * "Commerce A"), otherwise takes the first unused letter.
 */
export function nextSection(siblings: ClassSection[]): string {
  const taken = (name: string) => siblings.some((c) => sameSection(c.section, name))
  const last = [...siblings].sort((a, b) => a.section.localeCompare(b.section)).at(-1)
  const m = last && /^(.*?)([A-Z])$/i.exec(cleanSection(last.section))
  if (m && (m[1] === '' || m[1].endsWith(' '))) {
    const upper = m[2] === m[2].toUpperCase()
    for (let i = LETTERS.indexOf(m[2].toUpperCase()) + 1; i < LETTERS.length; i++) {
      const name = m[1] + (upper ? LETTERS[i] : LETTERS[i].toLowerCase())
      if (!taken(name)) return name
    }
  }
  for (const l of LETTERS) if (!taken(l)) return l
  for (let n = 27; ; n++) if (!taken(`S${n}`)) return `S${n}`
}
