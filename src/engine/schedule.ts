import { assignTeachers, className } from './assign'
import { slotsPerWeek } from './blocks'
import { evaluate } from './evaluate'
import { formatGrades, isOffered } from './grades'
import { mulberry32 } from './rng'
import { placeLessons, type PlaceOptions } from './place'
import type { Issue, Routine, SchoolData } from './types'

/** Stable short hash of the inputs, used to tell when a routine is out of date. */
export function hashInputs(data: SchoolData): string {
  const s = JSON.stringify([data.settings, data.subjects, data.teachers, data.classes])
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** Problems with the inputs that no schedule can fix. */
export function precheck(data: SchoolData): Issue[] {
  const issues: Issue[] = []
  const S = slotsPerWeek(data.settings)
  for (const cls of data.classes) {
    const need = cls.curriculum.reduce((n, c) => n + Math.max(0, c.periods), 0)
    if (need > S) {
      issues.push({
        kind: 'overCapacity', severity: 'error', classId: cls.id,
        message: `Class ${className(cls)} needs ${need} periods but the week only has ${S}. Remove ${need - S} from its subjects.`,
      })
    }
  }
  return issues
}

/**
 * Removes subjects from classes they aren't taught in (e.g. Art in class 9)
 * and reports each one, so the rest of the engine only sees valid lessons.
 */
export function applySubjectGrades(data: SchoolData): { data: SchoolData; issues: Issue[] } {
  const byId = new Map(data.subjects.map((s) => [s.id, s]))
  const issues: Issue[] = []
  const classes = data.classes.map((c) => {
    const curriculum = c.curriculum.filter((item) => {
      const subject = byId.get(item.subjectId)
      if (item.periods <= 0 || isOffered(subject, c.grade)) return true
      issues.push({
        kind: 'notOffered', severity: 'warning', classId: c.id, subjectId: item.subjectId,
        message: `${subject!.name} is only taught in classes ${formatGrades(subject!.grades!)}, so its ${item.periods} periods in class ${className(c)} were left out. Remove it from ${className(c)} or allow class ${c.grade} for ${subject!.name}.`,
      })
      return false
    })
    return curriculum.length === c.curriculum.length ? c : { ...c, curriculum }
  })
  return { data: { ...data, classes }, issues }
}

export interface GenerateOptions extends PlaceOptions {
  seed?: number
}

export function generateRoutine(input: SchoolData, opts: GenerateOptions = {}): Routine {
  const started = Date.now()
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31)
  const rng = mulberry32(seed)

  const { data, issues: offerIssues } = applySubjectGrades(input)
  const pre = [...offerIssues, ...precheck(data)]
  const { assignments, issues: assignIssues } = assignTeachers(data, rng)
  const placed = placeLessons(data, assignments, rng, opts)
  const ev = evaluate(data, placed.grid)

  const rank = { error: 0, warning: 1, info: 2 } as const
  const issues = [...pre, ...assignIssues, ...placed.issues, ...ev.issues].sort(
    (a, b) => rank[a.severity] - rank[b.severity],
  )

  return {
    generatedAt: Date.now(),
    inputHash: hashInputs(input),
    seed,
    assignments,
    grid: placed.grid,
    issues,
    stats: {
      lessons: ev.lessons,
      restGiven: ev.restGiven,
      restMissed: ev.restMissed,
      clashes: ev.clashes,
      score: ev.score,
      ms: Date.now() - started,
      iterations: placed.iterations,
    },
  }
}
