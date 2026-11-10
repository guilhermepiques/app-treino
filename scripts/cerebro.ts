// Leva um resumo dos treinos para o segundo cérebro (D:\SecondBrain\01-Eu\Academia).
//
//   npm run cerebro:login          entra na conta: pede e-mail e senha aqui no terminal.
//                                  A senha não fica salva; só a sessão, em ~/.app-treino/cerebro-sessao.json
//   npm run cerebro                baixa os dados da nuvem e escreve as notas
//   npm run cerebro -- --backup arquivo.json   usa um backup do app em vez da nuvem
//   npm run cerebro -- --saida pasta           escreve as notas em outra pasta (teste)
//
// Escreve 3 notas: Academia.md (só o bloco entre os marcadores app-treino), Ficha-Atual.md e Evolucao.md.
// Não faz git: a sincronização do cérebro fica com a skill /cerebro (sync.sh).

import 'fake-indexeddb/auto' // os módulos do app criam o banco (Dexie) ao serem importados
import { createClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { SUPABASE_KEY, SUPABASE_URL } from '../src/config'
import { LIBRARY, MUSCLES, muscleLabel } from '../src/data/library'
import type { Exercise, Muscle, PlanItem, Program, SetLog, Workout } from '../src/db'
import { addDays, buildSessions, monthStats, type Session, type TrainingData } from '../src/lib/analytics'
import { dropText, fmtNum, todayISO } from '../src/lib/util'

const SESSION_FILE = join(homedir(), '.app-treino', 'cerebro-sessao.json')
const VAULT = process.env.CEREBRO_DIR || 'D:\\SecondBrain'
const START = '<!-- app-treino:inicio -->'
const END = '<!-- app-treino:fim -->'

const args = process.argv.slice(2)
const opt = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

// ---------- terminal ----------

function ask(question: string, hidden = false) {
  return new Promise<string>((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let muted = false
    const out = rl as unknown as { _writeToOutput: (s: string) => void }
    out._writeToOutput = (s) => {
      if (!muted) process.stdout.write(s)
      else if (s.includes('\n')) process.stdout.write('\n')
    }
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
    muted = hidden
  })
}

// ---------- nuvem ----------

const client = () =>
  createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

function saveSession(refreshToken: string, email?: string) {
  mkdirSync(dirname(SESSION_FILE), { recursive: true })
  writeFileSync(SESSION_FILE, JSON.stringify({ refreshToken, email, savedAt: new Date().toISOString() }), { mode: 0o600 })
}

async function login() {
  console.log('Entrar na conta do App de Treino (a senha não é mostrada nem guardada).')
  const email = await ask('E-mail: ')
  const password = await ask('Senha: ', true)
  const { data, error } = await client().auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`Não deu para entrar: ${error?.message ?? 'sem sessão'}`)
  saveSession(data.session.refresh_token, email)
  console.log('Pronto. Agora é só rodar: npm run cerebro')
}

interface Row {
  collection: string
  id: string
  data: Record<string, unknown>
}

async function fromCloud(): Promise<Dataset> {
  if (!existsSync(SESSION_FILE)) throw new Error('Ainda não entrou na conta. Rode antes: npm run cerebro:login')
  const saved = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as { refreshToken: string; email?: string }
  const sb = client()
  const { data: auth, error: authError } = await sb.auth.refreshSession({ refresh_token: saved.refreshToken })
  if (authError || !auth.session) throw new Error('A sessão expirou. Rode de novo: npm run cerebro:login')
  saveSession(auth.session.refresh_token, saved.email) // a chave muda a cada uso

  const rows: Row[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('records')
      .select('collection,id,data')
      .eq('deleted', false)
      .order('collection')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...((data ?? []) as Row[]))
    if (!data || data.length < PAGE) break
  }
  const of = <T>(c: string) => rows.filter((r) => r.collection === c).map((r) => r.data as unknown as T)
  const active = rows.find((r) => r.collection === 'settings' && r.id === 'activeProgramId')?.data.value
  return dataset(of<Exercise>('exercises'), of<Program>('programs'), of<Workout>('workouts'), of<SetLog>('sets'), active)
}

