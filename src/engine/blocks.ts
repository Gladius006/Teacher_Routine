import type { Settings } from './types'

/** Periods held on day d. A shorter day, like a Saturday half day, has fewer than periodsPerDay. */
export function periodsOn(settings: Settings, d: number): number {
  const P = settings.periodsPerDay
  const n = settings.shortDays?.[settings.dayNames[d]]
  return n === undefined ? P : Math.max(1, Math.min(P, Math.round(n)))
}

/** False for the slots after the last period of a shorter day. Slot = day * periodsPerDay + period. */
export function isOpen(settings: Settings, slot: number): boolean {
  const P = settings.periodsPerDay
  return slot % P < periodsOn(settings, Math.floor(slot / P))
}

/** True when lunch sits between period p and p+1 (0-based), so they are not back-to-back. */
export function breakAfter(settings: Settings, p: number, d?: number): boolean {
  const l = settings.lunchAfter
  const len = d === undefined ? settings.periodsPerDay : periodsOn(settings, d)
  return l !== null && l >= 1 && l < len && p === l - 1
}

/** True when periods p and p+1 are consecutive with no break between them (on day d, if given). */
export function isAdjacent(settings: Settings, p: number, d?: number): boolean {
  const len = d === undefined ? settings.periodsPerDay : periodsOn(settings, d)
  return p < len - 1 && !breakAfter(settings, p, d)
}

/** Lengths of runs of periods between breaks, e.g. 8 periods with lunch after 4 -> [4, 4]. */
export function blockLengths(settings: Settings, d?: number): number[] {
  const P = d === undefined ? settings.periodsPerDay : periodsOn(settings, d)
  const l = settings.lunchAfter
  if (l === null || l < 1 || l >= P) return [P]
  return [l, P - l]
}

/** Most periods a teacher can teach in a (full, or given) day while resting after every class. */
export function restCapacityPerDay(settings: Settings, d?: number): number {
  return blockLengths(settings, d).reduce((s, len) => s + Math.ceil(len / 2), 0)
}

export function restCapacityPerWeek(settings: Settings): number {
  return settings.dayNames.reduce((n, _, d) => n + restCapacityPerDay(settings, d), 0)
}

export function slotsPerWeek(settings: Settings): number {
  return settings.dayNames.reduce((n, _, d) => n + periodsOn(settings, d), 0)
}

/** True when at least one working day is shorter than the rest. */
export function hasShortDays(settings: Settings): boolean {
  return settings.dayNames.some((_, d) => periodsOn(settings, d) < settings.periodsPerDay)
}
