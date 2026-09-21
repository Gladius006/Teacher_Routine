/** Penalty weights for the placement search. Hard rules are orders of magnitude above soft ones. */
export const W = {
  clash: 1000,
  overDay: 400,
  rest: 12,
  subjectRepeat: 40,
  gap: 25,
  imbalance: 6,
  /** A class day with more free periods than its even share (so no class goes home at lunch). */
  freeSpread: 10,
} as const
