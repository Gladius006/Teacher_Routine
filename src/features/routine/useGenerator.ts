import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkerRequest, WorkerResponse } from '../../engine/worker'
import { useStore } from '../../store/store'

/** Runs the scheduler in a Web Worker so the page stays responsive. */
export function useGenerator() {
  const setRoutine = useStore((s) => s.setRoutine)
  const workerRef = useRef<Worker | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => workerRef.current?.terminate(), [])

  const generate = useCallback(() => {
    workerRef.current?.terminate()
    const worker = new Worker(new URL('../../engine/worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    setRunning(true)
    setProgress(0)
    setError(null)
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') setProgress(msg.fraction)
      else {
        if (msg.type === 'done') setRoutine(msg.routine)
        else setError(msg.message)
        setRunning(false)
        worker.terminate()
        workerRef.current = null
      }
    }
    worker.onerror = () => {
      setError('Something went wrong while building the routine. Try again.')
      setRunning(false)
    }
    const data = useStore.getState().data
    worker.postMessage({ data, seed: Math.floor(Math.random() * 2 ** 31) } satisfies WorkerRequest)
  }, [setRoutine])

  return { generate, running, progress, error }
}
