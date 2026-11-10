// Motor da sincronização (sem tela e sem Supabase direto, para dar para testar).
//
// - Envio: tudo que está marcado como pendente (dirty = 1) + exclusões (tombstones) vai para a nuvem.
//   Depois, o pendente só é limpo se o registro não mudou de novo enquanto enviava.
// - Recebimento: busca o que chegou na nuvem desde a última vez (server_at), com 3 s de folga.
// - Conflito: vence o updatedAt mais recente (aqui e na nuvem, pelo gatilho em supabase/schema.sql).

import {
  db,
  getMeta,
  setLocalMeta,
  systemWrite,
  SYNCED_META,
  SYNCED_TABLES,
  type Collection,
} from '../db'

export interface RemoteRow {
  user_id?: string
  collection: Collection
  id: string
  data: Record<string, unknown>
  updated_at: number
  deleted: boolean
  server_at?: string
}

/** O que o motor precisa da nuvem. */
export interface RemoteApi {
  upsert(rows: RemoteRow[]): Promise<void>
  /** Linhas com server_at > since, em ordem de server_at, paginadas. */
  fetchSince(since: string, from: number, size: number): Promise<RemoteRow[]>
  /** Quantos registros a conta tem na nuvem. */
  count(): Promise<number>
}

const PAGE = 1000
const CHUNK = 500
const ALL_TABLES = [...SYNCED_TABLES, 'meta', 'tombstones']
const pulledKey = (userId: string) => `sync:pulledAt:${userId}`

type Row = Record<string, unknown> & { updatedAt?: number; dirty?: number }

export async function pendingCount() {
  let n = await db.tombstones.count()
  for (const t of SYNCED_TABLES) n += await db.table(t).where('dirty').equals(1).count()
  for (const k of SYNCED_META) if ((await db.meta.get(k))?.dirty) n++
  return n
}

export async function pushChanges(api: RemoteApi, userId: string) {
  const rows = new Map<string, RemoteRow>()
  const sent: { table: string; key: string; updatedAt?: number }[] = []
  const add = (r: RemoteRow) => {
    const k = `${r.collection}:${r.id}`
    const prev = rows.get(k)
    if (!prev || prev.updated_at <= r.updated_at) rows.set(k, r)
  }

  for (const table of SYNCED_TABLES) {
    const list = (await db.table(table).where('dirty').equals(1).toArray()) as Row[]
    for (const r of list) {
      const { dirty: _, ...data } = r
      const id = String(r.id)
      add({ user_id: userId, collection: table, id, data, updated_at: r.updatedAt ?? Date.now(), deleted: false })
      sent.push({ table, key: id, updatedAt: r.updatedAt })
    }
  }
  for (const key of SYNCED_META) {
    const m = await db.meta.get(key)
    if (!m?.dirty) continue
    add({ user_id: userId, collection: 'settings', id: key, data: { value: m.value }, updated_at: m.updatedAt ?? Date.now(), deleted: false })
    sent.push({ table: 'meta', key, updatedAt: m.updatedAt })
  }
  const tombs = await db.tombstones.toArray()
  for (const t of tombs)
    add({ user_id: userId, collection: t.collection, id: t.id, data: {}, updated_at: t.updatedAt, deleted: true })

  const all = [...rows.values()]
  for (let i = 0; i < all.length; i += CHUNK) await api.upsert(all.slice(i, i + CHUNK))

  await systemWrite(ALL_TABLES, async () => {
    for (const s of sent) {
      const cur = (await db.table(s.table).get(s.key)) as Row | undefined
      if (cur && cur.updatedAt === s.updatedAt) await db.table(s.table).update(s.key, { dirty: 0 })
    }
    for (const t of tombs) {
      const cur = await db.tombstones.get(t.key)
      if (cur && cur.updatedAt === t.updatedAt) await db.tombstones.delete(t.key)
    }
  })
  return all.length
}

export async function applyRemote(rows: RemoteRow[]) {
  await systemWrite(ALL_TABLES, async () => {
    for (const r of rows) {
      if (r.collection === 'settings') {
        if (!SYNCED_META.includes(r.id)) continue
        const cur = await db.meta.get(r.id)
        if (cur && (cur.updatedAt ?? 0) >= r.updated_at) continue
        await db.meta.put({ key: r.id, value: r.deleted ? null : r.data.value, updatedAt: r.updated_at, dirty: 0 })
        continue
      }
      if (!(SYNCED_TABLES as readonly string[]).includes(r.collection)) continue
      // Apagado aqui depois da versão da nuvem: a exclusão vence (e ainda vai ser enviada).
      const tomb = await db.tombstones.get(`${r.collection}:${r.id}`)
      if (tomb) {
        if (tomb.updatedAt >= r.updated_at) continue
        await db.tombstones.delete(tomb.key)
      }
      const table = db.table(r.collection)
      const cur = (await table.get(r.id)) as Row | undefined
      if (cur && (cur.updatedAt ?? 0) >= r.updated_at) continue
      if (r.deleted) {
        if (cur) await table.delete(r.id)
      } else {
        await table.put({ ...r.data, updatedAt: r.updated_at, dirty: 0 })
      }
    }
  })
}

export async function pullChanges(api: RemoteApi, userId: string) {
  const since = (await getMeta<string>(pulledKey(userId))) ?? '1970-01-01T00:00:00.000Z'
  const from = new Date(new Date(since).getTime() - 3000).toISOString()
  let latest = since
  let received = 0
  for (let page = 0; ; page += PAGE) {
    const rows = await api.fetchSince(from, page, PAGE)
    if (rows.length) {
      await applyRemote(rows)
      received += rows.length
      const last = rows[rows.length - 1].server_at
      if (last && new Date(last) > new Date(latest)) latest = last
    }
    if (rows.length < PAGE) break
  }
  await setLocalMeta(pulledKey(userId), latest)
  return received
}

/** Apaga tudo deste aparelho (ao sair da conta ou ao usar só os dados da conta). */
export async function wipeLocal(reseed: () => Promise<void>) {
  await systemWrite(ALL_TABLES, async () => {
    for (const t of ALL_TABLES) await db.table(t).clear()
  })
  await reseed()
}
