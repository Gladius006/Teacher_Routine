# Test Plan

The engine carries almost all of the risk, so most tests go there. The UI is thin; it is checked manually in the browser plus an accessibility review.

| Area | Type | Target |
|---|---|---|
| `engine/blocks` (rest capacity, adjacency across lunch) | Unit | 100% of branches |
| `engine/assign` (eligibility, preference, pins, capacity) | Unit | every rule in spec R5 |
| `engine/place` + `evaluate` | Property-style: many seeds × random schools | Hard rules hold on every run |
| `engine/schedule` end-to-end on the sample school | Integration | Hard rules hold; rest rule ≥ 95% met; runs < 5 s |
| `store` (persist, import/export, stale detection) | Unit | Import rejects bad JSON; hash changes when data changes |
| UI | Manual in browser + accessibility review | Keyboard use, contrast, labels |

## Invariants checked on every generated routine
1. No teacher appears in two classes in the same slot.
2. Every class cell holds at most one lesson (by construction; asserted anyway).
3. For each class, the number of periods placed per subject equals the curriculum (unless the input was impossible and an `unplaced` issue says so).
4. Senior-class lessons are taught only by teachers with that skill.
5. No teacher exceeds `maxPerDay` or `maxPerWeek`.
6. `evaluate()` recomputed from scratch equals the engine's incremental score (catches delta-evaluation bugs; the most likely source of subtle errors).

## Example cases
- Junior class with no skilled teacher left: assigned to any teacher and flagged "outside skills" as info.
- Senior class with no skilled teacher: `unassigned` error; generation still completes.
- Pinned teacher is kept even when another teacher would score better.
- Curriculum larger than the week: pre-check error, lessons over capacity reported as `unplaced`.
- Easy school (one teacher per class, 4 lessons in 8 periods): rest rule fully met (0 missed).
- Lunch counts as rest: periods 4 and 5 taught back-to-back with lunch after 4 is **not** a violation.
- Determinism: same seed gives an identical routine; a different seed gives a different routine.
