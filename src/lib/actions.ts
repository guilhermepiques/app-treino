import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta, type Exercise, type PlanBlock, type Program, type ProgramDay, type Workout } from '../db'
import { DAY_LETTERS, uid } from './util'

// ---------- leitura ----------

export function useExercises() {
  return useLiveQuery(async () => {
    const list = await db.exercises.toArray()
    return new Map(list.map((e) => [e.id, e]))
  })
}

export function useActiveProgram() {
  return useLiveQuery(async () => {
    const programs = await db.programs.orderBy('createdAt').reverse().toArray()
    const activeId = await getMeta<string>('activeProgramId')
    const program = programs.find((p) => p.id === activeId) ?? programs[0] ?? null
    return { program, programs }
  })
}

export function useActiveWorkout() {
  return useLiveQuery(async () => (await db.workouts.where('status').equals('active').first()) ?? null)
}

// ---------- ficha ----------

export async function createProgram(dayCount: number) {
  const letters = DAY_LETTERS.slice(0, dayCount)
  const program: Program = {
    id: uid(),
    name: `Ficha ${letters.join('')}`,
    createdAt: Date.now(),
    days: letters.map((label) => ({ id: uid(), label, muscles: [], blocks: [] })),
  }
  await db.programs.add(program)
  await setMeta('activeProgramId', program.id)
  return program.id
}

export async function mutateProgram(id: string, fn: (p: Program) => void) {
  await db.transaction('rw', db.programs, async () => {
    const p = await db.programs.get(id)
    if (!p) return
    const copy = structuredClone(p)
    fn(copy)
    await db.programs.put(copy)
  })
}

export async function mutateDay(programId: string, dayId: string, fn: (d: ProgramDay) => void) {
  await mutateProgram(programId, (p) => {
    const d = p.days.find((x) => x.id === dayId)
    if (d) fn(d)
  })
}

/** Reaplica as letras A, B, C… na ordem atual dos dias. */
export const relabelDays = (p: Program) => p.days.forEach((d, i) => (d.label = DAY_LETTERS[i] ?? String(i + 1)))

export async function setActiveProgram(id: string) {
  await setMeta('activeProgramId', id)
}

export async function deleteProgram(id: string) {
  await db.programs.delete(id)
  if ((await getMeta<string>('activeProgramId')) === id) {
    const next = await db.programs.orderBy('createdAt').last()
    await setMeta('activeProgramId', next?.id ?? null)
  }
}

// ---------- blocos (usados na ficha e no treino) ----------

export function moveBlock(blocks: PlanBlock[], index: number, dir: -1 | 1) {
  const j = index + dir
  if (j < 0 || j >= blocks.length) return
  ;[blocks[index], blocks[j]] = [blocks[j], blocks[index]]
}

/** Junta o bloco com o próximo, formando um biset. */
export function joinWithNext(blocks: PlanBlock[], index: number) {
  const a = blocks[index]
  const b = blocks[index + 1]
  if (!a || !b || a.items.length + b.items.length > 2) return
  a.items.push(...b.items)
  blocks.splice(index + 1, 1)
}

export function splitBlock(blocks: PlanBlock[], index: number) {
  const a = blocks[index]
  if (!a || a.items.length < 2) return
  const rest = a.items.splice(1)
  blocks.splice(index + 1, 0, ...rest.map((it) => ({ id: uid(), items: [it] })))
}

export function removeItem(blocks: PlanBlock[], itemId: string) {
  for (let i = 0; i < blocks.length; i++) {
    const k = blocks[i].items.findIndex((it) => it.id === itemId)
    if (k >= 0) {
      blocks[i].items.splice(k, 1)
      if (!blocks[i].items.length) blocks.splice(i, 1)
      return
    }
  }
}

export function findItem(blocks: PlanBlock[], itemId: string) {
  for (const b of blocks) for (const it of b.items) if (it.id === itemId) return it
  return undefined
}

export const newBlock = (exerciseId: string, sets = 3): PlanBlock => ({
  id: uid(),
  items: [{ id: uid(), exerciseId, sets }],
})

// ---------- exercícios ----------

export async function createExercise(data: Pick<Exercise, 'name' | 'muscle' | 'loadMode'>) {
  const ex: Exercise = {
    id: 'c-' + uid(),
    name: data.name.trim(),
    muscle: data.muscle,
    loadMode: data.loadMode,
    step: data.loadMode === 'total' ? 5 : 2,
    custom: true,
    createdAt: Date.now(),
  }
  await db.exercises.add(ex)
  return ex.id
}

export async function updateExercise(id: string, patch: Partial<Exercise>) {
  await db.exercises.update(id, patch)
}

// ---------- treino ----------

export function suggestNextDay(program: Program, lastDone: Workout | undefined) {
  if (!program.days.length) return undefined
  if (!lastDone) return program.days[0]
  const i = program.days.findIndex((d) => d.id === lastDone.dayId)
  return program.days[(i + 1) % program.days.length] ?? program.days[0]
}

export async function startWorkout(program: Program, day: ProgramDay, date: string) {
  const w: Workout = {
    id: uid(),
    programId: program.id,
    dayId: day.id,
    dayLabel: day.label,
    dayName: day.name,
    muscles: [...day.muscles],
    date,
    startedAt: Date.now(),
    status: 'active',
    blocks: structuredClone(day.blocks),
  }
  await db.workouts.add(w)
  return w.id
}

export async function mutateWorkout(id: string, fn: (w: Workout) => void) {
  await db.transaction('rw', db.workouts, async () => {
    const w = await db.workouts.get(id)
    if (!w) return
    const copy = structuredClone(w)
    fn(copy)
    await db.workouts.put(copy)
  })
}

export async function deleteWorkout(id: string) {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.sets.where('workoutId').equals(id).delete()
    await db.workouts.delete(id)
  })
}

export async function deleteItemSets(workoutId: string, itemId: string) {
  await db.sets.where('workoutId').equals(workoutId).and((s) => s.itemId === itemId).delete()
}
