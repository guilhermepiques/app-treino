import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Exercise, type ProgramDay } from '../db'
import { muscleLabel } from '../data/library'
import { startWorkout, suggestNextDay, useActiveProgram, useActiveWorkout, useExercises } from '../lib/actions'
import { sortWorkoutsDesc } from '../lib/stats'
import { fmtDate, relDate, todayISO } from '../lib/util'
import { IconChevron, IconDumbbell } from '../components/Icons'
import { TopBar } from '../components/ui'
import { WorkoutView } from './WorkoutView'

export function TreinarTab({ goFicha }: { goFicha: () => void }) {
  const active = useActiveWorkout()
  if (active === undefined) return null
  if (active) return <WorkoutView key={active.id} workoutId={active.id} mode="live" />
  return <StartView goFicha={goFicha} />
}

function StartView({ goFicha }: { goFicha: () => void }) {
  const data = useActiveProgram()
  const exercises = useExercises()
  const [date, setDate] = useState(todayISO())
  const programId = data?.program?.id
  const lastDone = useLiveQuery(async () => {
    if (!programId) return null
    const ws = await db.workouts.where('programId').equals(programId).filter((w) => w.status === 'done').toArray()
    return ws.sort(sortWorkoutsDesc)[0] ?? null
  }, [programId])

  if (!data || !exercises || lastDone === undefined) return null
  const program = data.program
  const hasExercises = program?.days.some((d) => d.blocks.length)

  if (!program || !hasExercises) {
    return (
      <>
        <TopBar title="Treinar" />
        <main className="page empty">
          <IconDumbbell size={48} className="empty-icon" />
          <p className="lead">Monte sua ficha primeiro</p>
          <p className="muted">Escolha a divisão, os grupos musculares e os exercícios de cada dia.</p>
          <button className="btn primary big" onClick={goFicha}>
            Ir para a Ficha
          </button>
        </main>
      </>
    )
  }

  const next = suggestNextDay(program, lastDone ?? undefined)!
  const others = program.days.filter((d) => d.id !== next.id)
  const start = (day: ProgramDay) => startWorkout(program, day, date)

  return (
    <>
      <TopBar title="Treinar" sub={program.name} />
      <main className="page">
        <section className="card next-card">
          <div className="eyebrow">{lastDone ? 'Próximo da sequência' : 'Primeiro treino'}</div>
          <DaySummary day={next} exercises={exercises} big />
          <button className="btn primary block big" onClick={() => start(next)}>
            Começar treino {next.label}
          </button>
        </section>

        <label className="date-row">
          <span>Data do treino</span>
          <span className="date-value">
            {date === todayISO() ? 'Hoje' : fmtDate(date)}
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Data do treino"
            />
          </span>
        </label>

        {others.length > 0 && <div className="section-label">Outro dia</div>}
        {others.map((d) => (
          <button key={d.id} className="card day-card" onClick={() => start(d)}>
            <DaySummary day={d} exercises={exercises} />
            <IconChevron size={20} className="chev" />
          </button>
        ))}

        {lastDone && (
          <p className="muted small center">
            Último treino: {lastDone.dayLabel} · {relDate(lastDone.date)}
          </p>
        )}
      </main>
    </>
  )
}

function DaySummary({ day, exercises, big }: { day: ProgramDay; exercises: Map<string, Exercise>; big?: boolean }) {
  const items = day.blocks.flatMap((b) => b.items)
  return (
    <span className={`day-summary${big ? ' big' : ''}`}>
      <span className="day-letter">{day.label}</span>
      <span className="day-info">
        <strong>{day.name || day.muscles.map(muscleLabel).join(', ') || `Dia ${day.label}`}</strong>
        {day.name && day.muscles.length > 0 && <small>{day.muscles.map(muscleLabel).join(' · ')}</small>}
        <small className="muted">
          {items.length
            ? big
              ? items.map((it) => exercises.get(it.exerciseId)?.name).join(' · ')
              : `${items.length} ${items.length === 1 ? 'exercício' : 'exercícios'}`
            : 'Sem exercícios'}
        </small>
      </span>
    </span>
  )
}

