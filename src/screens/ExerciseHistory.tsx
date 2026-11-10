import { useLiveQuery } from 'dexie-react-hooks'
import { db, type SetLog, type Workout } from '../db'
import { cmpPerf, sortWorkoutsDesc } from '../lib/stats'
import { fmtDate, fmtNum, relDate } from '../lib/util'
import { IconDrop, IconTrophy } from '../components/Icons'

/** Histórico completo de um exercício: melhor série e todas as sessões. */
export function ExerciseHistory({ exerciseId }: { exerciseId: string }) {
  const data = useLiveQuery(async () => {
    const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray()
    const ids = [...new Set(sets.map((s) => s.workoutId))]
    const ws = (await db.workouts.bulkGet(ids)).filter((w): w is Workout => !!w).sort(sortWorkoutsDesc)
    let best: SetLog | null = null
    let bestDate = ''
    const sessions = ws.map((w) => {
      const list = sets.filter((s) => s.workoutId === w.id).sort((a, b) => a.order - b.order)
      if (w.status === 'done')
        for (const s of list)
          if (!s.warmup && (!best || cmpPerf(s, best) > 0)) {
            best = s
            bestDate = w.date
          }
      return { w, list }
    })
    return { sessions, best: best as SetLog | null, bestDate }
  }, [exerciseId])

  if (!data) return null
  if (!data.sessions.length) return <p className="muted pad">Nenhuma série anotada ainda.</p>

  return (
    <div className="ex-history">
      {data.best && (
        <div className="record-card">
          <IconTrophy size={22} />
          <div>
            <small>Melhor série</small>
            <b>
              {fmtNum(data.best.weight)} kg × {data.best.reps}
            </b>
            <small className="muted">{relDate(data.bestDate)}</small>
          </div>
        </div>
      )}
      {data.sessions.map(({ w, list }) => (
        <div key={w.id} className="session">
          <div className="session-head">
            <strong>{fmtDate(w.date)}</strong>
            <span className="muted">
              Treino {w.dayLabel}
              {w.status === 'active' ? ' · em andamento' : ''}
            </span>
          </div>
          <div className="session-sets">
            {list.map((s) => (
              <span key={s.id} className={`set-pill${s.warmup ? ' warm' : ''}${s === data.best ? ' best' : ''}`}>
                {s.warmup && <small>Aq </small>}
                {fmtNum(s.weight)}×{s.reps}
                {s.drops.map((d, i) => (
                  <small key={i} className="pill-drop">
                    <IconDrop size={10} />
                    {fmtNum(d.weight)}×{d.reps}
                  </small>
                ))}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