function fromBackup(file: string): Dataset {
  const b = JSON.parse(readFileSync(file, 'utf8'))
  if (b?.app !== 'app-treino') throw new Error('Esse arquivo não é um backup do App de Treino.')
  const active = (b.meta ?? []).find((m: { key: string }) => m.key === 'activeProgramId')?.value
  return dataset(b.exercises ?? [], b.programs ?? [], b.workouts ?? [], b.sets ?? [], active)
}

// ---------- dados ----------

interface Dataset {
  exercises: Map<string, Exercise>
  programs: Program[]
  workouts: Workout[]
  sets: SetLog[]
  activeProgramId?: string
}

function dataset(ex: Exercise[], programs: Program[], workouts: Workout[], sets: SetLog[], active: unknown): Dataset {
  // A lista pronta não vai para a nuvem (só os exercícios criados ou editados).
  const exercises = new Map<string, Exercise>(
    LIBRARY.map((e) => [e.id, { ...e, step: e.step ?? 2, custom: false, createdAt: 0 }]),
  )
  for (const e of ex) exercises.set(e.id, e)
  return { exercises, programs, workouts, sets, activeProgramId: typeof active === 'string' ? active : undefined }
}

// ---------- texto ----------

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const weekday = (iso: string) => WEEK[new Date(`${iso}T12:00:00`).getDay()]
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')
const perf = (s: { weight: number; reps: number }) => (s.weight > 0 ? `${fmtNum(s.weight)} kg × ${s.reps}` : `${s.reps} reps`)
const tons = (kg: number) => `${(kg / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t`
const loadNote = (e?: Exercise) => (e?.loadMode === 'halter' ? ' (por halter)' : e?.loadMode === 'barra' ? ' (sem a barra)' : '')
const dayTitle = (w: Workout) => `Treino ${w.dayLabel}${w.dayName ? ` (${w.dayName})` : ''}`

function frontmatter(tipo: string, criado: string, hoje: string, resumo: string) {
  return ['---', `tipo: ${tipo}`, 'area: eu', 'status: ativo', `criado: ${criado}`, `atualizado: ${hoje}`, `resumo: ${resumo}`, '---'].join('\n')
}

const readNote = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null)
const criadoOf = (text: string | null, hoje: string) => text?.match(/^criado: (\d{4}-\d{2}-\d{2})$/m)?.[1] ?? hoje

