/// <reference lib="webworker" />
import { generateRoutine } from './schedule'
import type { Routine, SchoolData } from './types'

export type WorkerRequest = { data: SchoolData; seed: number }
export type WorkerResponse =
  | { type: 'progress'; fraction: number; score: number }
  | { type: 'done'; routine: Routine }
  | { type: 'error'; message: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const routine = generateRoutine(e.data.data, {
      seed: e.data.seed,
      onProgress: (fraction, score) => ctx.postMessage({ type: 'progress', fraction, score } satisfies WorkerResponse),
    })
    ctx.postMessage({ type: 'done', routine } satisfies WorkerResponse)
  } catch (err) {
    ctx.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse)
  }
}
