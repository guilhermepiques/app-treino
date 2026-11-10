import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, type SetLog, type Workout } from '../db'
import { muscleLabel } from '../data/library'
import { exportBackup, importBackup } from '../lib/backup'
import { sortWorkoutsDesc } from '../lib/stats'
import { dayOfMonth, fmtMonth, isoFromTs, relDate, weekday } from '../lib/util'
import { IconChevron } from '../components/Icons'
import { TopBar, toast } from '../components/ui'
import { WorkoutView } from './WorkoutView'

export function HistoricoTab() {
  const [workoutId, setWorkoutId] = useState<string | null>(null)

  const data = useLiveQuery(async () => {
    const workouts = (await db.workouts.where('status').equals('done').toArray()).sort(sortWorkoutsDesc)
    const sets = await db.sets.toArray()
    return { workouts, sets }
  })

  if (workoutId)
    return <WorkoutView key={workoutId} workoutId={workoutId} mode="edit" onClose={() => setWorkoutId(null)} />

  if (!data) return null

  return (
    <>
      <TopBar title="Histórico" sub={data.workouts.length ? `${data.workouts.length} treinos finalizados` : undefined} />
      <main className="page">
        <WorkoutList workouts={data.workouts} sets={data.sets} onOpen={setWorkoutId} />
        <BackupCard />
      </main>
    </>
  )
}

function WorkoutList({
  workouts,
  sets,
  onOpen,
}: {
  workouts: Workout[]
  sets: SetLog[]
  onOpen: (id: string) => void
}) {
  if (!workouts.length) return <p className="muted pad center">Seus treinos finalizados aparecem aqui.</p>
  const counts = new Map<string, { sets: number; ex: Set<string> }>()
  for (const s of sets) {
    if (s.warmup) continue
    const c = counts.get(s.workoutId) ?? { sets: 0, ex: new Set() }
    c.sets++
    c.ex.add(s.exerciseId)
    counts.set(s.workoutId, c)
  }
  let month = ''
  return (
    <div className="list">
      {workouts.map((w) => {
        const m = fmtMonth(w.date)
        const header = m !== month ? ((month = m), <div key={m} className="section-label">{m}</div>) : null
        const c = counts.get(w.id)
        return [
          header,
          <button key={w.id} className="card workout-row" onClick={() => onOpen(w.id)}>
            <span className="date-box">
              <b>{dayOfMonth(w.date)}</b>
              <small>{weekday(w.date)}</small>
            </span>
            <span className="grow">
              <strong>
                Treino {w.dayLabel}
                {w.dayName ? ` · ${w.dayName}` : ''}
              </strong>
              {!w.dayName && w.muscles.length > 0 && <small>{w.muscles.map(muscleLabel).join(' · ')}</small>}
              <small className="muted">
                {c ? `${c.ex.size} ${c.ex.size === 1 ? 'exercício' : 'exercícios'} · ${c.sets} séries` : 'sem séries'}
              </small>
            </span>
            <IconChevron size={20} className="chev" />
          </button>,
        ]
      })}
    </div>
  )
}

function BackupCard() {
  const last = useLiveQuery(() => getMeta<number>('lastBackup'))
  const file = useRef<HTMLInputElement>(null)
  return (
    <section className="card backup">
      <strong>Backup</strong>
      <p className="muted small">
        Por enquanto os dados ficam só neste celular. Exporte um backup de vez em quando, e sempre antes de trocar de
        celular. No iPhone, escolha “Salvar em Arquivos”.
      </p>
      <p className="small">
        Último backup: {last ? relDate(isoFromTs(last)) : 'nunca'}
      </p>
      <div className="row gap">
        <button className="btn primary grow" onClick={() => exportBackup().catch(() => toast('Não deu para exportar'))}>
          Exportar
        </button>
        <button className="btn ghost grow" onClick={() => file.current?.click()}>
          Importar
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          if (!confirm('Importar substitui TODOS os dados atuais pelos do backup. Continuar?')) return
          try {
            await importBackup(f)
            toast('Backup importado')
          } catch (err) {
            toast((err as Error).message || 'Arquivo inválido')
          }
        }}
      />
    </section>
  )
}
