import { isAdjacent, periodsOn } from './blocks'
import { className } from './assign'
import { isLab, labPlan } from './labs'
import { packLine, validLines, type LineLesson } from './lines'
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
/** Share of moves that move a block (lab time or option line period), when there are any. */
const BLOCK_MOVES = 0.2

/**
 * A run of periods that has to stay together and be at the same time in every
 * class it covers: a lab time (one class, groups spread over the labs) or an
 * option line period (several classes, a few subjects at once).
 */
interface Block {
  /** Class indices it covers; teachers are counted on the first class's cells only. */
  cls: number[]
  /** Unit ids per class, one per period. */
  units: number[][]
  length: number
  /** Subject indices of the labs used (lab times only). */
  labs: number[]
  start: number
  cell: (part: number) => Cell
}

/**
 * Phase 2: place lessons into each class's week with simulated annealing.
 * State is one array per class, so a class can never be double-booked. A cell
 * holds a "unit": a single lesson, or one period of a block. A move swaps two
 * single lessons inside one class, or moves a whole block to another run of
 * periods (in all its classes at once); only the touched teacher-days,
 * class-days and lab-days are rescored.
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
  const newUnit = (teachersHere: number[], subject: number, block: number, part: number) => {
    unitTeachers.push(teachersHere)
    unitSubject.push(subject)
    unitSubjectId.push(subject >= 0 ? subjects[subject].id : '')
    unitEnd.push(subject >= 0 ? Math.max(0, Math.round(subjects[subject].endOfDay ?? 0)) : 0)
    unitBlock.push(block)
    unitPart.push(part)
    return unitTeachers.length - 1
  }
  const addBlock = (cls: number[], length: number, teachersHere: number[], labs: number[], cell: Block['cell']) => {
    const b = blocks.length
    // Teachers sit on the first class's cells only, so a shared lesson counts once.
    const units = cls.map((_, j) => Array.from({ length }, (_, q) => newUnit(j === 0 ? teachersHere : [], -1, b, q)))
    blocks.push({ cls, units, length, labs, start: -1, cell })
  }

  for (const a of assignments) {
    if (a.teacherId === null || a.lineId) continue
    const ci = cIndex.get(a.classId)
    const ti = tIndex.get(a.teacherId)
    const si = sIndex.get(a.subjectId)
    if (ci === undefined || ti === undefined || si === undefined) continue
    for (let k = 0; k < a.periods; k++) singles[ci].push(newUnit([ti], si, -1, 0))
  }

  // Option lines: pack each line's lessons into shared periods.
  const lineAssignments = assignments.filter((a) => a.lineId && a.teacherId && tIndex.has(a.teacherId))
  for (const line of validLines(data)) {
    const lessons: LineLesson[] = []
    for (const a of lineAssignments.filter((x) => x.lineId === line.id)) {
      for (let k = 0; k < a.periods; k++) lessons.push({ subjectId: a.subjectId, teacherId: a.teacherId!, classIds: a.lineClassIds ?? [a.classId] })
    }
    for (const slot of packLine(lessons)) {
      const cls = [...new Set(slot.flatMap((l) => l.classIds))].map((id) => cIndex.get(id)).filter((c): c is number => c !== undefined)
      if (cls.length === 0) continue
      const lineCell: Cell = { subjectId: '', teacherId: '', line: { lineId: line.id, name: line.name, items: slot } }
      addBlock(cls, 1, slot.map((l) => tIndex.get(l.teacherId)!), [], () => lineCell)
    }
  }

  // Lab times: every lab needs its subject's teacher for the class (the first, if several share it).
  const teacherFor = new Map<string, Id>()
  for (const a of assignments) {
    if (!a.teacherId) continue
    for (const id of a.lineClassIds ?? [a.classId]) if (!teacherFor.has(`${id}:${a.subjectId}`)) teacherFor.set(`${id}:${a.subjectId}`, a.teacherId)
  }
  classes.forEach((cls, c) => {
    const plan = labPlan(cls, subjectById, data)
    if (!plan) return
    let index = 0
    for (const planned of plan.blocks) {
      const stations = planned.stations
        .filter((st) => tIndex.has(teacherFor.get(`${cls.id}:${st.subjectId}`) ?? ''))
        .map((st) => ({ ...st, teacherId: teacherFor.get(`${cls.id}:${st.subjectId}`)! }))
      if (stations.length === 0) continue
      const blockIndex = index++
      addBlock(
        [c], planned.length, stations.map((st) => tIndex.get(st.teacherId)!), stations.map((st) => sIndex.get(st.subjectId)!),
        (part) => ({ subjectId: '', teacherId: '', lab: { block: blockIndex, part, length: planned.length, groups: plan.groups, stations } }),
      )
    }
  })

  const occ = new Int16Array(T * S)
  /** Teacher is in a block period at this slot that carries on into the next one. */
  const cont = new Int16Array(T * S)
  const roomOcc = new Int16Array(K * S)
  const rooms = subjects.map((s) => (isLab(s.lab) ? Math.max(1, Math.round(s.lab.rooms)) : 0))

  const apply = (u: number, s: number, sign: number) => {
    const b = unitBlock[u]
    const carries = b >= 0 && unitPart[u] < blocks[b].length - 1
    for (const t of unitTeachers[u]) {
      occ[t * S + s] += sign
      if (carries) cont[t * S + s] += sign
    }
    // Labs are counted once, on the first class's cells.
    if (b >= 0 && unitTeachers[u].length > 0) for (const k of blocks[b].labs) roomOcc[k * S + s] += sign
  }

  const grid: Int32Array[] = classes.map(() => new Int32Array(S).fill(-1))
  const room = new Array<number>(C).fill(N)
  const placedBlocks: number[] = []

  // Blocks first (option lines, then lab times): they need the same free periods in every class they cover.
  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b]
    const windows = windowsFor(block.length)
    const fits = (w: number) => block.cls.every((c) => block.units[0].every((_, q) => grid[c][w + q] < 0))
    const day = randInt(rng, D)
    let start = -1
    for (let k = 0; k < D && start < 0; k++) start = windows.find((w) => Math.floor(w / P) === (day + k) % D && fits(w)) ?? -1
    if (start < 0 || block.cls.some((c) => room[c] < block.length)) {
      const first = classes[block.cls[0]]
      const cell = block.cell(0)
      issues.push({
        kind: 'unplaced', severity: 'error', classId: first.id,
        message: cell.line
          ? `${cell.line.name}: a period did not fit in the week for ${block.cls.map((c) => className(classes[c])).join(' and ')}. Reduce their periods.`
          : `Class ${className(first)}: a ${block.length}-period lab time did not fit in the week. Shorten lab sessions or reduce this class's periods.`,
      })
      continue
    }
    block.cls.forEach((c, j) => block.units[j].forEach((u, q) => { grid[c][start + q] = u }))
    block.cls.forEach((c) => { room[c] -= block.length })
    block.start = start
    placedBlocks.push(b)
  }

  for (let c = 0; c < C; c++) {
    const g = grid[c]
    const lessons = singles[c]
    if (lessons.length > room[c]) {
      // Drop what cannot fit, reporting per subject.
      const dropped = lessons.splice(room[c])
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
        for (let p = 0; p < len[d]; p++) if (g[d * P + p] < 0) { s = d * P + p; break }
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

  // A move: cell swaps, each inside one class (class, from, to), reused between moves.
  const maxSwaps = Math.max(1, ...blocks.map((b) => b.cls.length * b.length))
  const mvC = new Int32Array(maxSwaps), mvI = new Int32Array(maxSwaps), mvJ = new Int32Array(maxSwaps)
  let nm = 0
  const push = (c: number, i: number, j: number) => { mvC[nm] = c; mvI[nm] = i; mvJ[nm] = j; nm++ }

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
      nm = 0

      let blockMoved = -1, blockFrom = -1
      if (placedBlocks.length > 0 && (movable.length === 0 || rng() < BLOCK_MOVES)) {
        const b = placedBlocks[randInt(rng, placedBlocks.length)]
        const block = blocks[b]
        const windows = windowsFor(block.length)
        const to = windows[randInt(rng, windows.length)]
        if (to === block.start) continue
        // The new run must hold only single lessons or free periods, in every class the block covers.
        let ok = true
        for (const c of block.cls) for (let q = 0; q < block.length; q++) if (grid[c][to + q] >= 0 && unitBlock[grid[c][to + q]] >= 0) ok = false
        if (!ok) continue
        for (const c of block.cls) for (let q = 0; q < block.length; q++) push(c, block.start + q, to + q)
        blockMoved = b
        blockFrom = block.start
      } else {
        const c = movable[randInt(rng, movable.length)]
        const g = grid[c]
        const oi = randInt(rng, N)
        let oj = randInt(rng, N - 1)
        if (oj >= oi) oj++
        const i = open[oi], j = open[oj]
        const a = g[i], b = g[j]
        if (a < 0 && b < 0) continue
        if ((a >= 0 && unitBlock[a] >= 0) || (b >= 0 && unitBlock[b] >= 0)) continue
        if (a >= 0 && b >= 0 && unitTeachers[a][0] === unitTeachers[b][0] && unitSubject[a] === unitSubject[b]) continue
        push(c, i, j)
      }

      for (let m = 0; m < nm; m++) {
        const c = mvC[m], i = mvI[m], j = mvJ[m]
        const di = (i / P) | 0, dj = (j / P) | 0
        addKey(cdKeys, c * D + di)
        addKey(cdKeys, c * D + dj)
        const a = grid[c][i], b = grid[c][j]
        touchUnit(a, di); touchUnit(a, dj); touchUnit(b, di); touchUnit(b, dj)
      }

      let old = 0
      for (const k of tdKeys) old += tdCost[k]
      for (const k of cdKeys) old += cdCost[k]
      for (const k of ldKeys) old += ldCost[k]

      for (let m = 0; m < nm; m++) swap(mvC[m], mvI[m], mvJ[m])

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
        if (blockMoved >= 0) blocks[blockMoved].start = mvJ[0]
      } else {
        for (let m = nm - 1; m >= 0; m--) swap(mvC[m], mvI[m], mvJ[m])
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
      return blocks[b].cell(unitPart[u])
    })
  })
  return { grid: out, issues, score: Math.round(best), iterations: iter }
}
