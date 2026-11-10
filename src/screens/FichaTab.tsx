import { useState } from 'react'
import type { Exercise, PlanBlock, PlanItem, Program, ProgramDay } from '../db'
import { MUSCLES, loadShort, muscleLabel } from '../data/library'
import {
  createProgram,
  deleteProgram,
  findItem,
  joinWithNext,
  moveBlock,
  mutateDay,
  mutateProgram,
  newBlock,
  relabelDays,
  removeItem,
  setActiveProgram,
  splitBlock,
  useActiveProgram,
  useExercises,
} from '../lib/actions'
import { DAY_LETTERS, fmtShortDate, isoFromTs, uid } from '../lib/util'
import { ExercisePicker, ExerciseSettings } from '../components/ExercisePicker'
import {
  IconBack,
  IconChevron,
  IconDown,
  IconDots,
  IconDrop,
  IconLink,
  IconPlus,
  IconUp,
  IconX,
} from '../components/Icons'
import { Chip, InlineText, MenuItem, Sheet, Stepper, TopBar } from '../components/ui'

export function FichaTab() {
  const data = useActiveProgram()
  const exercises = useExercises()
  const [dayId, setDayId] = useState<string | null>(null)
  const [showFichas, setShowFichas] = useState(false)
  const [choosing, setChoosing] = useState(false)

  if (!data || !exercises) return null
  const { program, programs } = data

  if (!program || choosing) {
    return (
      <DivisionChooser
        first={!program}
        onCancel={program ? () => setChoosing(false) : undefined}
        onPick={async (n) => {
          await createProgram(n)
          setChoosing(false)
          setDayId(null)
        }}
      />
    )
  }

  const day = program.days.find((d) => d.id === dayId)
  if (day) {
    return <DayEditor program={program} day={day} exercises={exercises} onBack={() => setDayId(null)} />
  }

  const addDay = () =>
    mutateProgram(program.id, (p) => {
      p.days.push({ id: uid(), label: '', muscles: [], blocks: [] })
      relabelDays(p)
    })

  return (
    <>
      <TopBar
        title={<InlineText value={program.name} placeholder="Nome da ficha" onSave={(v) => mutateProgram(program.id, (p) => (p.name = v || p.name))} />}
        sub={`Ficha atual · ${program.days.length} ${program.days.length === 1 ? 'dia' : 'dias'}`}
        right={
          <button className="btn small ghost" onClick={() => setShowFichas(true)}>
            Fichas
          </button>
        }
      />
      <main className="page">
        {program.days.map((d) => (
          <DayCard key={d.id} day={d} exercises={exercises} onOpen={() => setDayId(d.id)} />
        ))}
        {program.days.length < DAY_LETTERS.length && (
          <button className="btn dashed" onClick={addDay}>
            <IconPlus size={18} /> Adicionar dia {DAY_LETTERS[program.days.length]}
          </button>
        )}
      </main>

      <Sheet open={showFichas} onClose={() => setShowFichas(false)} title="Suas fichas">
        <div className="list">
          {programs.map((p) => (
            <button
              key={p.id}
              className={`list-row${p.id === program.id ? ' current' : ''}`}
              onClick={async () => {
                await setActiveProgram(p.id)
                setShowFichas(false)
                setDayId(null)
              }}
            >
              <span className="grow">
                <strong>{p.name}</strong>
                <small>
                  {p.days.map((d) => d.label).join(' / ')} · criada em {fmtShortDate(isoFromTs(p.createdAt))}
                </small>
              </span>
              {p.id === program.id && <span className="badge">Atual</span>}
            </button>
          ))}
        </div>
        <p className="muted small">
          Trocou de treino? Crie uma ficha nova. As fichas antigas e todo o histórico de cargas continuam salvos.
        </p>
        <button
          className="btn primary block"
          onClick={() => {
            setShowFichas(false)
            setChoosing(true)
          }}
        >
          <IconPlus size={18} /> Nova ficha
        </button>
        <button
          className="btn text danger block"
          onClick={async () => {
            if (confirm(`Apagar a ficha "${program.name}"? Os treinos já feitos continuam no histórico.`)) {
              await deleteProgram(program.id)
              setShowFichas(false)
            }
          }}
        >
          Apagar ficha atual
        </button>
      </Sheet>
    </>
  )
}

