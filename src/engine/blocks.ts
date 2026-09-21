import type { Settings } from './types'

/** True when lunch sits between period p and p+1 (0-based), so they are not back-to-back. */
export function breakAfter(settings: Settings, p: number): boolean {
  const l = settings.lunchAfter
  return l !== null && l >= 1 && l < settings.periodsPerDay && p === l - 1
}

/** True when periods p and p+1 are consecutive with no break between them. */
export function isAdjacent(settings: Settings, p: number): boolean {
  return p < settings.periodsPerDay - 1 && !breakAfter(settings, p)
}

/** Lengths of runs of periods between breaks, e.g. 8 periods with lunch after 4 -> [4, 4]. */
export function blockLengths(settings: Settings): number[] {
  const P = settings.periodsPerDay
  const l = settings.lunchAfter
  if (l === null || l < 1 || l >= P) return [P]
  return [l, P - l]
}

/** Most periods a teacher can teach in a day while resting after every class. */
export function restCapacityPerDay(settings: Settings): number {
  return blockLengths(settings).reduce((s, len) => s + Math.ceil(len / 2), 0)
}

export function slotsPerWeek(settings: Settings): number {
  return settings.dayNames.length * settings.periodsPerDay
}