/** Linhas do "## Histórico" de uma nota (sem o título). */
function historyOf(text: string | null) {
  if (!text) return []
  const m = text.match(/\n## Histórico\n([\s\S]*?)(?=\n## |\n<!--|$)/)
  return m ? m[1].split('\n').filter((l) => l.startsWith('- ')) : []
}

// ---------- Ficha-Atual ----------

function activeProgram(d: Dataset) {
  const list = [...d.programs].sort((a, b) => b.createdAt - a.createdAt)
  return list.find((p) => p.id === d.activeProgramId) ?? list[0] ?? null
}

interface DayRows {
  title: string
  rows: { name: string; spec: string }[]
}

function itemSpec(it: PlanItem) {
  return it.reps ? `${it.sets} × ${it.reps}` : `${it.sets} ${it.sets === 1 ? 'série' : 'séries'}`
}

function fichaNote(d: Dataset, previous: string | null, hoje: string) {
  const p = activeProgram(d)
  const days: DayRows[] = []
  const body: string[] = []
  if (!p) body.push('Nenhuma ficha cadastrada no app.')
  else {
    const letters = p.days.map((x) => x.label).join('')
    body.push(
      `**${p.name}**: ${p.days.length} ${p.days.length === 1 ? 'dia' : 'dias'} (${letters}), feitos em sequência.`,
      'Séries × reps alvo. Biset = os dois exercícios seguidos, sem descanso entre eles.',
    )
    for (const day of p.days) {
      const title = `${day.label}${day.name ? ` · ${day.name}` : ''}`
      const muscles = MUSCLES.filter((m) => day.muscles.includes(m.id)).map((m) => m.label)
      body.push('', `## ${title}`)
      if (muscles.length) body.push(`Grupos: ${muscles.join(', ')}`)
      const rows: DayRows['rows'] = []
      if (!day.blocks.length) body.push('', 'Sem exercícios.')
      else {
        body.push('', '| # | Exercício | Séries × reps | Detalhes |', '|---|---|---|---|')
        day.blocks.forEach((b, bi) =>
          b.items.forEach((it, k) => {
            const ex = d.exercises.get(it.exerciseId)
            const name = (ex?.name ?? 'Exercício removido') + loadNote(ex)
            const n = `${bi + 1}${b.items.length > 1 ? 'ab'[k] ?? '' : ''}`
            const details = [
              b.items.length > 1 && `biset com ${bi + 1}${'ab'[1 - k] ?? ''}`,
              it.drop && dropText(it.drop),
              it.restPause && 'rest-pause',
              it.note && `obs.: ${it.note}`,
            ].filter(Boolean) as string[]
            body.push(`| ${n} | ${cell(name)} | ${itemSpec(it)} | ${cell(details.join(' · '))} |`)
            rows.push({ name, spec: itemSpec(it) })
          }),
        )
      }
      days.push({ title, rows })
    }
  }

  const history = historyOf(previous)
  const change = describeChange(previous, p, days)
  if (!previous) history.push(`- ${hoje}: nota criada a partir do App de Treino`)
  else if (change) history.push(`- ${hoje}: ${change}`)

  const resumo = p
    ? `Ficha de treino ativa: ${p.name} — ${p.days.map((x) => `${x.label} ${x.name ?? ''}`.trim()).join(', ')}.`
    : 'Ficha de treino ativa: nenhuma cadastrada no app.'
  return [
    frontmatter('nota', criadoOf(previous, hoje), hoje, resumo),
    '# Ficha atual',
    '',
    `> Gerada pelo App de Treino em ${hoje} (\`npm run cerebro\` em \`D:\\AppTreino\`). Não editar à mão.`,
    '',
    ...body,
    '',
    '## Histórico',
    ...history,
    '',
    '## Relacionadas',
    '- [[Academia]] · [[Evolucao]]',
    '',
    `<!-- app-treino:ficha=${p?.id ?? ''} nome=${p?.name ?? ''} -->`,
    '',
  ].join('\n')
}

/** Lê os dias e exercícios da versão anterior da nota (gerada por este script). */
function parsePrevious(text: string) {
  const days = new Map<string, Map<string, string>>()
  let cur: Map<string, string> | null = null
  for (const line of text.split('\n')) {
    const h = line.match(/^## (.+)$/)
    if (h) {
      cur = h[1] === 'Histórico' || h[1] === 'Relacionadas' ? null : new Map()
      if (cur) days.set(h[1], cur)
      continue
    }
    const r = cur && line.match(/^\| \d+[ab]? \| (.+?) \| (.+?) \| .*\|$/)
    if (r && cur) cur.set(r[1].replace(/\\\|/g, '|'), r[2])
  }
  return days
}

function describeChange(previous: string | null, p: Program | null, days: DayRows[]) {
  if (!previous) return null
  const oldName = previous.match(/<!-- app-treino:ficha=(\S*) nome=(.*?) -->/)
  if (oldName && p && oldName[1] !== p.id) return `ficha ativa trocou de "${oldName[2]}" para "${p.name}"`
  if (oldName && !p) return `a ficha "${oldName[2]}" saiu do app`
  const before = parsePrevious(previous)
  const parts: string[] = []
  const label = (t: string) => t.split(' · ')[0]
  for (const day of days) {
    const old = [...before.entries()].find(([t]) => label(t) === label(day.title))?.[1]
    if (!old) {
      if (before.size) parts.push(`dia ${label(day.title)} novo`)
      continue
    }
    const now = new Map(day.rows.map((r) => [r.name, r.spec]))
    const added = [...now.keys()].filter((n) => !old.has(n))
    const removed = [...old.keys()].filter((n) => !now.has(n))
    const changed = [...now.entries()].filter(([n, s]) => old.has(n) && old.get(n) !== s)
    const bits = [
      added.length && `entrou ${added.join(', ')}`,
      removed.length && `saiu ${removed.join(', ')}`,
      ...changed.map(([n, s]) => `${n} de ${old.get(n)} para ${s}`),
    ].filter(Boolean)
    if (bits.length) parts.push(`${label(day.title)}: ${bits.join('; ')}`)
  }
  for (const t of before.keys()) if (!days.some((d) => label(d.title) === label(t))) parts.push(`dia ${label(t)} removido`)
  return parts.length ? `ficha alterada (${parts.join(' · ')})` : null
}

// ---------- Evolucao ----------

function evolucaoNote(data: TrainingData, previous: string | null, hoje: string) {
  const months = [...new Set(data.done.map((w) => w.date.slice(0, 7)))].sort().reverse().slice(0, 12)
  const curYm = hoje.slice(0, 7)
  const out: string[] = [
    '## Mês a mês',
    '',
    '| Mês | Treinos | Séries | Volume | Recordes |',
    '|---|---|---|---|---|',
  ]
  for (const ym of months) {
    const s = monthStats(data, ym)
    const label = ym === curYm ? `${monthName(ym)} (até dia ${Number(hoje.slice(8, 10))})` : monthName(ym)
    out.push(`| ${label} | ${s.workouts} | ${s.sets} | ${tons(s.volume)} | ${s.prs} |`)
  }
  if (!months.length) out.push('| — | 0 | 0 | 0 t | 0 |')

  out.push(
    '',
    '## Por exercício',
    '',
    'Início = melhor série do primeiro treino · Recorde = melhor série de todos · Último = melhor série do treino mais recente.',
  )
  const byMuscle = new Map<Muscle | null, [string, Session[]][]>()
  for (const [exId, list] of data.sessionsByEx) {
    const m = data.exercises.get(exId)?.muscle ?? null
    if (!byMuscle.has(m)) byMuscle.set(m, [])
    byMuscle.get(m)!.push([exId, list])
  }
  const order: (Muscle | null)[] = [...MUSCLES.map((m) => m.id), null]
  for (const m of order) {
    const list = byMuscle.get(m)
    if (!list?.length) continue
    out.push('', `### ${muscleLabel(m)}`, '', '| Exercício | Início | Recorde | Último | Treinos |', '|---|---|---|---|---|')
    list.sort((a, b) => (data.exercises.get(a[0])?.name ?? '').localeCompare(data.exercises.get(b[0])?.name ?? '', 'pt-BR'))
    for (const [exId, sessions] of list) {
      const ex = data.exercises.get(exId)
      const first = sessions[0]
      const last = sessions[sessions.length - 1]
      let rec = sessions[0]
      for (const s of sessions) if (s.best.weight > rec.best.weight || (s.best.weight === rec.best.weight && s.best.reps > rec.best.reps)) rec = s
      out.push(
        `| ${cell((ex?.name ?? 'Exercício') + loadNote(ex))} | ${perf(first.best)} (${first.date}) | ${perf(rec.best)} (${rec.date}) | ${perf(last.best)} (${last.date}) | ${sessions.length} |`,
      )
    }
  }
  if (!data.sessionsByEx.size) out.push('', 'Nenhum treino finalizado ainda.')

  const n = data.done.length
  const resumo = `Evolução na academia: treinos por mês e início, recorde e último treino de cada exercício (${n} ${n === 1 ? 'treino registrado' : 'treinos registrados'}).`
  return [
    frontmatter('nota', criadoOf(previous, hoje), hoje, resumo),
    '# Evolução',
    '',
    `> Gerada pelo App de Treino em ${hoje} (\`npm run cerebro\` em \`D:\\AppTreino\`). Não editar à mão.`,
    '> Só treinos finalizados. Melhor série = maior carga (empate: mais reps); aquecimento e drops não contam.',
    '> Volume = carga × reps de todas as séries, com drops e sem aquecimento.',
    '',
    ...out,
    '',
    '## Relacionadas',
    '- [[Academia]] · [[Ficha-Atual]]',
    '',
  ].join('\n')
}

// ---------- Academia (índice) ----------

function resumoBlock(data: TrainingData, hoje: string) {
  const lines = [`## Resumo do treino (gerado em ${hoje})`, '']
  const last = data.done[data.done.length - 1]
  if (!last) return [...lines, '- Nenhum treino finalizado no app ainda.'].join('\n')
  const curYm = hoje.slice(0, 7)
  const prevYm = (() => {
    const [y, m] = curYm.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  })()
  const cur = monthStats(data, curYm)
  const prev = monthStats(data, prevYm)
  const from = addDays(hoje, -27)
  const recent = data.done.filter((w) => w.date >= from && w.date <= hoje).length
  // Um por exercício: o recorde mais recente, se foi batido nos últimos 30 dias.
  const prs: string[] = []
  const since = addDays(hoje, -30)
  for (const [exId, list] of data.sessionsByEx) {
    const s = list.filter((x) => x.pr && x.date >= since).pop()
    if (s) prs.push(`${data.exercises.get(exId)?.name ?? 'Exercício'} ${perf(s.best)} (${s.date})`)
  }
  lines.push(
    `- Último treino: ${last.date} (${weekday(last.date)}) · ${dayTitle(last)}`,
    `- ${monthName(curYm)} até o dia ${Number(hoje.slice(8, 10))}: ${cur.workouts} ${cur.workouts === 1 ? 'treino' : 'treinos'} · ${monthName(prevYm)}: ${prev.workouts}`,
    `- Últimas 4 semanas: ${recent} ${recent === 1 ? 'treino' : 'treinos'} (média de ${fmtNum(Math.round((recent / 4) * 10) / 10)} por semana)`,
    `- Treinos registrados: ${data.done.length}, desde ${data.done[0].date}`,
    `- Recordes nos últimos 30 dias: ${prs.length ? prs.join('; ') : 'nenhum'}`,
  )
  return lines.join('\n')
}

function academiaNote(data: TrainingData, previous: string | null, hoje: string) {
  const block = `${START}\n${resumoBlock(data, hoje)}\n${END}`
  if (previous && previous.includes(START) && previous.includes(END)) {
    const start = previous.indexOf(START)
    const end = previous.indexOf(END) + END.length
    return (previous.slice(0, start) + block + previous.slice(end)).replace(/^atualizado: .*$/m, `atualizado: ${hoje}`)
  }
  if (previous) throw new Error('Academia.md existe mas não tem os marcadores do app. Nada foi alterado nela.')
  return [
    frontmatter(
      'indice',
      hoje,
      hoje,
      'Academia: ficha atual, frequência e evolução das cargas (dados do App de Treino). Abra para saber como está o treino.',
    ),
    '# Academia',
    '',
    '## Para que serve',
    'Contexto de treino do Guilherme: a ficha que ele segue na academia, com que frequência treina e como as cargas evoluem.',
    '',
    '## Como esta pasta é organizada',
    '- [[Ficha-Atual]]: a ficha ativa no app (dias, exercícios, séries e reps alvo)',
    '- [[Evolucao]]: treinos mês a mês e início, recorde e último treino de cada exercício',
    '- O resumo abaixo e as duas notas são gerados pelo App de Treino (`npm run cerebro` em `D:\\AppTreino`). Não editar à mão: a próxima atualização sobrescreve. Para atualizar, peça "atualiza a academia no cérebro".',
    '- Dieta: ainda não tem nota.',
    '',
    block,
    '',
    '## Relacionadas',
    '- [[Eu]]',
    '',
  ].join('\n')
}

// ---------- principal ----------

async function main() {
  if (args.includes('--login')) return login()
  const backup = opt('--backup')
  const d = backup ? fromBackup(backup) : await fromCloud()
  const hoje = todayISO()
  const data: TrainingData = { ...buildSessions(d.workouts, d.sets), exercises: d.exercises }
  const dir = opt('--saida') ?? join(VAULT, '01-Eu', 'Academia')
  mkdirSync(dir, { recursive: true })

  const files: [string, (prev: string | null) => string][] = [
    ['Academia.md', (prev) => academiaNote(data, prev, hoje)],
    ['Ficha-Atual.md', (prev) => fichaNote(d, prev, hoje)],
    ['Evolucao.md', (prev) => evolucaoNote(data, prev, hoje)],
  ]
  for (const [name, make] of files) {
    const file = join(dir, name)
    const prev = readNote(file)
    const next = make(prev)
    if (next === prev) console.log(`  = ${name} (sem mudança)`)
    else {
      writeFileSync(file, next)
      console.log(`  ✓ ${name}${prev ? ' atualizada' : ' criada'}`)
    }
  }
  console.log(`Notas em ${dir} · ${data.done.length} treinos finalizados · fonte: ${backup ? 'backup' : 'nuvem'}`)
}

main().catch((e) => {
  console.error(`Erro: ${(e as Error).message ?? e}`)
  process.exit(1)
})
