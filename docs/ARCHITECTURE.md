# ADR-001: Routine Builder architecture and scheduling engine

**Status:** Accepted
**Date:** 2026-09-22
**Deciders:** Project owner

## Context

The spec in `docs/SPEC.md` asks for a browser-only app that builds a weekly school routine. The hard part is the scheduler. It has to:

- choose one teacher for each (class, subject) pair, respecting skills (senior classes) and allowing anyone for junior classes, with a preference order;
- place every lesson into a days × periods grid with no teacher or class clashes;
- give teachers a free period after each class wherever possible (the "rest rule"), with lunch counting as rest;
- spread subjects across the week and keep class free periods at the end of the day;
- finish in seconds for about 40 sections and 60 teachers, without freezing the page.

Constraints: no server; a single developer; must be testable; school sizes are small (at most around 2,000 lessons a week).

## Decision

1. **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4. Zustand store with its `persist` middleware (localStorage). No router; a hash-synced tab state is enough for about 6 screens.
2. **Scheduler:** a two-phase heuristic in plain TypeScript with no DOM dependency, running in a **Web Worker**:
   - **Phase 1: teacher assignment** (greedy, most-constrained first).
   - **Phase 2: timetable placement** (simulated annealing over per-class grids).
3. **Charts:** hand-built SVG/CSS (heatmap, bars) instead of a charting library. The charts are simple, and this keeps the bundle small and the styling fully consistent with the app's design.
4. **Tests:** Vitest for the scheduler (hard-rule invariants on many random seeds) and store logic.

## Options considered (scheduler)

### A: Two-phase heuristic (greedy assignment + simulated annealing) ✅
| Dimension | Assessment |
|---|---|
| Complexity | Medium. About 400 lines, all ours, easy to debug |
| Cost | Zero dependencies |
| Scalability | Linear per move; about 1M moves in 3–5 s handles 40 sections easily |
| Soft constraints | Natural: every rule is a weighted penalty |

**Pros:** handles soft constraints well, always returns a "best so far" answer with a list of issues (spec R7), easy to add new rules (unavailability, locks).
**Cons:** does not prove optimality; results vary by seed (this is also what makes "Try again" work).

### B: Integer programming / CP solver compiled to WASM (HiGHS, GLPK, OR-Tools)
| Dimension | Assessment |
|---|---|
| Complexity | High: model formulation plus a WASM toolchain |
| Cost | 1–5 MB WASM bundle |
| Scalability | Good for hard rules; soft rules make the model much bigger |

**Pros:** optimal or near-optimal answers, can prove infeasibility.
**Cons:** heavy bundle; the rest rule and spreading rules need many auxiliary variables; if the model is infeasible you get no routine at all, which fails R7.

### C: Plain backtracking constraint search
**Pros:** simple to write for hard rules. **Cons:** exponential worst case, poor at optimizing soft rules, stalls on tight schools.

## Trade-off analysis

The key requirement is "always give me a good routine and tell me what's wrong", not "prove the best one exists". Option A does this directly and stays small and dependency-free. Option B's optimality is not worth its weight or its all-or-nothing behavior at school scale.

## Data model

```ts
Settings   { dayNames: string[]; periodsPerDay; lunchAfter: number | null;
             juniorMaxGrade; maxSubjectPerDay; defaultMaxPerDay; defaultMaxPerWeek }
Subject    { id; name; code; color }
Teacher    { id; name; code; primary: SubjectId[]; secondary: SubjectId[];
             maxPerDay; maxPerWeek }
ClassSection { id; grade: number; section: string;
               curriculum: { subjectId; periods; pinnedTeacherId?: TeacherId }[] }
Routine    { generatedAt; inputHash; seed;
             assignments: { classId; subjectId; teacherId | null }[];
             grid: Record<ClassId, (Lesson | null)[]>   // index = day * P + period
             issues: Issue[]; stats: { restGiven; restMissed; score; ms } }
```

