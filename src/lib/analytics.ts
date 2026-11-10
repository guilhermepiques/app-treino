import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db, type Exercise, type Muscle, type SetLog, type Workout } from '../db'
import { useExercises } from './actions'
import { cmpPerf } from './stats'

/** Força estimada (1 repetição máxima), fórmula de Epley. */
export const e1rm = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30))

/** Um exercício dentro de um treino finalizado. */
export interface Session {
  workout: Workout
  date: string
  /** Séries válidas (sem aquecimento), na ordem. */
  sets: SetLog[]
  /** Série mais pesada (empate: mais reps). */
  best: SetLog
  /** Maior força estimada entre as séries. */
  strength: number
  strengthSet: SetLog
  /** Soma de carga × reps, incluindo drops. */
  volume: number
  /** Bateu a melhor série de todos os treinos anteriores. */
  pr: boolean
}

const asc = (a: Workout, b: Workout) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.startedAt - b.startedAt)

export function buildSessions(workouts: Workout[], sets: SetLog[]) {
  const done = workouts.filter((w) => w.status === 'done').sort(asc)
  const byWorkout = new Map<string, SetLog[]>()
  for (const s of sets) {
    if (s.warmup) continue
    if (!byWorkout.has(s.workoutId)) byWorkout.set(s.workoutId, [])
    byWorkout.get(s.workoutId)!.push(s)
  }
  const out = new Map<string, Session[]>()
  const running = new Map<string, SetLog>()
  for (const w of done) {
    const byEx = new Map<string, SetLog[]>()
    for (const s of byWorkout.get(w.id) ?? []) {
      if (!byEx.has(s.exerciseId)) byEx.set(s.exerciseId, [])
      byEx.get(s.exerciseId)!.push(s)
    }
    for (const [exId, list] of byEx) {
      list.sort((a, b) => a.order - b.order)
      let best = list[0]
      let strengthSet = list[0]
      let volume = 0
      for (const s of list) {
        if (cmpPerf(s, best) > 0) best = s
        if (e1rm(s.weight, s.reps) > e1rm(strengthSet.weight, strengthSet.reps)) strengthSet = s
        volume += s.weight * s.reps + s.drops.reduce((t, d) => t + d.weight * d.reps, 0)
      }
      const prev = running.get(exId)
      const pr = !!prev && cmpPerf(best, prev) > 0
      if (!prev || cmpPerf(best, prev) > 0) running.set(exId, best)
      if (!out.has(exId)) out.set(exId, [])
      out.get(exId)!.push({
        workout: w,
        date: w.date,
        sets: list,
        best,
        strength: e1rm(strengthSet.weight, strengthSet.reps),
        strengthSet,
        volume,
        pr,
      })
    }
  }
  return { done, sessionsByEx: out }
}

/** Todos os dados de treinos finalizados, já organizados por exercício. */
export function useTrainingData() {
  const exercises = useExercises()
  const raw = useLiveQuery(async () => {
    const workouts = await db.workouts.where('status').equals('done').toArray()
    const sets = await db.sets.toArray()
    return { workouts, sets }
  })
  return useMemo(() => {
    if (!raw || !exercises) return undefined
    return { ...buildSessions(raw.workouts, raw.sets), exercises }
  }, [raw, exercises])
}

export type TrainingData = NonNullable<ReturnType<typeof useTrainingData>>

// ---------- datas ----------

const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const isoTime = (iso: string) => toDate(iso).getTime()

export const addDays = (iso: string, n: number) => {
  const d = toDate(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Segunda-feira da semana da data. */
export const mondayOf = (iso: string) => {
  const d = toDate(iso)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return toISO(d)
}

/** "2026-11" */
export const monthOf = (iso: string) => iso.slice(0, 7)

export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ---------- resumos ----------

export interface MonthStats {
  workouts: number
  sets: number
  volume: number
  prs: number
}

/** Números do mês. Com `untilDay`, conta só até esse dia (para comparar períodos iguais). */
export function monthStats(data: TrainingData, ym: string, untilDay = 31): MonthStats {
  const inMonth = (iso: string) => monthOf(iso) === ym && Number(iso.slice(8, 10)) <= untilDay
  const workouts = data.done.filter((w) => inMonth(w.date)).length
  let sets = 0
  let volume = 0
  let prs = 0
  for (const list of data.sessionsByEx.values())
    for (const s of list) {
      if (!inMonth(s.date)) continue
      sets += s.sets.length
      volume += s.volume
      if (s.pr) prs++
    }
  return { workouts, sets, volume, prs }
}

/** Séries válidas por grupo muscular na semana que começa na segunda `monday`. */
export function weekMuscleSets(data: TrainingData, monday: string) {
  const end = addDays(monday, 6)
  const counts = new Map<Muscle | null, number>()
  for (const [exId, list] of data.sessionsByEx) {
    const muscle = data.exercises.get(exId)?.muscle ?? null
    for (const s of list) {
      if (s.date < monday || s.date > end) continue
      counts.set(muscle, (counts.get(muscle) ?? 0) + s.sets.length)
    }
  }
  return counts
}

// ---------- gráfico por exercício ----------

export type Metric = 'carga' | 'forca' | 'volume'
export type Range = '3m' | '6m' | '1a' | 'tudo'

export const RANGE_DAYS: Record<Range, number | null> = { '3m': 91, '6m': 182, '1a': 365, tudo: null }

/** Exercício feito só com peso do corpo (todas as cargas 0): o gráfico mostra repetições. */
export const isBodyweight = (sessions: Session[]) => sessions.every((s) => s.best.weight === 0)

export function metricValue(s: Session, metric: Metric, bodyweight: boolean) {
  if (bodyweight) return metric === 'volume' ? s.sets.reduce((t, x) => t + x.reps, 0) : s.best.reps
  if (metric === 'carga') return s.best.weight
  if (metric === 'forca') return Math.round(s.strength * 2) / 2
  return s.volume
}

export const exerciseName = (exercises: Map<string, Exercise>, id: string) => exercises.get(id)?.name ?? 'Exercício'
