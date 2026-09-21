import { isAdjacent, slotsPerWeek } from './blocks'
import { className } from './assign'
import { randInt, type Rng } from './rng'
import type { Assignment, Grid, Id, Issue, SchoolData } from './types'
import { W } from './weights'

export interface PlaceOptions {
  /** Upper bound on search moves. Fixes the cooling schedule, so a seed gives the same result. */
  maxIterations?: number
  /** Safety stop if the machine is slow. */
  timeLimitMs?: number
  onProgress?: (fraction: number, bestScore: number) => void
}

export interface PlaceResult {
  grid: Grid
  issues: Issue[]
  score: number
  iterations: number
}

const T_START = 40
const T_END = 0.05

/**
 * Phase 2: place lessons into each class's week with simulated annealing.
 * State is one array per class, so a class can never be double-booked. A move
 * swaps two cells inside one class; only the touched teacher-days and class-days
 * are rescored.
 */
export function placeLessons(data: SchoolData, assignments: Assignment[], rng: Rng, opts: PlaceOptions = {}): PlaceResult {
  const { settings, teachers, classes, subjects } = data
  const D = settings.dayNames.length
  const P = settings.periodsPerDay
  const S = slotsPerWeek(settings)
  const C = classes.length
  const T = teachers.length
  const issues: Issue[] = []

  const tIndex = new Map<Id, number>(teachers.map((t, i) => [t.id, i]))
  const sIndex = new Map<Id, number>(subjects.map((s, i) => [s.id, i]))
  const cIndex = new Map<Id, number>(classes.map((c, i) => [c.id, i]))
  const subjectName = (id: Id) => subjects.find((s) => s.id === id)?.name ?? 'subject'

  const adj: boolean[] = []
  for (let p = 0; p < P; p++) adj.push(isAdjacent(settings, p))

  // Expand assignments into single-period lessons.
  const lessonTeacher: number[] = []
  const lessonSubject: number[] = []
  const lessonSubjectId: Id[] = []
  const perClass: number[][] = classes.map(() => [])
  for (const a of assignments) {
    if (a.teacherId === null) continue
    const ci = cIndex.get(a.classId)
    const ti = tIndex.get(a.teacherId)
    const si = sIndex.get(a.subjectId)
    if (ci === undefined || ti === undefined || si === undefined) continue
    for (let k = 0; k < a.periods; k++) {
      const lid = lessonTeacher.length
      lessonTeacher.push(ti)
      lessonSubject.push(si)
      lessonSubjectId.push(a.subjectId)
      perClass[ci].push(lid)
    }
  }

  const grid: Int32Array[] = []
  for (let c = 0; c < C; c++) {
    const g = new Int32Array(S).fill(-1)
    const lessons = perClass[c]
    if (lessons.length > S) {
      // Drop what cannot fit, reporting per subject.
      const dropped = lessons.splice(S)
      const bySubject = new Map<Id, number>()
      for (const lid of dropped) bySubject.set(lessonSubjectId[lid], (bySubject.get(lessonSubjectId[lid]) ?? 0) + 1)
      for (const [sid, n] of bySubject) {
        issues.push({
          kind: 'unplaced', severity: 'error', classId: classes[c].id, subjectId: sid,
          message: `Class ${className(classes[c])}: ${n} ${subjectName(sid)} period${n > 1 ? 's' : ''} did not fit in the week. Reduce this class's periods.`,
        })
      }
    }
    // Start: deal lessons round-robin across days (spreads subjects), filling each day from period 1.
    const fill = new Array<number>(D).fill(0)
    let d = randInt(rng, D)
    for (const lid of lessons) {
      while (fill[d] >= P) d = (d + 1) % D
      g[d * P + fill[d]] = lid
      fill[d]++
      d = (d + 1) % D
    }
    grid.push(g)
  }

  // Teacher occupancy counters and per-teacher targets.
  const occ = new Uint16Array(T * S)
  const weekly = new Array<number>(T).fill(0)
  for (let c = 0; c < C; c++) {
    for (let s = 0; s < S; s++) {
      const lid = grid[c][s]
      if (lid >= 0) {
        occ[lessonTeacher[lid] * S + s]++
        weekly[lessonTeacher[lid]]++
      }
    }
  }
  const maxDay = teachers.map((t) => t.maxPerDay)
  const share = weekly.map((w) => Math.ceil(w / D) + 1)
  const maxSubj = settings.maxSubjectPerDay
  const subjCount = new Int32Array(subjects.length)
  const freeShare = perClass.map((ls) => Math.ceil(Math.max(0, S - ls.length) / D))

  const teacherDayCost = (t: number, d: number): number => {
    const base = t * S + d * P
    let lessons = 0, clash = 0, rest = 0
    for (let p = 0; p < P; p++) {
      const n = occ[base + p]
      lessons += n
      if (n > 1) clash += n - 1
      if (n > 0 && adj[p] && occ[base + p + 1] > 0) rest++
    }
    return (
      W.clash * clash +
      W.overDay * Math.max(0, lessons - maxDay[t]) +
      W.rest * rest +
      W.imbalance * Math.max(0, lessons - share[t])
    )
  }

  const classDayCost = (c: number, d: number): number => {
    const g = grid[c]
    const base = d * P
    let repeat = 0, gaps = 0, seen = false, free = 0
    for (let p = P - 1; p >= 0; p--) {
      const lid = g[base + p]
      if (lid < 0) free++
      if (lid >= 0) {
        seen = true
        const si = lessonSubject[lid]
        subjCount[si]++
        if (subjCount[si] > maxSubj) repeat++
      } else if (seen) gaps++
    }
    for (let p = 0; p < P; p++) {
      const lid = g[base + p]
      if (lid >= 0) subjCount[lessonSubject[lid]] = 0
    }
    return W.subjectRepeat * repeat + W.gap * gaps + W.freeSpread * Math.max(0, free - freeShare[c])
  }

  const tdCost = new Float64Array(T * D)
  const cdCost = new Float64Array(C * D)
  let total = 0
  for (let t = 0; t < T; t++) for (let d = 0; d < D; d++) total += tdCost[t * D + d] = teacherDayCost(t, d)
  for (let c = 0; c < C; c++) for (let d = 0; d < D; d++) total += cdCost[c * D + d] = classDayCost(c, d)

  const movable: number[] = []
  for (let c = 0; c < C; c++) if (perClass[c].length > 0) movable.push(c)

  const totalLessons = lessonTeacher.length
  const maxIter = opts.maxIterations ?? Math.max(400_000, totalLessons * 3000)
  const timeLimit = opts.timeLimitMs ?? 8000
  const started = Date.now()

  let best = total
  let bestGrid = grid.map((g) => g.slice())
  const tdKeys = [0, 0, 0, 0]
  const tdNew = [0, 0, 0, 0]
  let iter = 0

  const swap = (c: number, i: number, j: number) => {
    const g = grid[c]
    const a = g[i], b = g[j]
    if (a >= 0) { occ[lessonTeacher[a] * S + i]--; occ[lessonTeacher[a] * S + j]++ }
    if (b >= 0) { occ[lessonTeacher[b] * S + j]--; occ[lessonTeacher[b] * S + i]++ }
    g[i] = b
    g[j] = a
  }

  if (movable.length > 0 && total > 0 && S > 1) {
    for (; iter < maxIter; iter++) {
      if ((iter & 4095) === 0) {
        if (total < best) { best = total; bestGrid = grid.map((g) => g.slice()) }
        if (best === 0) break
        if (Date.now() - started > timeLimit) break
        if ((iter & 65535) === 0) opts.onProgress?.(iter / maxIter, best)
      }
      const temp = T_START * Math.pow(T_END / T_START, iter / maxIter)

      const c = movable[randInt(rng, movable.length)]
      const g = grid[c]
      const i = randInt(rng, S)
      let j = randInt(rng, S - 1)
      if (j >= i) j++
      const a = g[i], b = g[j]
      if (a < 0 && b < 0) continue
      if (a >= 0 && b >= 0 && lessonTeacher[a] === lessonTeacher[b] && lessonSubject[a] === lessonSubject[b]) continue

      const di = (i / P) | 0
      const dj = (j / P) | 0

      // Collect distinct teacher-day keys touched by this swap.
      let nk = 0
      const addKey = (t: number, d: number) => {
        const k = t * D + d
        for (let q = 0; q < nk; q++) if (tdKeys[q] === k) return
        tdKeys[nk++] = k
      }
      if (a >= 0) { addKey(lessonTeacher[a], di); addKey(lessonTeacher[a], dj) }
      if (b >= 0) { addKey(lessonTeacher[b], di); addKey(lessonTeacher[b], dj) }

      let old = cdCost[c * D + di] + (dj !== di ? cdCost[c * D + dj] : 0)
      for (let q = 0; q < nk; q++) old += tdCost[tdKeys[q]]

      swap(c, i, j)

      const ci = classDayCost(c, di)
      const cj = dj !== di ? classDayCost(c, dj) : 0
      let next = ci + cj
      for (let q = 0; q < nk; q++) {
        const k = tdKeys[q]
        tdNew[q] = teacherDayCost((k / D) | 0, k % D)
        next += tdNew[q]
      }

      const delta = next - old
      if (delta <= 0 || rng() < Math.exp(-delta / temp)) {
        cdCost[c * D + di] = ci
        if (dj !== di) cdCost[c * D + dj] = cj
        for (let q = 0; q < nk; q++) tdCost[tdKeys[q]] = tdNew[q]
        total += delta
      } else {
        swap(c, i, j)
      }
    }
  }
  if (total < best) { best = total; bestGrid = grid.map((g) => g.slice()) }
  opts.onProgress?.(1, best)

  const out: Grid = {}
  classes.forEach((cls, c) => {
    out[cls.id] = Array.from(bestGrid[c], (lid) =>
      lid < 0 ? null : { subjectId: lessonSubjectId[lid], teacherId: teachers[lessonTeacher[lid]].id },
    )
  })
  return { grid: out, issues, score: Math.round(best), iterations: iter }
}