`inputHash` lets the UI mark a routine as stale when data changes after generating.

## Scheduling algorithm

### Phase 1: assignment
1. Expand the curriculum into requirements `(class, subject, periods)`.
2. Eligible teachers: the pin if one is set; for a **senior** class, teachers with the subject as primary or secondary; for a **junior** class, every teacher.
3. Order the requirements by fewest eligible teachers first, then by most periods.
4. For each requirement, pick the eligible teacher with capacity (`load + periods <= maxPerWeek`) and the lowest score:
   `tier (primary 0 / secondary 4 / no skill 10) + 12 × load ratio + 6 × max(0, load - restCapacity)/periods + small random jitter (seed)`.
   Here `restCapacity` is the most periods a week a teacher can teach while still resting after every class. For each block of consecutive periods between breaks it is `ceil(blockLength / 2)`, summed over the day and multiplied by the number of days. With 8 periods and lunch after period 4 that is 4 a day, or 24 a week.
5. Requirements with no eligible teacher or no capacity become `unassigned` issues.

### Phase 2: placement (simulated annealing)
- **State:** one array of `days × P` cells for each class, each holding a lesson or empty. Class clashes are impossible by construction.
- **Start:** spread each class's lessons across days round-robin, with free cells at the end of each day.
- **Move:** pick a random class and swap two of its cells (lesson with lesson, or lesson with an empty cell).
- **Cost** (weights in `engine/weights.ts`):

| Term | Weight | Kind |
|---|---|---|
| Teacher in two places in the same period | 1000 per extra | hard |
| Teacher over `maxPerDay` | 400 per period | hard |
| Rest missed: teaches period p and p+1 in the same block | 12 | soft (the key rule) |
| Subject over `maxSubjectPerDay` in a class-day | 40 | soft |
| Class free cell before a lesson in the same day (gap) | 25 | soft |
| Teacher daily load above their even share + 1 | 6 | soft |

- **Delta evaluation:** a swap touches one class-day or two, and at most four teacher-days. Only those are rescored, using `occ[teacher][slot]` counters, so each move costs O(P).
- **Schedule:** geometric cooling from T=40 to T=0.05, time-boxed (default 4 s), keeping the best state seen; progress messages go to the UI every ~100 ms.
- **Output:** best grid plus issues (clashes, over-max, rest missed, unplaced, unassigned).
- **Randomness:** seeded `mulberry32` PRNG, so tests are deterministic and "Try again" just uses a new seed.

## Module layout

```
src/
  engine/        (pure TS, no React; unit-tested)
    types.ts  rng.ts  weights.ts  blocks.ts
    assign.ts     (phase 1)
    place.ts      (phase 2)
    evaluate.ts   (full scoring + issue extraction, used by tests and UI)
    schedule.ts   (runs both phases)
    worker.ts     (Web Worker wrapper)
    sample.ts     (sample school)
  store/         (Zustand store + persistence + import/export)
  components/    (UI primitives)
  features/      (settings, subjects, teachers, classes, routine, workload)
```

## Consequences

- **Easier:** adding rules (unavailability, locked cells, double periods) means adding a cost term; the engine can be tested without a browser.
- **Harder:** proving a school is infeasible. We rely on pre-checks (curriculum bigger than the week, no eligible teacher, total demand above total capacity) plus leftover-violation reporting.
- **Revisit:** if schools grow past about 100 sections, add restarts or parallel workers; if rooms are added (P2), they become another resource with a clash term.

## Action items
1. [ ] Scaffold Vite + React + TS + Tailwind v4 + Zustand + Vitest
2. [ ] Engine: types, rng, blocks, assign, place, evaluate, worker
3. [ ] Engine tests: hard-rule invariants over many seeds, rest rule on an easy case, junior/senior eligibility, pins
4. [ ] UI: settings, subjects, teachers, classes, generate, routine views, issues, workload, print
5. [ ] Accessibility review, UX copy pass, design critique
