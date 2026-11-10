import Dexie, { type EntityTable, type Transaction } from 'dexie'
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

/** Campos de sincronização que todo registro sincronizado carrega. */
export interface Synced {
  /** Quando foi alterado neste aparelho (ms). */
  updatedAt?: number
  /** 1 = alterado aqui e ainda não enviado para a nuvem. */
  dirty?: 0 | 1
}

export interface Exercise extends Synced {
  id: string
  name: string
  muscle: Muscle | null
  loadMode: LoadMode
  /** Quanto o botão +/− muda a carga, em kg. */
  step: number
  custom: boolean
  /** Reservado para a v3 (vídeos). */
  videoUrl?: string
  createdAt: number
}

/** Drop set planejado na ficha: em quais séries e quantos drops em cada. */
export interface PlannedDrop {
  sets: 'last' | 'all'
  count: number
}

export interface PlanItem {
  id: string
  exerciseId: string
  sets: number
  reps?: string
  note?: string
  drop?: PlannedDrop
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

export interface Program extends Synced {
  id: string
  name: string
  createdAt: number
  days: ProgramDay[]
}

export interface Workout extends Synced {
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

export interface SetLog extends Synced {
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

export interface Meta extends Synced {
  key: string
  value: unknown
}

/** Registro apagado aqui que ainda precisa ser apagado na nuvem. */
export interface Tombstone {
  key: string
  collection: Collection
  id: string
  updatedAt: number
}

export const db = new Dexie('app-treino') as Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  programs: EntityTable<Program, 'id'>
  workouts: EntityTable<Workout, 'id'>
  sets: EntityTable<SetLog, 'id'>
  meta: EntityTable<Meta, 'key'>
  tombstones: EntityTable<Tombstone, 'key'>
}

db.version(1).stores({
  exercises: 'id, name',
  programs: 'id, createdAt',
  workouts: 'id, status, date, programId',
  sets: 'id, workoutId, exerciseId',
  meta: 'key',
})

db.version(2)
  .stores({
    exercises: 'id, name, dirty',
    programs: 'id, createdAt, dirty',
    workouts: 'id, status, date, programId, dirty',
    sets: 'id, workoutId, exerciseId, dirty',
    meta: 'key',
    tombstones: 'key',
  })
  .upgrade(async (tx) => {
    // Tudo que já existia passa a ser "pendente de envio", menos a lista pronta intocada.
    const now = Date.now()
    for (const name of ['programs', 'workouts', 'sets'])
      await tx.table(name).toCollection().modify({ updatedAt: now, dirty: 1 })
    await tx
      .table('exercises')
      .toCollection()
      .modify((e: Exercise) => {
        e.updatedAt = e.custom ? now : 0
        e.dirty = e.custom ? 1 : 0
      })
  })

// ---------- sincronização: marcar o que mudou ----------

/** Coleções enviadas para a nuvem. "settings" guarda a ficha ativa (meta.activeProgramId). */
export type Collection = 'exercises' | 'programs' | 'workouts' | 'sets' | 'settings'
export const SYNCED_TABLES = ['exercises', 'programs', 'workouts', 'sets'] as const
export const SYNCED_META = ['activeProgramId']

type SyncTx = Transaction & { __sync?: boolean; parent?: SyncTx }
const isSyncTx = (t?: Transaction) => {
  for (let x = t as SyncTx | undefined; x; x = x.parent) if (x.__sync) return true
  return false
}

/**
 * Roda escritas "de sistema" (dados vindos da nuvem, lista pronta, limpeza) sem marcar
 * nada como pendente e sem criar registros de exclusão.
 */
export function systemWrite<T>(tables: string[], fn: () => Promise<T>) {
  return db.transaction('rw', tables, (tx) => {
    ;(tx as SyncTx).__sync = true
    return fn()
  })
}

let onLocalChange: () => void = () => {}
export const setLocalChangeListener = (fn: () => void) => (onLocalChange = fn)

for (const name of SYNCED_TABLES) {
  const table = db.table(name)
  table.hook('creating', function (_key, obj, tx) {
    if (isSyncTx(tx)) return
    obj.updatedAt = Date.now()
    obj.dirty = 1
    this.onsuccess = () => onLocalChange()
  })
  table.hook('updating', function (mods, _key, _obj, tx) {
    if (isSyncTx(tx)) return
    this.onsuccess = () => onLocalChange()
    const m = mods as Record<string, unknown>
    if (Object.keys(m).every((k) => k === 'dirty' || k === 'updatedAt')) return
    return { updatedAt: Date.now(), dirty: 1 }
  })
  table.hook('deleting', function (key, _obj, tx) {
    if (isSyncTx(tx)) return
    const tomb: Tombstone = { key: `${name}:${key}`, collection: name, id: String(key), updatedAt: Date.now() }
    // Fora da transação da exclusão (ela não inclui a tabela tombstones).
    this.onsuccess = () =>
      Dexie.ignoreTransaction(() => db.tombstones.put(tomb))
        .then(() => onLocalChange())
        .catch((e) => console.error('Falha ao registrar exclusão para a nuvem', e))
  })
}

db.meta.hook('creating', function (key, obj, tx) {
  if (isSyncTx(tx) || !SYNCED_META.includes(String(key))) return
  obj.updatedAt = Date.now()
  obj.dirty = 1
  this.onsuccess = () => onLocalChange()
})
db.meta.hook('updating', function (_mods, key, _obj, tx) {
  if (isSyncTx(tx) || !SYNCED_META.includes(String(key))) return
  this.onsuccess = () => onLocalChange()
  return { updatedAt: Date.now(), dirty: 1 }
})

// ---------- lista pronta ----------

/** Coloca na biblioteca os exercícios prontos que ainda não existem (não mexe nos já editados). */
export async function seedLibrary() {
  const existing = new Set(await db.exercises.toCollection().primaryKeys())
  const missing = LIBRARY.filter((e) => !existing.has(e.id)).map<Exercise>((e) => ({
    ...e,
    step: e.step ?? 2,
    custom: false,
    createdAt: 0,
    updatedAt: 0,
    dirty: 0,
  }))
  if (missing.length) await systemWrite(['exercises'], () => db.exercises.bulkAdd(missing))
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value })
}

/** Grava um valor interno do app (não vai para a nuvem e não dispara envio). */
export async function setLocalMeta(key: string, value: unknown) {
  await systemWrite(['meta'], () => db.meta.put({ key, value }))
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