function DivisionChooser({
  first,
  onPick,
  onCancel,
}: {
  first: boolean
  onPick: (n: number) => void
  onCancel?: () => void
}) {
  const options = [1, 2, 3, 4, 5, 6, 7]
  return (
    <>
      <TopBar
        left={
          onCancel && (
            <button className="icon-btn" onClick={onCancel} aria-label="Voltar">
              <IconBack />
            </button>
          )
        }
        title={first ? 'Monte sua ficha' : 'Nova ficha'}
      />
      <main className="page">
        <p className="lead">Qual é a sua divisão de treino?</p>
        <p className="muted">Depois você escolhe os grupos musculares e os exercícios de cada dia.</p>
        <div className="division-grid">
          {options.map((n) => (
            <button key={n} className="division-btn" onClick={() => onPick(n)}>
              <span className="division-letters">{DAY_LETTERS.slice(0, n).join('')}</span>
              <small>
                {n} {n === 1 ? 'dia' : 'dias'}
              </small>
            </button>
          ))}
        </div>
      </main>
    </>
  )
}

function DayCard({ day, exercises, onOpen }: { day: ProgramDay; exercises: Map<string, Exercise>; onOpen: () => void }) {
  const items = day.blocks.flatMap((b) => b.items)
  const title = day.name || (day.muscles.length ? day.muscles.map(muscleLabel).join(', ') : 'Toque para montar')
  return (
    <button className="card day-card" onClick={onOpen}>
      <span className="day-letter">{day.label}</span>
      <span className="day-info">
        <strong className={!day.name && !day.muscles.length ? 'muted' : ''}>{title}</strong>
        {day.name && day.muscles.length > 0 && <small>{day.muscles.map(muscleLabel).join(' · ')}</small>}
        <small className="muted">
          {items.length
            ? `${items.length} ${items.length === 1 ? 'exercício' : 'exercícios'}: ${items
                .map((it) => exercises.get(it.exerciseId)?.name)
                .filter(Boolean)
                .join(', ')}`
            : 'Nenhum exercício ainda'}
        </small>
      </span>
      <IconChevron size={20} className="chev" />
    </button>
  )
}

type Picker = { mode: 'add' } | { mode: 'swap'; itemId: string } | null

