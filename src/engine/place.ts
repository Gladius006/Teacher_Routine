import { isAdjacent, periodsOn } from './blocks'
import { className } from './assign'
import { groupName, labPlan } from './labs'
import { randInt, type Rng } from './rng'
import type { Assignment, Cell, Grid, Id, Issue, SchoolData } from './types'
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
/** Share of moves that move a practical block, when there are any. */
const BLOCK_MOVES = 0.2

interface Block {
  c: number
  /** Index of the block within its class, for display. */
  index: number
  length: number
  groups: number
  units: number[]
  /** Subject indices of the labs this block uses. */
  labs: number[]
  stations: { group: number; subjectId: Id; teacherId: Id }[]
  start: number
}

/**
 * Phase 2: place lessons into each class's week with simulated annealing.
 * State is one array per class, so a class can never be double-booked. A cell
 * holds a "unit": a single lesson, or one period of a practical block (where
 * the class's groups are spread over several labs, each with its own teacher).
 * A move swaps two single lessons inside one class, or moves a whole block to
 * another run of periods; only the touched teacher-days, class-days and
 * lab-days are rescored.
 */
export function placeLessons(data: SchoolData, assignments: Assignment[], rng: Rng, opts: PlaceOptions = {}): PlaceResult {
  const { settings, teachers, classes, subjects } = data
  const D = settings.dayNames.length
  const P = settings.periodsPerDay
  // Grid index is day * P + period; slots after a shorter day's last period stay empty.
  const S = D * P
  const len = Array.from({ length: D }, (_, d) => periodsOn(settings, d))
  const open: number[] = []
  for (let d = 0; d < D; d++) for (let p = 0; p < len[d]; p++) open.push(d * P + p)
  const N = open.length
  const C = classes.length
  const T = teachers.length
  const K = subjects.length
  const issues: Issue[] = []

  const tIndex = new Map<Id, number>(teachers.map((t, i) => [t.id, i]))
  const sIndex = new Map<Id, number>(subjects.map((s, i) => [s.id, i]))
  const cIndex = new Map<Id, number>(classes.map((c, i) => [c.id, i]))
  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const subjectName = (id: Id) => subjectById.get(id)?.name ?? 'subject'

  const adj: boolean[] = []
  for (let p = 0; p < P; p++) adj.push(isAdjacent(settings, p))

  /** Starts of every run of L periods with no break inside, by length. */
  const windowCache = new Map<number, number[]>()
  const windowsFor = (L: number) => {
    let w = windowCache.get(L)
    if (!w) {
      w = []
      for (let d = 0; d < D; d++) {
        for (let p = 0; p + L <= len[d]; p++) {
          let ok = true
          for (let q = 0; q < L - 1; q++) if (!isAdjacent(settings, p + q, d)) ok = false
          if (ok) w.push(d * P + p)
        }
      }
      windowCache.set(L, w)
    }
    return w
  }

  // Units: single lessons and block periods.
  const unitTeachers: number[][] = []
  const unitSubject: number[] = [] // subject index; -1 for a block period
  const unitSubjectId: Id[] = []
  const unitEnd: number[] = [] // only in the last N periods of the day; 0 = any time
  const unitBlock: number[] = [] // -1 for a single lesson
  const unitPart: number[] = []
  const blocks: Block[] = []
  const singles: number[][] = classes.map(() => [])
  const classBlocks: number[][] = classes.map(() => [])

  for (const a of assignments) {
    if (a.teacherId === null) continue
    const ci = cIndex.get(a.classId)
    const ti = tIndex.get(a.teacherId)
    const si = sIndex.get(a.subjectId)
    if (ci === undefined || ti === undefined || si === undefined) continue
    for (let k = 0; k < a.periods; k++) {
      const u = unitTeachers.length
      unitTeachers.push([ti])
      unitSubject.push(si)
      unitSubjectId.push(a.subjectId)
      unitEnd.push(Math.max(0, Math.round(subjects[si].endOfDay ?? 0)))
      unitBlock.push(-1)
      unitPart.push(0)
      singles[ci].push(u)
    }
  }

  // Practical blocks: every station needs its subject's teacher for the class.
  const teacherFor = new Map(assignments.filter((a) => a.teacherId).map((a) => [`${a.classId}:${a.subjectId}`, a.teacherId!]))
  classes.forEach((cls, c) => {
    const plan = labPlan(cls, subjectById)
    if (!plan) return
    for (const planned of plan.blocks) {
      const stations = planned
        .filter((st) => teacherFor.has(`${cls.id}:${st.subjectId}`) && tIndex.has(teacherFor.get(`${cls.id}:${st.subjectId}`)!))
        .map((st) => ({ ...st, teacherId: teacherFor.get(`${cls.id}:${st.subjectId}`)! }))
      if (stations.length === 0) continue
      const b = blocks.length
      const block: Block = {
        c, index: classBlocks[c].length, length: plan.length, groups: plan.groups, units: [],
        labs: stations.map((st) => sIndex.get(st.subjectId)!), stations, start: -1,
      }
      for (let q = 0; q < plan.length; q++) {
        const u = unitTeachers.length
        unitTeachers.push(stations.map((st) => tIndex.get(st.teacherId)!))
        unitSubject.push(-1)
        unitSubjectId.push('')
        unitEnd.push(0)
        unitBlock.push(b)
        unitPart.push(q)
        block.units.push(u)
      }
      blocks.push(block)
      classBlocks[c].push(b)
    }
  })

  const occ = new Int16Array(T * S)
  /** Teacher is in a block period at this slot that carries on into the next one. */
  const cont = new Int16Array(T * S)
  const roomOcc = new Int16Array(K * S)
  const rooms = subjects.map((s) => (s.lab ? Math.max(1, Math.round(s.lab.rooms)) : 0))

  const apply = (u: number, s: number, sign: number) => {
    const b = unitBlock[u]
    const carries = b >= 0 && unitPart[u] < blocks[b].length - 1
    for (const t of unitTeachers[u]) {
      occ[t * S + s] += sign
      if (carries) cont[t * S + s] += sign
    }
    if (b >= 0) for (const k of blocks[b].labs) roomOcc[k * S + s] += sign
  }

  const grid: Int32Array[] = []
  const placedBlocks: number[] = []
  for (let c = 0; c < C; c++) {
    const g = new Int32Array(S).fill(-1)
    grid.push(g)
    const free = (s: number) => g[s] < 0
    let room = N

    // Blocks first: they need runs of periods. Spread over the days from a random start.
    let day = randInt(rng, D)
    for (const b of classBlocks[c]) {
      const block = blocks[b]
      const windows = windowsFor(block.length)
      let start = -1
      for (let k = 0; k < D && start < 0; k++) {
        const d = (day + k) % D
        start = windows.find((w) => Math.floor(w / P) === d && block.units.every((_, q) => free(w + q))) ?? -1
      }
      if (start < 0 || room < block.length) {
        issues.push({
          kind: 'unplaced', severity: 'error', classId: classes[c].id,
          message: `Class ${className(classes[c])}: a ${block.length}-period lab session did not fit in the week. Shorten lab sessions or reduce this class's periods.`,
        })
        continue
      }
      block.units.forEach((u, q) => { g[start + q] = u })
      block.start = start
      placedBlocks.push(b)
      room -= block.length
      day = (Math.floor(start / P) + 1) % D
    }

    const lessons = singles[c]
    if (lessons.length > room) {
      // Drop what cannot fit, reporting per subject.
      const dropped = lessons.splice(room)
      const bySubject = new Map<Id, number>()
      for (const u of dropped) bySubject.set(unitSubjectId[u], (bySubject.get(unitSubjectId[u]) ?? 0) + 1)
      for (const [sid, n] of bySubject) {
        issues.push({
          kind: 'unplaced', severity: 'error', classId: classes[c].id, subjectId: sid,
          message: `Class ${className(classes[c])}: ${n} ${subjectName(sid)} period${n > 1 ? 's' : ''} did not fit in the week. Reduce this class's periods.`,
        })
      }
    }
    // End-of-day lessons go last, so the first deal already puts most of them late in the day.
    lessons.sort((x, y) => (unitEnd[x] > 0 ? 1 : 0) - (unitEnd[y] > 0 ? 1 : 0))
    // Deal lessons round-robin across days (spreads subjects), filling each day from period 1.
    let d = randInt(rng, D)
    for (const u of lessons) {
      let s = -1
      for (let k = 0; k < D && s < 0; k++, d = (d + 1) % D) {
        for (let p = 0; p < len[d]; p++) if (free(d * P + p)) { s = d * P + p; break }
      }
      g[s] = u
    }
  }
  for (let c = 0; c < C; c++) for (let s = 0; s < S; s++) if (grid[c][s] >= 0) apply(grid[c][s], s, 1)

  // Per-teacher targets.
  const weekly = new Array<number>(T).fill(0)
  for (let i = 0; i < T * S; i++) weekly[Math.floor(i / S)] += occ[i]
  const maxDay = teachers.map((t) => t.maxPerDay)
  const share = weekly.map((w) => Math.ceil(w / D) + 1)
  const maxSubj = settings.maxSubjectPerDay
  const subjCount = new Int32Array(K)
  const freeShare = grid.map((g) => Math.ceil(Math.max(0, N - g.filter((u) => u >= 0).length) / D))

  const teacherDayCost = (t: number, d: number): number => {
    const base = t * S + d * P
    let lessons = 0, clash = 0, rest = 0
    for (let p = 0; p < len[d]; p++) {
      const n = occ[base + p]
      lessons += n
      if (n > 1) clash += n - 1
      // The periods of one lab session run together; that isn't a missed rest.
      if (n > 0 && adj[p] && occ[base + p + 1] > 0 && !(n === 1 && occ[base + p + 1] === 1 && cont[base + p] === 1)) rest++
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
    let repeat = 0, gaps = 0, seen = false, free = 0, early = 0
    for (let p = len[d] - 1; p >= 0; p--) {
      const u = g[base + p]
      if (u < 0) {
        free++
        if (seen) gaps++
        continue
      }
      seen = true
      const si = unitSubject[u]
      if (si < 0) continue
      if (unitEnd[u] > 0 && p < len[d] - unitEnd[u]) early++
      subjCount[si]++
      if (subjCount[si] > maxSubj) repeat++
    }
    for (let p = 0; p < len[d]; p++) {
      const u = g[base + p]
      if (u >= 0 && unitSubject[u] >= 0) subjCount[unitSubject[u]] = 0
    }
    return W.subjectRepeat * repeat + W.gap * gaps + W.freeSpread * Math.max(0, free - freeShare[c]) + W.endOfDay * early
  }

  /** A lab used by more groups than it has rooms. */
  const labDayCost = (k: number, d: number): number => {
    if (!rooms[k]) return 0
    const base = k * S + d * P
    let over = 0
    for (let p = 0; p < len[d]; p++) over += Math.max(0, roomOcc[base + p] - rooms[k])
    return W.clash * over
  }

  const tdCost = new Float64Array(T * D)
  const cdCost = new Float64Array(C * D)
  const ldCost = new Float64Array(K * D)
  let total = 0
  for (let t = 0; t < T; t++) for (let d = 0; d < D; d++) total += tdCost[t * D + d] = teacherDayCost(t, d)
  for (let c = 0; c < C; c++) for (let d = 0; d < D; d++) total += cdCost[c * D + d] = classDayCost(c, d)
  for (let k = 0; k < K; k++) for (let d = 0; d < D; d++) total += ldCost[k * D + d] = labDayCost(k, d)

  const movable: number[] = []
  for (let c = 0; c < C; c++) if (singles[c].length > 0) movable.push(c)

  const totalUnits = unitTeachers.length
  const maxIter = opts.maxIterations ?? Math.max(400_000, totalUnits * 3000)
  const timeLimit = opts.timeLimitMs ?? 8000
  const started = Date.now()

  let best = total
  let bestGrid = grid.map((g) => g.slice())
  let iter = 0

  // Keys touched by the current move.
  const tdKeys: number[] = [], cdKeys: number[] = [], ldKeys: number[] = []
  const tdNew: number[] = [], cdNew: number[] = [], ldNew: number[] = []
  const addKey = (keys: number[], k: number) => { if (!keys.includes(k)) keys.push(k) }
  const touchUnit = (u: number, d: number) => {
    if (u < 0) return
    for (const t of unitTeachers[u]) addKey(tdKeys, t * D + d)
    const b = unitBlock[u]
    if (b >= 0) for (const k of blocks[b].labs) addKey(ldKeys, k * D + d)
  }

  const swap = (c: number, i: number, j: number) => {
    const g = grid[c]
    const a = g[i], b = g[j]
    if (a >= 0) apply(a, i, -1)
    if (b >= 0) apply(b, j, -1)
    g[i] = b
    g[j] = a
    if (b >= 0) apply(b, i, 1)
    if (a >= 0) apply(a, j, 1)
  }

  if ((movable.length > 0 || placedBlocks.length > 0) && total > 0 && N > 1) {
    for (; iter < maxIter; iter++) {
      if ((iter & 4095) === 0) {
        if (total < best) { best = total; bestGrid = grid.map((g) => g.slice()) }
        if (best === 0) break
        if (Date.now() - started > timeLimit) break
        if ((iter & 65535) === 0) opts.onProgress?.(iter / maxIter, best)
      }
      const temp = T_START * Math.pow(T_END / T_START, iter / maxIter)
      tdKeys.length = cdKeys.length = ldKeys.length = 0

      // Pick a move: a list of cell swaps inside one class.
      let c: number
      const pairs: [number, number][] = []
      let blockMoved = -1, blockFrom = -1
      if (placedBlocks.length > 0 && (movable.length === 0 || rng() < BLOCK_MOVES)) {
        const b = placedBlocks[randInt(rng, placedBlocks.length)]
        const block = blocks[b]
        const windows = windowsFor(block.length)
        const to = windows[randInt(rng, windows.length)]
        if (to === block.start) continue
        c = block.c
        const g = grid[c]
        let ok = true
        for (let q = 0; q < block.length; q++) if (g[to + q] >= 0 && unitBlock[g[to + q]] >= 0) ok = false
        if (!ok) continue
        for (let q = 0; q < block.length; q++) pairs.push([block.start + q, to + q])
        blockMoved = b
        blockFrom = block.start
      } else {
        c = movable[randInt(rng, movable.length)]
        const g = grid[c]
        const oi = randInt(rng, N)
        let oj = randInt(rng, N - 1)
        if (oj >= oi) oj++
        const i = open[oi], j = open[oj]
        const a = g[i], b = g[j]
        if (a < 0 && b < 0) continue
        if ((a >= 0 && unitBlock[a] >= 0) || (b >= 0 && unitBlock[b] >= 0)) continue
        if (a >= 0 && b >= 0 && unitTeachers[a][0] === unitTeachers[b][0] && unitSubject[a] === unitSubject[b]) continue
        pairs.push([i, j])
      }

      const g = grid[c]
      for (const [i, j] of pairs) {
        const di = (i / P) | 0, dj = (j / P) | 0
        addKey(cdKeys, c * D + di)
        addKey(cdKeys, c * D + dj)
        for (const u of [g[i], g[j]]) { touchUnit(u, di); touchUnit(u, dj) }
      }

      let old = 0
      for (const k of tdKeys) old += tdCost[k]
      for (const k of cdKeys) old += cdCost[k]
      for (const k of ldKeys) old += ldCost[k]

      for (const [i, j] of pairs) swap(c, i, j)

      let next = 0
      tdKeys.forEach((k, q) => { next += tdNew[q] = teacherDayCost((k / D) | 0, k % D) })
      cdKeys.forEach((k, q) => { next += cdNew[q] = classDayCost((k / D) | 0, k % D) })
      ldKeys.forEach((k, q) => { next += ldNew[q] = labDayCost((k / D) | 0, k % D) })

      const delta = next - old
      if (delta <= 0 || rng() < Math.exp(-delta / temp)) {
        tdKeys.forEach((k, q) => { tdCost[k] = tdNew[q] })
        cdKeys.forEach((k, q) => { cdCost[k] = cdNew[q] })
        ldKeys.forEach((k, q) => { ldCost[k] = ldNew[q] })
        total += delta
        if (blockMoved >= 0) blocks[blockMoved].start = pairs[0][1]
      } else {
        for (let q = pairs.length - 1; q >= 0; q--) swap(c, pairs[q][0], pairs[q][1])
        if (blockMoved >= 0) blocks[blockMoved].start = blockFrom
      }
    }
  }
  if (total < best) { best = total; bestGrid = grid.map((g) => g.slice()) }
  opts.onProgress?.(1, best)

  const out: Grid = {}
  classes.forEach((cls, c) => {
    out[cls.id] = Array.from(bestGrid[c], (u): Cell | null => {
      if (u < 0) return null
      const b = unitBlock[u]
      if (b < 0) return { subjectId: unitSubjectId[u], teacherId: teachers[unitTeachers[u][0]].id }
      const block = blocks[b]
      return {
        subjectId: '', teacherId: '',
        lab: { block: block.index, part: unitPart[u], length: block.length, groups: block.groups, stations: block.stations },
      }
    })
  })
  return { grid: out, issues, score: Math.round(best), iterations: iter }
}

/** "G1 Physics, G2 Chemistry, G3 Biology", for messages and tooltips. */
export function describeStations(stations: { group: number; subjectId: Id }[], name: (id: Id) => string): string {
  return stations.map((st) => `${groupName(st.group)} ${name(st.subjectId)}`).join(', ')
}
