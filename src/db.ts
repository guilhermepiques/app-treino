import Dexie, { type EntityTable } from 'dexie'
import { LIBRARY } from './data/library'

export type Muscle =
  | 'peito'
  | 'costas'
  | 'ombro'
  | 'biceps'
  | 'triceps'
  | 'perna'
  | 'panturrilha'
  | 'abdomen'

/** Como a carga é anotada: total da máquina, por halter, ou só as anilhas (sem a barra). */
export type LoadMode = 'total' | 'halter' | 'barra'

export interface Exercise {
  id: string
  name: string
  muscle: Muscle | null
  loadMode: LoadMode
  /** Quanto o botão +/− muda a carga, em kg. */
  step: number
  custom: boolean
  /** Reservado para a v2 (vídeos). */
  videoUrl?: string
  createdAt: number
}

export interface PlanItem {
  id: string
  exerciseId: string
  sets: number
  reps?: string
  note?: string
}

/** Um bloco com 1 exercício é normal; com 2, é um biset. */
export interface PlanBlock {
  id: string
  items: PlanItem[]
}

export interface ProgramDay {
  id: string
  label: string
  name?: string
  muscles: Muscle[]
  blocks: PlanBlock[]
}

export interface Program {
  id: string
  name: string
  createdAt: number
  days: ProgramDay[]
}

export interface Workout {
  id: string
  programId: string
  dayId: string
  dayLabel: string
  dayName?: string
  muscles: Muscle[]
  /** AAAA-MM-DD */
  date: string
  startedAt: number
  finishedAt?: number
  status: 'active' | 'done'
  /** Cópia da ficha no início do treino; trocas feitas "só hoje" mudam só aqui. */
  blocks: PlanBlock[]
}

export interface Drop {
  weight: number
  reps: number
}

export interface SetLog {
  id: string
  workoutId: string
  exerciseId: string
  itemId: string
  /** Posição da série dentro do exercício neste treino (0, 1, 2…). */
  order: number
  weight: number
  reps: number
  warmup: boolean
  drops: Drop[]
  createdAt: number
}

export interface Meta {
  key: string
  value: unknown
}

export const db = new Dexie('app-treino') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  programs: EntityTable<Program, 'id'>
  workouts: EntityTable<Workout, 'id'>
  sets: EntityTable<SetLog, 'id'>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  exercises: 'id, name',
  programs: 'id, createdAt',
  workouts: 'id, status, date, programId',
  sets: 'id, workoutId, exerciseId',
  meta: 'key',
})

/** Coloca na biblioteca os exercícios prontos que ainda não existem (não mexe nos já editados). */
export async function seedLibrary() {
  const existing = new Set(await db.exercises.toCollection().primaryKeys())
  const missing = LIBRARY.filter((e) => !existing.has(e.id)).map<Exercise>((e) => ({
    ...e,
    step: e.step ?? 2,
    custom: false,
    createdAt: 0,
  }))
  if (missing.length) await db.exercises.bulkAdd(missing)
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    /* sem suporte: segue normal */
  }
}