function DayEditor({
  program,
  day,
  exercises,
  onBack,
}: {
  program: Program
  day: ProgramDay
  exercises: Map<string, Exercise>
  onBack: () => void
}) {
  const [picker, setPicker] = useState<Picker>(null)
  const [menu, setMenu] = useState<{ blockIndex: number; itemId: string } | null>(null)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const md = (fn: (d: ProgramDay) => void) => mutateDay(program.id, day.id, fn)

  const menuBlock = menu ? day.blocks[menu.blockIndex] : undefined
  const menuItem = menu ? findItem(day.blocks, menu.itemId) : undefined
  const menuEx = menuItem ? exercises.get(menuItem.exerciseId) : undefined
  const nextBlock = menu ? day.blocks[menu.blockIndex + 1] : undefined
  const closeMenu = () => setMenu(null)

  return (
    <>
      <TopBar
        left={
          <button className="icon-btn" onClick={onBack} aria-label="Voltar para a ficha">
            <IconBack />
          </button>
        }
        title={`Dia ${day.label}`}
        sub={program.name}
      />
      <main className="page">
        <InlineText
          className="big-input"
          value={day.name ?? ''}
          placeholder="Nome do dia (opcional)"
          onSave={(v) => md((d) => (d.name = v || undefined))}
        />

        <div className="section-label">Grupos musculares</div>
        <div className="chips wrap">
          {MUSCLES.map((m) => (
            <Chip
              key={m.id}
              active={day.muscles.includes(m.id)}
              onClick={() =>
                md((d) => {
                  d.muscles = d.muscles.includes(m.id)
                    ? d.muscles.filter((x) => x !== m.id)
                    : MUSCLES.map((x) => x.id).filter((x) => x === m.id || d.muscles.includes(x))
                })
              }
            >
              {m.label}
            </Chip>
          ))}
        </div>

        <div className="section-label">Exercícios</div>
        {day.blocks.map((b, bi) => (
          <PlanBlockCard
            key={b.id}
            block={b}
            index={bi}
            exercises={exercises}
            onChange={(itemId, fn) =>
              md((d) => {
                const it = findItem(d.blocks, itemId)
                if (it) fn(it)
              })
            }
            onMenu={(itemId) => setMenu({ blockIndex: bi, itemId })}
          />
        ))}
        {!day.blocks.length && <p className="muted pad">Nenhum exercício ainda.</p>}
        <button className="btn dashed" onClick={() => setPicker({ mode: 'add' })}>
          <IconPlus size={18} /> Adicionar exercício
        </button>

        {program.days.length > 1 && (
          <button
            className="btn text danger block"
            onClick={async () => {
              if (!confirm(`Remover o dia ${day.label} da ficha? Os outros dias são renomeados em ordem.`)) return
              onBack()
              await mutateProgram(program.id, (p) => {
                p.days = p.days.filter((d) => d.id !== day.id)
                relabelDays(p)
              })
            }}
          >
            Remover dia {day.label}
          </button>
        )}
      </main>

      <ExercisePicker
        open={!!picker}
        onClose={() => setPicker(null)}
        prefer={day.muscles}
        title={picker?.mode === 'swap' ? 'Trocar exercício' : 'Adicionar exercício'}
        onPick={(exerciseId) => {
          const p = picker
          setPicker(null)
          md((d) => {
            if (p?.mode === 'swap') {
              const it = findItem(d.blocks, p.itemId)
              if (it) it.exerciseId = exerciseId
            } else d.blocks.push(newBlock(exerciseId))
          })
        }}
      />

      <Sheet open={!!menu} onClose={closeMenu} title={menuEx?.name}>
        {menu && menuBlock && (
          <div className="list">
            <MenuItem
              icon={<IconUp size={20} />}
              label="Mover para cima"
              disabled={menu.blockIndex === 0}
              onClick={() => {
                md((d) => moveBlock(d.blocks, menu.blockIndex, -1))
                setMenu({ ...menu, blockIndex: menu.blockIndex - 1 })
              }}
            />
            <MenuItem
              icon={<IconDown size={20} />}
              label="Mover para baixo"
              disabled={menu.blockIndex >= day.blocks.length - 1}
              onClick={() => {
                md((d) => moveBlock(d.blocks, menu.blockIndex, 1))
                setMenu({ ...menu, blockIndex: menu.blockIndex + 1 })
              }}
            />
            {menuBlock.items.length === 1 && nextBlock?.items.length === 1 && (
              <MenuItem
                icon={<IconLink size={20} />}
                label="Fazer biset com o próximo"
                hint={exercises.get(nextBlock.items[0].exerciseId)?.name}
                onClick={() => {
                  md((d) => joinWithNext(d.blocks, menu.blockIndex))
                  closeMenu()
                }}
              />
            )}
            {menuBlock.items.length > 1 && (
              <MenuItem
                icon={<IconLink size={20} />}
                label="Desfazer biset"
                onClick={() => {
                  md((d) => splitBlock(d.blocks, menu.blockIndex))
                  closeMenu()
                }}
              />
            )}
            <MenuItem
              icon={<IconChevron size={20} />}
              label="Trocar exercício"
              onClick={() => {
                setPicker({ mode: 'swap', itemId: menu.itemId })
                closeMenu()
              }}
            />
            <MenuItem
              icon={<IconDots size={20} />}
              label="Ajustes do exercício"
              hint="Tipo de carga e quanto o +/− sobe"
              onClick={() => {
                setSettingsId(menuItem!.exerciseId)
                closeMenu()
              }}
            />
            <MenuItem
              icon={<IconX size={20} />}
              label="Remover da ficha"
              danger
              onClick={() => {
                md((d) => removeItem(d.blocks, menu.itemId))
                closeMenu()
              }}
            />
          </div>
        )}
      </Sheet>

      <ExerciseSettings exercise={settingsId ? exercises.get(settingsId) ?? null : null} onClose={() => setSettingsId(null)} />
    </>
  )
}

