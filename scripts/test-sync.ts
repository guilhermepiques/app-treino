// Testa o motor de sincronização com um banco falso no Node e uma "nuvem" em memória
// que imita as regras do Supabase (vence o updated_at mais novo). Rodar: npm run test:sync
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { db, seedLibrary, setMeta } from '../src/db'
import { pendingCount, pullChanges, pushChanges, wipeLocal, type RemoteApi, type RemoteRow } from '../src/lib/syncEngine'

const server = new Map<string, RemoteRow & { server_at: string }>()
let clock = Date.parse('2026-01-01T00:00:00Z')
const api: RemoteApi = {
  async upsert(rows) {
    const keys = new Set<string>()
    for (const r of rows) {
      const k = `${r.collection}:${r.id}`
      assert.ok(!keys.has(k), `linha repetida no mesmo envio: ${k}`)
      keys.add(k)
      const old = server.get(k)
      if (old && r.updated_at < old.updated_at) continue // gatilho: versão velha não sobrescreve
      server.set(k, { ...r, server_at: new Date((clock += 10)).toISOString() })
    }
  },
  async fetchSince(since, from, size) {
    return [...server.values()]
      .filter((r) => r.server_at > since)
      .sort((a, b) => (a.server_at < b.server_at ? -1 : 1))
      .slice(from, from + size)
      .map((r) => structuredClone(r))
  },
  async count() {
    return server.size
  },
}
const U = 'user-1'
const tick = () => new Promise((r) => setTimeout(r, 30))
let step = 0
const ok = (msg: string) => console.log(`  ✓ ${++step}. ${msg}`)

await seedLibrary()
assert.equal(await pendingCount(), 0)
ok('lista pronta não fica pendente')

await db.programs.add({ id: 'p1', name: 'Ficha AB', createdAt: 1, days: [] })
await setMeta('activeProgramId', 'p1')
await db.workouts.add({
  id: 'w1', programId: 'p1', dayId: 'd1', dayLabel: 'A', muscles: [], date: '2026-11-09',
  startedAt: 1, status: 'done', blocks: [],
})
for (let i = 0; i < 3; i++)
  await db.sets.add({
    id: `s${i}`, workoutId: 'w1', exerciseId: 'supino-reto-barra', itemId: 'i1', order: i,
    weight: 40, reps: 10 - i, warmup: false, drops: [], createdAt: 1,
  })
await tick()
assert.equal(await pendingCount(), 6)
ok('treino novo fica pendente (ficha, ficha ativa, treino e 3 séries)')

await pushChanges(api, U)
assert.equal(server.size, 6)
assert.equal(await pendingCount(), 0)
ok('envio manda tudo e limpa o pendente')

await db.sets.update('s0', { weight: 42 })
await db.exercises.update('supino-reto-barra', { step: 2.5 })
await tick()
assert.equal(await pendingCount(), 2)
await pushChanges(api, U)
assert.equal(server.get('sets:s0')!.data.weight, 42)
assert.equal(server.get('exercises:supino-reto-barra')!.data.step, 2.5)
ok('edição de série e ajuste de exercício vão para a nuvem')

await db.sets.delete('s2')
await tick()
assert.equal(await db.tombstones.count(), 1)
await pushChanges(api, U)
assert.equal(server.get('sets:s2')!.deleted, true)
assert.equal(await db.tombstones.count(), 0)
ok('exclusão vira "deleted" na nuvem')

await pullChanges(api, U)
assert.equal(await pendingCount(), 0)
ok('receber os próprios envios não cria pendência')

// ---- celular novo ----
await wipeLocal(seedLibrary)
assert.equal(await db.workouts.count(), 0)
await pullChanges(api, U)
assert.equal(await db.workouts.count(), 1)
assert.deepEqual((await db.sets.orderBy('id').toArray()).map((s) => s.id), ['s0', 's1'])
assert.equal((await db.sets.get('s0'))!.weight, 42)
assert.equal((await db.exercises.get('supino-reto-barra'))!.step, 2.5)
assert.equal((await db.meta.get('activeProgramId'))!.value, 'p1')
assert.equal(await pendingCount(), 0)
ok('celular novo recebe tudo (sem a série apagada, com ajustes e ficha ativa)')

// ---- conflitos ----
const w1 = server.get('workouts:w1')!
await api.upsert([{ ...w1, data: { ...w1.data, dayName: 'Do outro celular' }, updated_at: w1.updated_at + 5 }])
await pullChanges(api, U)
assert.equal((await db.workouts.get('w1'))!.dayName, 'Do outro celular')
ok('versão mais nova da nuvem substitui a daqui')

await db.workouts.update('w1', { dayName: 'Editado aqui depois' })
await tick()
await pushChanges(api, U)
assert.equal(server.get('workouts:w1')!.data.dayName, 'Editado aqui depois')
ok('edição mais nova daqui substitui a da nuvem')

const s1 = server.get('sets:s1')!
await api.upsert([{ ...s1, data: { ...s1.data, reps: 99 }, updated_at: s1.updated_at - 5000 }])
assert.notEqual(server.get('sets:s1')!.data.reps, 99)
ok('versão velha não sobrescreve a nuvem')

const before = server.get('sets:s1')!.updated_at
await db.sets.delete('s1')
await tick()
await api.upsert([{ ...server.get('sets:s1')!, data: { reps: 77 }, updated_at: before + 1 }])
const tomb = await db.tombstones.get('sets:s1')
assert.ok(tomb && tomb.updatedAt > before + 1)
await pullChanges(api, U)
assert.equal(await db.sets.get('s1'), undefined)
await pushChanges(api, U)
assert.equal(server.get('sets:s1')!.deleted, true)
ok('apagar aqui depois de uma edição antiga da nuvem: continua apagado')

await db.workouts.update('w1', { dayName: 'A' })
await tick()
await db.workouts.update('w1', { dayName: 'B' })
await tick()
await pushChanges(api, U)
assert.equal(server.get('workouts:w1')!.data.dayName, 'B')
assert.equal(await pendingCount(), 0)
ok('várias edições seguidas: vai a última')

console.log(`\nSincronização: ${step} verificações passaram.`)
process.exit(0)
