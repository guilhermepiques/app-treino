import { useMemo, useState } from 'react'
import type { Muscle } from '../db'
import { MUSCLES, muscleLabel } from '../data/library'
import {
  RANGE_DAYS,
  addDays,
  addMonths,
  isBodyweight,
  isoTime,
  metricValue,
  mondayOf,
  monthOf,
  monthStats,
  useTrainingData,
  weekMuscleSets,
  type Metric,
  type Range,
  type Session,
  type TrainingData,
} from '../lib/analytics'
import { fmtDate, fmtMonth, fmtNum, fmtShortDate, relDate, todayISO } from '../lib/util'
import { LineChart, Sparkline, type ChartPoint } from '../components/LineChart'
import { IconBack, IconChevron, IconDown, IconUp } from '../components/Icons'
import { Chip, TopBar } from '../components/ui'
import { ExerciseHistory } from './ExerciseHistory'

const kg = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} kg`
const tons = (v: number) => (v >= 1000 ? `${fmtNum(Math.round(v / 100) / 10)} t` : kg(v))
const compact = (v: number) =>
  v >= 10000 ? `${fmtNum(Math.round(v / 100) / 10)}k` : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })

export function EvolucaoTab() {
  const data = useTrainingData()
  const [exerciseId, setExerciseId] = useState<string | null>(null)

  if (exerciseId) {
    const ex = data?.exercises.get(exerciseId)
    return (
      <>
        <TopBar
          left={
            <button className="icon-btn" onClick={() => setExerciseId(null)} aria-label="Voltar">
              <IconBack />
            </button>
          }
          title={ex?.name ?? 'Exercício'}
          sub={muscleLabel(ex?.muscle)}
        />
        <main className="page">
          <ExerciseEvolution exerciseId={exerciseId} />
        </main>
      </>
    )
  }

  if (!data) return null

  return (
    <>
      <TopBar title="Evolução" />
      {data.done.length ? (
        <main className="page">
          <MonthCard data={data} />
          <WeekCard data={data} />
          <ExerciseList data={data} onOpen={setExerciseId} />
        </main>
      ) : (
        <main className="page empty">
          <p className="lead">Nada para mostrar ainda</p>
          <p className="muted">Finalize seu primeiro treino e a sua evolução aparece aqui.</p>
        </main>
      )}
    </>
  )
}

// ---------- resumo do mês ----------

function MonthCard({ data }: { data: TrainingData }) {
  const current = monthOf(todayISO())
  const [ym, setYm] = useState(current)
  // Mês em andamento: compara com o mesmo pedaço do mês anterior (dia 1 até hoje).
  const today = todayISO()
  const partial = ym === current ? Number(today.slice(8, 10)) : 31
  const now = monthStats(data, ym)
  const before = monthStats(data, addMonths(ym, -1), partial)
  const prevMonth = fmtMonth(`${addMonths(ym, -1)}-01`).split(' ')[0].slice(0, 3)
  const prevName = partial < 31 ? `1–${partial} ${prevMonth}` : prevMonth

  return (
    <section className="card evo-card">
      <div className="evo-head">
        <h2>Resumo do mês</h2>
        <Pager
          label={fmtMonth(`${ym}-01`)}
          onPrev={() => setYm(addMonths(ym, -1))}
          onNext={() => setYm(addMonths(ym, 1))}
          canNext={ym < current}
        />
      </div>
      <div className="tiles">
        <Tile label="Treinos" value={String(now.workouts)} diff={now.workouts - before.workouts} vs={prevName} />
        <Tile label="Séries" value={String(now.sets)} diff={now.sets - before.sets} vs={prevName} />
        <Tile
          label="Volume total"
          value={tons(now.volume)}
          diff={now.volume - before.volume}
          diffText={tons(Math.abs(now.volume - before.volume))}
          vs={prevName}
        />
        <Tile label="Recordes" value={String(now.prs)} diff={now.prs - before.prs} vs={prevName} />
      </div>
    </section>
  )
}

function Tile({
  label,
  value,
  diff,
  diffText,
  vs,
}: {
  label: string
  value: string
  diff: number
  diffText?: string
  vs: string
}) {
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'
  return (
    <div className="tile">
      <small>{label}</small>
      <b>{value}</b>
      <span className={`tile-delta ${dir}`}>
        {dir === 'up' && <IconUp size={13} />}
        {dir === 'down' && <IconDown size={13} />}
        {dir === 'same' ? `igual a ${vs}` : `${diffText ?? fmtNum(Math.abs(diff))} vs ${vs}`}
      </span>
    </div>
  )
}

function Pager({
  label,
  onPrev,
  onNext,
  canNext,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
  canNext: boolean
}) {
  return (
    <div className="pager">
      <button className="icon-btn small" onClick={onPrev} aria-label="Anterior">
        <IconChevron size={18} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <span>{label}</span>
      <button className="icon-btn small" onClick={onNext} disabled={!canNext} aria-label="Próximo">
        <IconChevron size={18} />
      </button>
    </div>
  )
}

// ---------- séries por grupo na semana ----------

function weekLabel(monday: string) {
  const today = mondayOf(todayISO())
  if (monday === today) return 'Esta semana'
  if (monday === addDays(today, -7)) return 'Semana passada'
  const end = addDays(monday, 6)
  const [a, b] = [fmtShortDate(monday), fmtShortDate(end)]
  return a.split(' ')[1] === b.split(' ')[1] ? `${a.split(' ')[0]} a ${b}` : `${a} a ${b}`
}

function WeekCard({ data }: { data: TrainingData }) {
  const current = mondayOf(todayISO())
  // Abre na semana atual; se ela ainda está vazia, mostra a passada.
  const [monday, setMonday] = useState(() => {
    const has = (m: string) => [...weekMuscleSets(data, m).values()].some((n) => n > 0)
    return has(current) ? current : addDays(current, -7)
  })
  const counts = weekMuscleSets(data, monday)
  const rows: { key: string; label: string; n: number }[] = MUSCLES.map((m) => ({
    key: m.id,
    label: m.label,
    n: counts.get(m.id) ?? 0,
  }))
  if (counts.get(null)) rows.push({ key: 'outro', label: 'Outro', n: counts.get(null)! })
  const max = Math.max(1, ...rows.map((r) => r.n))
  const total = rows.reduce((t, r) => t + r.n, 0)

  return (
    <section className="card evo-card">
      <div className="evo-head">
        <h2>Séries por grupo</h2>
        <Pager
          label={weekLabel(monday)}
          onPrev={() => setMonday(addDays(monday, -7))}
          onNext={() => setMonday(addDays(monday, 7))}
          canNext={monday < current}
        />
      </div>
      <p className="muted small">
        {total ? `${total} séries válidas na semana (sem aquecimento)` : 'Nenhuma série nessa semana'}
      </p>
      <div className="bars" role="list">
        {rows.map((r) => (
          <div key={r.key} className={`bar-row${r.n ? '' : ' zero'}`} role="listitem" aria-label={`${r.label}: ${r.n} séries`}>
            <span className="bar-label">{r.label}</span>
            <span className="bar-track">
              {r.n > 0 && <span className="bar-fill" style={{ width: `calc((100% - 36px) * ${r.n / max})` }} />}
              <span className="bar-value">{r.n}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------- lista de exercícios ----------

function ExerciseList({ data, onOpen }: { data: TrainingData; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Muscle | null>(null)
  const items = useMemo(
    () =>
      [...data.sessionsByEx.entries()]
        .map(([id, list]) => {
          const best = list.reduce((b, s) => (s.best.weight > b.best.weight || (s.best.weight === b.best.weight && s.best.reps > b.best.reps) ? s : b))
          const bw = isBodyweight(list)
          return {
            id,
            bw,
            ex: data.exercises.get(id),
            list,
            best: best.best,
            last: list[list.length - 1].date,
            spark: list.slice(-12).map((s) => metricValue(s, 'carga', bw)),
          }
        })
        .sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0)),
    [data],
  )
  const present = MUSCLES.filter((m) => items.some((i) => i.ex?.muscle === m.id))
  const shown = filter ? items.filter((i) => i.ex?.muscle === filter) : items

  return (
    <>
      <div className="section-label">Exercícios</div>
      {present.length > 1 && (
        <div className="chips scroll-x">
          <Chip active={!filter} onClick={() => setFilter(null)}>
            Todos
          </Chip>
          {present.map((m) => (
            <Chip key={m.id} active={filter === m.id} onClick={() => setFilter(m.id)}>
              {m.label}
            </Chip>
          ))}
        </div>
      )}
      <div className="list">
        {shown.map((i) => (
          <button key={i.id} className="card evo-ex" onClick={() => onOpen(i.id)}>
            <span className="grow">
              <strong>{i.ex?.name ?? 'Exercício'}</strong>
              <small>
                {i.list.length} {i.list.length === 1 ? 'treino' : 'treinos'} · último {relDate(i.last)}
              </small>
            </span>
            <Sparkline values={i.spark} />
            <span className="evo-best">
              {i.bw ? (
                <b>
                  {i.best.reps}
                  <small>reps</small>
                </b>
              ) : (
                <>
                  <b>
                    {fmtNum(i.best.weight)}
                    <small>kg</small>
                  </b>
                  <small>× {i.best.reps}</small>
                </>
              )}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

// ---------- evolução de um exercício ----------

const METRICS: { id: Metric; label: string; bw: string }[] = [
  { id: 'carga', label: 'Carga', bw: 'Melhor série' },
  { id: 'forca', label: 'Força', bw: '' },
  { id: 'volume', label: 'Volume', bw: 'Total de reps' },
]

const RANGES: { id: Range; label: string }[] = [
  { id: '3m', label: '3 meses' },
  { id: '6m', label: '6 meses' },
  { id: '1a', label: '1 ano' },
  { id: 'tudo', label: 'Tudo' },
]

const EXPLAIN: Record<Metric, string> = {
  carga: 'A série mais pesada de cada treino.',
  forca: 'Quanto você levantaria 1 vez só, calculado pela melhor série de cada treino.',
  volume: 'Soma de carga × reps de todas as séries do treino (com drops, sem aquecimento).',
}

/** Gráfico + números + histórico de um exercício. Usado na aba Evolução e durante o treino. */
export function ExerciseEvolution({ exerciseId }: { exerciseId: string }) {
  const data = useTrainingData()
  const [metric, setMetric] = useState<Metric>('carga')
  const [range, setRange] = useState<Range>('tudo')
  if (!data) return null

  const all = data.sessionsByEx.get(exerciseId) ?? []
  const bw = isBodyweight(all)
  const days = RANGE_DAYS[range]
  const cutoff = days ? addDays(todayISO(), -days) : ''
  const list = all.filter((s) => s.date >= cutoff)
  const m: Metric = bw && metric === 'forca' ? 'carga' : metric
  const fmtV = (v: number) => (bw ? `${v} reps` : m === 'volume' ? kg(v) : `${fmtNum(v)} kg`)

  const points: ChartPoint[] = list.map((s) => {
    const v = metricValue(s, m, bw)
    return { x: isoTime(s.date), y: v, title: titleOf(s, m, bw, v), sub: subOf(s, m, bw), record: s.pr }
  })
  const first = points[0]
  const last = points[points.length - 1]
  const diff = first && last ? last.y - first.y : 0

  return (
    <>
      {all.length > 0 && (
        <>
          <div className="segmented three" role="tablist">
            {METRICS.filter((x) => !bw || x.bw).map((x) => (
              <button key={x.id} role="tab" aria-selected={m === x.id} onClick={() => setMetric(x.id)}>
                {bw ? x.bw : x.label}
              </button>
            ))}
          </div>
          <div className="chips scroll-x">
            {RANGES.map((r) => (
              <Chip key={r.id} active={range === r.id} onClick={() => setRange(r.id)}>
                {r.label}
              </Chip>
            ))}
          </div>

          <section className="card evo-chart">
            {last ? (
              <>
                <div className="evo-headline">
                  <b>{fmtV(last.y)}</b>
                  {points.length > 1 && (
                    <span className={`tile-delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : 'same'}`}>
                      {diff > 0 && <IconUp size={13} />}
                      {diff < 0 && <IconDown size={13} />}
                      {diff === 0 ? 'igual' : (diff > 0 ? '+' : '−') + fmtV(Math.abs(Math.round(diff * 10) / 10))} desde{' '}
                      {fmtShortDate(list[0].date)}
                    </span>
                  )}
                </div>
                <p className="muted small">{bw ? (m === 'volume' ? 'Total de repetições do treino.' : 'Mais repetições numa série.') : EXPLAIN[m]}</p>
                <LineChart
                  points={points}
                  tick={bw ? fmtNum : m === 'volume' ? compact : fmtNum}
                  label={`Evolução: de ${fmtV(first.y)} em ${fmtShortDate(list[0].date)} para ${fmtV(last.y)} em ${fmtShortDate(list[list.length - 1].date)}`}
                />
                {points.some((p) => p.record) && (
                  <p className="chart-legend">
                    <span className="legend-dot" /> treino com recorde (passou a melhor série anterior)
                  </p>
                )}
              </>
            ) : (
              <p className="muted pad">Nenhum treino nesse período.</p>
            )}
          </section>
        </>
      )}

      <div className="section-label">Treinos</div>
      <ExerciseHistory exerciseId={exerciseId} />
    </>
  )
}

function titleOf(s: Session, m: Metric, bw: boolean, v: number) {
  if (bw) return m === 'volume' ? `${v} reps` : `${s.best.reps} reps`
  if (m === 'carga') return `${fmtNum(s.best.weight)} kg × ${s.best.reps}`
  if (m === 'forca') return `${fmtNum(v)} kg`
  return kg(v)
}

function subOf(s: Session, m: Metric, bw: boolean) {
  const d = fmtDate(s.date)
  if (bw || m === 'carga') return d
  if (m === 'forca') return `${d} · pela série ${fmtNum(s.strengthSet.weight)} × ${s.strengthSet.reps}`
  return `${d} · ${s.sets.length} ${s.sets.length === 1 ? 'série' : 'séries'}`
}