const DROP_WHERE: { id: 'none' | 'last' | 'all'; label: string }[] = [
  { id: 'none', label: 'Não' },
  { id: 'last', label: 'Na última série' },
  { id: 'all', label: 'Em todas' },
]

function PlanBlockCard({
  block,
  index,
  exercises,
  onChange,
  onMenu,
}: {
  block: PlanBlock
  index: number
  exercises: Map<string, Exercise>
  onChange: (itemId: string, fn: (it: PlanItem) => void) => void
  onMenu: (itemId: string) => void
}) {
  const biset = block.items.length > 1
  return (
    <div className={`card plan-block${biset ? ' biset' : ''}`}>
      {biset && (
        <div className="biset-tag">
          <IconLink size={14} /> Biset · um seguido do outro
        </div>
      )}
      {block.items.map((it, k) => {
        const ex = exercises.get(it.exerciseId)
        return (
          <div key={it.id} className="plan-item">
            <div className="plan-head">
              <span className="idx">
                {index + 1}
                {biset ? 'ab'[k] : ''}
              </span>
              <div className="plan-name">
                <strong>{ex?.name ?? 'Exercício removido'}</strong>
                <small>
                  {muscleLabel(ex?.muscle)} · {ex ? loadShort(ex.loadMode) : ''}
                </small>
              </div>
              <button className="icon-btn" onClick={() => onMenu(it.id)} aria-label="Opções do exercício">
                <IconDots />
              </button>
            </div>
            <div className="plan-controls">
              <Stepper
                compact
                label="Séries"
                value={it.sets}
                step={1}
                decimals={false}
                onChange={(v) => onChange(it.id, (x) => (x.sets = Math.max(1, Math.min(12, v))))}
              />
              <label className="mini-field">
                <span>Reps (alvo)</span>
                <InlineText
                  value={it.reps ?? ''}
                  placeholder="ex: 8–12"
                  maxLength={12}
                  onSave={(v) => onChange(it.id, (x) => (x.reps = v || undefined))}
                />
              </label>
            </div>
            <div className="drop-config">
              <span className="mini-label">
                <IconDrop size={13} /> Drop set
              </span>
              <div className="chips wrap">
                {DROP_WHERE.map((w) => (
                  <Chip
                    key={w.id}
                    active={(it.drop?.sets ?? 'none') === w.id}
                    onClick={() =>
                      onChange(it.id, (x) => {
                        x.drop = w.id === 'none' ? undefined : { sets: w.id, count: x.drop?.count ?? 1 }
                      })
                    }
                  >
                    {w.label}
                  </Chip>
                ))}
              </div>
              {it.drop && (
                <div className="chips wrap">
                  {[1, 2, 3].map((n) => (
                    <Chip
                      key={n}
                      active={it.drop!.count === n}
                      onClick={() => onChange(it.id, (x) => (x.drop = { sets: x.drop!.sets, count: n }))}
                    >
                      {n} {n === 1 ? 'drop' : 'drops'}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
            <InlineText
              className="note-input"
              value={it.note ?? ''}
              placeholder="Observação (ex: banco no 3, pegada fechada)"
              maxLength={80}
              onSave={(v) => onChange(it.id, (x) => (x.note = v || undefined))}
            />
          </div>
        )
      })}
    </div>
  )
}
