import { useMemo, useState } from 'react'
import type { Exercise, LoadMode, Muscle } from '../db'
import { LOAD_MODES, MUSCLES, loadShort, muscleLabel } from '../data/library'
import { createExercise, updateExercise, useExercises } from '../lib/actions'
import { fmtNum, normalize } from '../lib/util'
import { IconPlus, IconSearch } from './Icons'
import { Chip, Sheet } from './ui'

export function ExercisePicker({
  open,
  onClose,
  onPick,
  prefer = [],
  title = 'Adicionar exercício',
}: {
  open: boolean
  onClose: () => void
  onPick: (exerciseId: string) => void
  prefer?: Muscle[]
  title?: string
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} tall>
      {open && <PickerBody onPick={onPick} prefer={prefer} />}
    </Sheet>
  )
}

function PickerBody({ onPick, prefer }: { onPick: (id: string) => void; prefer: Muscle[] }) {
  const exercises = useExercises()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Muscle[]>(prefer)
  const [creating, setCreating] = useState(false)

  const list = useMemo(() => {
    if (!exercises) return []
    const nq = normalize(q)
    return [...exercises.values()]
      .filter((e) => (nq ? normalize(e.name).includes(nq) : !filter.length || (e.muscle && filter.includes(e.muscle))))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [exercises, q, filter])

  const groups = useMemo(() => {
    const order = [...MUSCLES.map((m) => m.id), null] as (Muscle | null)[]
    return order
      .map((m) => ({ m, items: list.filter((e) => e.muscle === m) }))
      .filter((g) => g.items.length)
  }, [list])

  const exact = exercises && [...exercises.values()].some((e) => normalize(e.name) === normalize(q))

  if (creating) {
    return (
      <NewExerciseForm
        initialName={q}
        initialMuscle={filter[0] ?? prefer[0] ?? null}
        onCancel={() => setCreating(false)}
        onCreated={onPick}
      />
    )
  }

  return (
    <div className="picker">
      <label className="search">
        <IconSearch size={18} />
        <input
          type="search"
          placeholder="Buscar ou digitar um novo"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          enterKeyHint="search"
        />
      </label>
      {!q && (
        <div className="chips scroll-x">
          <Chip active={!filter.length} onClick={() => setFilter([])}>
            Todos
          </Chip>
          {MUSCLES.map((m) => (
            <Chip
              key={m.id}
              active={filter.includes(m.id)}
              onClick={() =>
                setFilter((f) => (f.includes(m.id) ? f.filter((x) => x !== m.id) : [...f, m.id]))
              }
            >
              {m.label}
            </Chip>
          ))}
        </div>
      )}

      {q.trim() && !exact && (
        <button className="create-row" onClick={() => setCreating(true)}>
          <IconPlus size={18} /> Criar “{q.trim()}”
        </button>
      )}

      {groups.map((g) => (
        <div key={g.m ?? 'outro'} className="picker-group">
          <div className="section-label">{muscleLabel(g.m)}</div>
          {g.items.map((e) => (
            <button key={e.id} className="picker-row" onClick={() => onPick(e.id)}>
              <span>{e.name}</span>
              <small>{loadShort(e.loadMode)}</small>
            </button>
          ))}
        </div>
      ))}
      {!groups.length && !q && <p className="muted pad">Nenhum exercício nesse filtro.</p>}
      {!groups.length && q && <p className="muted pad">Nada encontrado. Use “Criar” acima.</p>}
    </div>
  )
}

function NewExerciseForm({
  initialName,
  initialMuscle,
  onCancel,
  onCreated,
}: {
  initialName: string
  initialMuscle: Muscle | null
  onCancel: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState(initialName.trim())
  const [muscle, setMuscle] = useState<Muscle | null>(initialMuscle)
  const [loadMode, setLoadMode] = useState<LoadMode>('total')

  return (
    <div className="form">
      <label className="field">
        <span>Nome</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
      </label>
      <div className="field">
        <span>Grupo muscular</span>
        <div className="chips wrap">
          {MUSCLES.map((m) => (
            <Chip key={m.id} active={muscle === m.id} onClick={() => setMuscle(m.id)}>
              {m.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Como anota a carga</span>
        <div className="chips wrap">
          {LOAD_MODES.map((m) => (
            <Chip key={m.id} active={loadMode === m.id} onClick={() => setLoadMode(m.id)}>
              {m.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="row gap">
        <button className="btn ghost" onClick={onCancel}>
          Voltar
        </button>
        <button
          className="btn primary grow"
          disabled={!name.trim()}
          onClick={async () => onCreated(await createExercise({ name, muscle, loadMode }))}
        >
          Criar e adicionar
        </button>
      </div>
    </div>
  )
}

const STEPS = [0.5, 1, 2, 2.5, 5, 10]

/** Ajustes de um exercício: nome, grupo, tipo de carga e passo do botão +/−. Vale em todos os treinos. */
export function ExerciseSettings({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  return (
    <Sheet open={!!exercise} onClose={onClose} title="Ajustes do exercício">
      {exercise && <SettingsBody ex={exercise} />}
    </Sheet>
  )
}

function SettingsBody({ ex }: { ex: Exercise }) {
  const [name, setName] = useState(ex.name)
  return (
    <div className="form">
      <label className="field">
        <span>Nome</span>
        <input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== ex.name && updateExercise(ex.id, { name: name.trim() })}
        />
      </label>
      <div className="field">
        <span>Grupo muscular</span>
        <div className="chips wrap">
          {MUSCLES.map((m) => (
            <Chip key={m.id} active={ex.muscle === m.id} onClick={() => updateExercise(ex.id, { muscle: m.id })}>
              {m.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Como anota a carga</span>
        <div className="chips wrap">
          {LOAD_MODES.map((m) => (
            <Chip key={m.id} active={ex.loadMode === m.id} onClick={() => updateExercise(ex.id, { loadMode: m.id })}>
              {m.label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Botão +/− muda a carga em</span>
        <div className="chips wrap">
          {STEPS.map((s) => (
            <Chip key={s} active={ex.step === s} onClick={() => updateExercise(ex.id, { step: s })}>
              {fmtNum(s)} kg
            </Chip>
          ))}
        </div>
      </div>
      <p className="muted small">Esses ajustes valem para esse exercício em todas as fichas e treinos.</p>
    </div>
  )
}
