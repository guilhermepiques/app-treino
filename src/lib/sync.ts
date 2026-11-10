// Login (Supabase Auth, e-mail e senha) e sincronização com a nuvem.
// O motor (envio/recebimento) está em syncEngine.ts; aqui ficam a conta, o estado para a tela
// e quando sincronizar (ao abrir, ao voltar para o app, ao voltar a internet e logo após mudanças).

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { SUPABASE_KEY, SUPABASE_URL } from '../config'
import { db, getMeta, seedLibrary, setLocalChangeListener, setLocalMeta } from '../db'
import { pendingCount, pullChanges, pushChanges, wipeLocal, type RemoteApi, type RemoteRow } from './syncEngine'

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'app-treino-auth' },
      })
    : null

function supabaseApi(client: SupabaseClient): RemoteApi {
  return {
    async upsert(rows) {
      const { error } = await client.from('records').upsert(rows, { onConflict: 'user_id,collection,id' })
      if (error) throw error
    },
    async fetchSince(since, from, size) {
      const { data, error } = await client
        .from('records')
        .select('collection,id,data,updated_at,deleted,server_at')
        .gt('server_at', since)
        .order('server_at')
        .order('collection')
        .order('id')
        .range(from, from + size - 1)
      if (error) throw error
      return (data ?? []) as RemoteRow[]
    },
    async count() {
      const { count, error } = await client.from('records').select('id', { count: 'exact', head: true })
      if (error) throw error
      return count ?? 0
    },
  }
}

// ---------- estado para a tela ----------

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncState {
  /** Existe projeto configurado. */
  enabled: boolean
  /** Já sabemos se há alguém logado. */
  ready: boolean
  user: User | null
  /** Os dados deste aparelho já pertencem à conta logada. */
  linked: boolean
  /** Pessoa escolheu usar sem conta. */
  skipped: boolean
  /** Abriu pelo link de "esqueci a senha". */
  recovery: boolean
  status: SyncStatus
  lastSync: number | null
  error: string | null
}

const readSkip = () => {
  try {
    return localStorage.getItem('semConta') === '1'
  } catch {
    return false
  }
}

let state: SyncState = {
  enabled: !!supabase,
  ready: !supabase,
  user: null,
  linked: false,
  skipped: readSkip(),
  recovery: false,
  status: 'idle',
  lastSync: null,
  error: null,
}
const listeners = new Set<() => void>()
const patch = (p: Partial<SyncState>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}

export const useSync = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => state,
  )

export function skipLogin() {
  try {
    localStorage.setItem('semConta', '1')
  } catch {
    /* sem storage */
  }
  patch({ skipped: true })
}

export function askLogin() {
  try {
    localStorage.removeItem('semConta')
  } catch {
    /* sem storage */
  }
  patch({ skipped: false })
}

// ---------- quando sincronizar ----------

let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let again = false

export function scheduleSync(ms = 1500) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), ms)
}

export async function syncNow(): Promise<void> {
  if (!supabase || !state.user || !state.linked) return
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    do {
      again = false
      await syncOnce()
    } while (again)
  })().finally(() => (running = null))
  return running
}

async function syncOnce() {
  const user = state.user
  if (!supabase || !user) return
  if (!navigator.onLine) return patch({ status: 'offline' })
  patch({ status: 'syncing', error: null })
  try {
    const api = supabaseApi(supabase)
    await pushChanges(api, user.id)
    await pullChanges(api, user.id)
    patch({ status: 'idle', lastSync: Date.now() })
  } catch (e) {
    patch({ status: navigator.onLine ? 'error' : 'offline', error: errorText(e) })
  }
}

export function initSync() {
  if (!supabase) return
  setLocalChangeListener(() => scheduleSync())
  window.addEventListener('online', () => scheduleSync(0))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  })
  setInterval(() => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  }, 120_000)

  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user ?? null
    if (event === 'PASSWORD_RECOVERY') patch({ recovery: true })
    // Não chamar o Supabase direto aqui dentro (recomendação da biblioteca): agenda.
    setTimeout(async () => {
      const owner = user ? await getMeta<string>('syncUser') : undefined
      const linked = !!user && owner === user.id
      patch({ user, linked, ready: true })
      if (linked && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) scheduleSync(0)
    }, 0)
  })
}

// ---------- conta ----------

export async function signIn(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

/** Cria a conta. Retorna true se precisar confirmar pelo e-mail antes de entrar. */
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase!.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: location.origin },
  })
  if (error) throw error
  return !data.session
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: location.origin + location.pathname,
  })
  if (error) throw error
}

export async function setNewPassword(password: string) {
  const { error } = await supabase!.auth.updateUser({ password })
  if (error) throw error
  patch({ recovery: false })
}

export const endRecovery = () => patch({ recovery: false })

/**
 * Logo depois de entrar: o celular tem treinos que ainda não são de conta nenhuma
 * e a conta também tem dados? Aí a pessoa escolhe entre juntar ou ficar só com os da conta.
 */
export async function needsMergeChoice() {
  const localHas = (await db.programs.count()) + (await db.workouts.count()) > 0
  if (!localHas) return false
  return (await supabaseApi(supabase!).count()) > 0
}

/** Liga os dados deste aparelho à conta logada e sincroniza. */
export async function linkAccount(mode: 'merge' | 'replace') {
  const user = state.user
  if (!user) return
  if (mode === 'replace') await wipeLocal(seedLibrary)
  await setLocalMeta('syncUser', user.id)
  patch({ linked: true })
  await syncNow()
}

/** Quantas alterações ainda não foram para a nuvem (para avisar antes de sair). */
export async function unsyncedBeforeSignOut() {
  await syncNow()
  return pendingCount()
}

/** Sai da conta e apaga os dados deste aparelho (eles continuam na nuvem). */
export async function signOut() {
  await supabase?.auth.signOut({ scope: 'local' })
  await wipeLocal(seedLibrary)
  patch({ user: null, linked: false, status: 'idle', lastSync: null, error: null })
}

export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e)
  if (!navigator.onLine || /fetch|network/i.test(msg)) return 'Sem internet. Tente de novo quando tiver sinal.'
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha errados.'
  if (/already registered|already been registered/i.test(msg)) return 'Esse e-mail já tem conta. Use "Entrar".'
  if (/password should be at least|at least 6/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (/invalid.*email|unable to validate email/i.test(msg)) return 'Esse e-mail não parece válido.'
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Espere alguns minutos e tente de novo.'
  if (/email not confirmed/i.test(msg)) return 'Falta confirmar o e-mail. Abra o link que chegou na sua caixa de entrada.'
  return msg
}
