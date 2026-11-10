import type { SetLog, Workout } from '../db'

export interface Perf {
  weight: number
  reps: number
}

/** Melhor = maior carga; empate na carga, mais repetições. >0 se a for melhor que b. */
export const cmpPerf = (a: Perf, b: Perf) => (a.weight !== b.weight ? a.weight - b.weight : a.reps - b.reps)

export type Trend = 'up' | 'same' | 'down'
export const trend = (cur: Perf, ref: Perf): Trend => {
  const c = cmpPerf(cur, ref)
  return c > 0 ? 'up' : c < 0 ? 'down' : 'same'
}

export interface ExerciseRefs {
  /** Séries válidas (sem aquecimento) do último treino com esse exercício. */
  prev: SetLog[]
  prevDate?: string
  /** Melhor série válida de todos os outros treinos. Drops e aquecimento não contam. */
  best: SetLog | null
  bestDate?: string
}

export const EMPTY_REFS: ExerciseRefs = { prev: [], best: null }

const before = (a: Workout, b: Workout) => a.date < b.date || (a.date === b.date && a.startedAt < b.startedAt)

export const sortWorkoutsDesc = (a: Workout, b: Workout) =>
  a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.startedAt - a.startedAt

/**
 * Calcula, para cada exercício, a série anterior (último treino antes deste)
 * e a melhor série de todos os outros treinos.
 */
export function computeRefs(
  current: Workout,
  exerciseIds: string[],
  allSets: SetLog[],
  workouts: Map<string, Workout>,
): Map<string, ExerciseRefs> {
  const out = new Map<string, ExerciseRefs>()
  for (const exId of exerciseIds) {
    const byWorkout = new Map<string, SetLog[]>()
    let best: SetLog | null = null
    let bestDate: string | undefined
    for (const s of allSets) {
      if (s.exerciseId !== exId || s.workoutId === current.id || s.warmup) continue
      const w = workouts.get(s.workoutId)
      if (!w || w.status !== 'done') continue
      if (!byWorkout.has(w.id)) byWorkout.set(w.id, [])
      byWorkout.get(w.id)!.push(s)
      if (!best || cmpPerf(s, best) > 0) {
        best = s
        bestDate = w.date
      }
    }
    let prevW: Workout | undefined
    for (const wid of byWorkout.keys()) {
      const w = workouts.get(wid)!
      if (!before(w, current)) continue
      if (!prevW || before(prevW, w)) prevW = w
    }
    const prev = prevW ? byWorkout.get(prevW.id)!.sort((a, b) => a.order - b.order) : []
    out.set(exId, { prev, prevDate: prevW?.date, best, bestDate })
  }
  return out
}
