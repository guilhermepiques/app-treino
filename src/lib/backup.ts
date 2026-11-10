import { db, setMeta } from '../db'
import { todayISO } from './util'

const APP = 'app-treino'

export async function exportBackup() {
  const data = {
    app: APP,
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: await db.exercises.toArray(),
    programs: await db.programs.toArray(),
    workouts: await db.workouts.toArray(),
    sets: await db.sets.toArray(),
    meta: (await db.meta.toArray()).filter((m) => m.key !== 'lastBackup'),
  }
  const name = `treino-backup-${todayISO()}.json`
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const file = new File([blob], name, { type: 'application/json' })

  // No iPhone, o menu de compartilhar permite "Salvar em Arquivos".
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      await setMeta('lastBackup', Date.now())
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  await setMeta('lastBackup', Date.now())
}

export async function importBackup(file: File) {
  const data = JSON.parse(await file.text())
  if (data?.app !== APP || !Array.isArray(data.workouts)) {
    throw new Error('Esse arquivo não é um backup deste app.')
  }
  await db.transaction('rw', [db.exercises, db.programs, db.workouts, db.sets, db.meta], async () => {
    await Promise.all([db.exercises.clear(), db.programs.clear(), db.workouts.clear(), db.sets.clear(), db.meta.clear()])
    await db.exercises.bulkPut(data.exercises ?? [])
    await db.programs.bulkPut(data.programs ?? [])
    await db.workouts.bulkPut(data.workouts ?? [])
    await db.sets.bulkPut(data.sets ?? [])
    await db.meta.bulkPut(data.meta ?? [])
  })
}
