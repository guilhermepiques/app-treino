import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Drop, type Exercise, type PlanBlock, type PlanItem, type SetLog, type Workout } from '../db'
import { loadLabel, loadShort, muscleLabel } from '../data/library'
import {
  deleteItemSets,
  deleteWorkout,
  findItem,
  mutateWorkout,
  newBlock,
  removeItem,
  useExercises,
} from '../lib/actions'
import { EMPTY_REFS, cmpPerf, computeRefs, trend, type ExerciseRefs, type Perf } from '../lib/stats'
import { dropText, fix, floorTo, fmtDate, fmtNum, relDate, todayISO, uid } from '../lib/util'
import { ExercisePicker, ExerciseSettings } from '../components/ExercisePicker'
import {
  IconBack,
  IconCheck,
  IconChevron,
  IconDots,
  IconDown,
  IconDrop,
  IconEqual,
  IconHistory,
  IconLink,
  IconMinus,
  IconPause,
  IconPlus,
  IconTrophy,
  IconUp,
  IconX,
} from '../components/Icons'
import { MenuItem, Sheet, Stepper, TopBar, toast } from '../components/ui'
import { ExerciseEvolution } from './EvolucaoTab'

interface Draft {
  weight: number
  reps: number
  warmup: boolean
  drops: Drop[]
}

interface Slot {
  key: string
  item: PlanItem
  ex: Exercise | undefined
  order: number
  sub: number
  biset: boolean
  log?: SetLog
  /** Número da série válida (1, 2, 3…); 0 se for aquecimento. */
  workNo: number
  warm: boolean
  label: string
  /** Drops planejados na ficha para esta série (0 = nenhum). */
  plannedDrops: number
}

const keyOf = (itemId: string, order: number) => `${itemId}:${order}`
const perfText = (p: Perf) => `${fmtNum(p.weight)} kg × ${p.reps}`

export function WorkoutView({
  workoutId,
  mode,
  onClose,
}: {
  workoutId: string
  mode: 'live' | 'edit'
  onClose?: () => void
}) {
  const workout = useLiveQuery(() => db.workouts.get(workoutId), [workoutId])
  const exercises = useExercises()
  const sets = useLiveQuery(() => db.sets.where('workoutId').equals(workoutId).toArray(), [workoutId])

  const exIds = useMemo(
    () => [...new Set(workout?.blocks.flatMap((b) => b.items.map((i) => i.exerciseId)) ?? [])],
    [workout],
  )
  const refs = useLiveQuery(async () => {
    if (!workout) return undefined
    const all = await db.sets.where('exerciseId').anyOf(exIds).toArray()
    const wids = [...new Set(all.map((s) => s.workoutId))]
    const ws = (await db.workouts.bulkGet(wids)).filter((w): w is Workout => !!w)
    return computeRefs(workout, exIds, all, new Map(ws.map((w) => [w.id, w])))
  }, [workout?.id, workout?.date, workout?.startedAt, exIds.join(',')])

  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [selected, setSelected] = useState<string | null | undefined>(mode === 'live' ? undefined : null)
  const scrollTo = useRef<string | null>(null)
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'swap'; itemId: string } | null>(null)
  const [menuItemId, setMenuItemId] = useState<string | null>(null)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)

  // Monta a lista de séries (slots) de cada bloco. No biset, alterna: 1a, 1b, 2a, 2b…
  const blockSlots = useMemo(() => {
    if (!workout || !sets || !exercises) return []
    const byItem = new Map<string, Map<number, SetLog>>()
    for (const s of sets) {
      if (!byItem.has(s.itemId)) byItem.set(s.itemId, new Map())
      byItem.get(s.itemId)!.set(s.order, s)
    }
    return workout.blocks.map((block) => {
      const biset = block.items.length > 1
      const counts = block.items.map((it) => {
        const logs = byItem.get(it.id)
        const maxOrder = logs ? Math.max(...logs.keys()) : -1
        return Math.max(it.sets, maxOrder + 1)
      })
      const perItem = block.items.map((it, sub) => {
        let workNo = 0
        const list: Slot[] = []
        for (let order = 0; order < counts[sub]; order++) {
          const key = keyOf(it.id, order)
          const log = byItem.get(it.id)?.get(order)
          const warm = log ? log.warmup : drafts[key]?.warmup ?? false
          if (!warm) workNo++
          const suffix = biset ? 'ab'[sub] : ''
          list.push({
            key,
            item: it,
            ex: exercises.get(it.exerciseId),
            order,
            sub,
            biset,
            log,
            workNo: warm ? 0 : workNo,
            warm,
            label: warm ? `Aq${suffix}` : `${workNo}${suffix}`,
            plannedDrops: 0,
          })
        }
        // Drop planejado na ficha: na última série válida ou em todas.
        const totalWork = list.filter((s) => !s.warm).length
        if (it.drop)
          for (const s of list)
            if (!s.warm && (it.drop.sets === 'all' || s.workNo === totalWork)) s.plannedDrops = it.drop.count
        return list
      })
      const rounds = Math.max(0, ...counts)
      const slots: Slot[] = []
      for (let r = 0; r < rounds; r++) for (const list of perItem) if (list[r]) slots.push(list[r])
      return { block, slots }
    })
  }, [workout, sets, exercises, drafts])

  const flat = useMemo(() => blockSlots.flatMap((b) => b.slots), [blockSlots])
  const firstOpen = flat.find((s) => !s.log)?.key ?? null
  const current = selected === undefined ? firstOpen : selected

  useEffect(() => {
    if (current && scrollTo.current === current) {
      scrollTo.current = null
      requestAnimationFrame(() =>
        document.getElementById(`slot-${current}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      )
    }
  }, [current])

  if (!workout || !exercises || !sets || !refs) return null

  const refsOf = (exId: string) => refs.get(exId) ?? EMPTY_REFS

  /** Completa os drops planejados na ficha (cada um ~25% mais leve que o anterior). */
  const prefill = (slot: Slot): Draft => {
    const d = basePrefill(slot)
    if (d.warmup || d.drops.length >= slot.plannedDrops) return d
    const step = slot.ex?.step ?? 2
    const drops = [...d.drops]
    while (drops.length < slot.plannedDrops) {
      const base = drops[drops.length - 1] ?? d
      drops.push({ weight: fix(floorTo(base.weight * 0.75, step)), reps: base.reps })
    }
    return { ...d, drops }
  }

  const basePrefill = (slot: Slot): Draft => {
    const r = refsOf(slot.item.exerciseId)
    const ant = slot.workNo ? r.prev[slot.workNo - 1] : undefined
    if (ant) return { weight: ant.weight, reps: ant.reps, warmup: false, drops: ant.drops.map((d) => ({ ...d })) }
    const today = [...sets]
      .filter((s) => s.itemId === slot.item.id && !s.warmup && s.order < slot.order)
      .sort((a, b) => b.order - a.order)[0]
    if (today) return { weight: today.weight, reps: today.reps, warmup: slot.warm, drops: [] }
    const last = r.prev[r.prev.length - 1]
    if (last) return { weight: last.weight, reps: last.reps, warmup: slot.warm, drops: [] }
    const target = parseInt(slot.item.reps ?? '', 10)
    return { weight: 0, reps: Number.isFinite(target) ? target : 10, warmup: slot.warm, drops: [] }
  }

  const draftOf = (slot: Slot): Draft =>
    drafts[slot.key] ??
    (slot.log
      ? { weight: slot.log.weight, reps: slot.log.reps, warmup: slot.log.warmup, drops: slot.log.drops.map((d) => ({ ...d })) }
      : prefill(slot))

  const setDraft = (key: string, d: Draft) => setDrafts((all) => ({ ...all, [key]: d }))
  const clearDraft = (key: string) =>
    setDrafts((all) => {
      const { [key]: _, ...rest } = all
      return rest
    })

  const save = async (slot: Slot) => {
    const d = draftOf(slot)
    const rec: SetLog = {
      id: slot.log?.id ?? uid(),
      workoutId,
      exerciseId: slot.item.exerciseId,
      itemId: slot.item.id,
      order: slot.order,
      weight: d.weight,
      reps: d.reps,
      warmup: d.warmup,
      drops: d.drops,
      createdAt: slot.log?.createdAt ?? Date.now(),
    }
    await db.sets.put(rec)
    clearDraft(slot.key)
    // Aquecimento novo não "gasta" uma das séries planejadas: abre mais uma.
    if (!slot.log && d.warmup)
      await mutateWorkout(workoutId, (w) => {
        const it = findItem(w.blocks, slot.item.id)
        if (it) it.sets += 1
      })
    if (mode === 'live') {
      const i = flat.findIndex((s) => s.key === slot.key)
      const isOpen = (s: Slot) => !s.log && s.key !== slot.key
      const next = flat.slice(i + 1).find(isOpen) ?? flat.find(isOpen)
      scrollTo.current = next?.key ?? null
      setSelected(next?.key ?? null)
    } else setSelected(null)
  }

  const removeSet = async (slot: Slot) => {
    if (slot.log) await db.sets.delete(slot.log.id)
    clearDraft(slot.key)
    setSelected(null)
  }

  const mw = (fn: (w: Workout) => void) => mutateWorkout(workoutId, fn)
  const logsOfItem = (itemId: string) => sets.filter((s) => s.itemId === itemId)
  const doneCount = sets.length

  const finish = async () => {
    if (!sets.length) {
      if (confirm('Nenhuma série anotada. Descartar este treino?')) await deleteWorkout(workoutId)
      return
    }
    await mw((w) => {
      w.status = 'done'
      w.finishedAt = Date.now()
    })
    toast(`Treino ${workout.dayLabel} salvo · ${sets.filter((s) => !s.warmup).length} séries`)
  }

  const menuItem = menuItemId ? findItem(workout.blocks, menuItemId) : undefined
  const menuEx = menuItem ? exercises.get(menuItem.exerciseId) : undefined

  return (
    <>
      <TopBar
        left={
          onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Voltar">
              <IconBack />
            </button>
          )
        }
        title={
          <>
            Treino <span className="accent">{workout.dayLabel}</span>
          </>
        }
        sub={workout.dayName || workout.muscles.map(muscleLabel).join(' · ') || undefined}
        right={
          <label className="date-chip">
            {workout.date === todayISO() ? 'Hoje' : fmtDate(workout.date)}
            <input
              type="date"
              value={workout.date}
              max={todayISO()}
              onChange={(e) => e.target.value && mw((w) => (w.date = e.target.value))}
              aria-label="Data do treino"
            />
          </label>
        }
      />
      <main className="page workout">
        {blockSlots.map(({ block, slots }, bi) => (
          <BlockCard
            key={block.id}
            block={block}
            index={bi}
            slots={slots}
            exercises={exercises}
            current={current}
            refsOf={refsOf}
            draftOf={draftOf}
            onSelect={(k) => setSelected(k === current ? null : k)}
            onDraft={setDraft}
            onSave={save}
            onRemove={removeSet}
            onMenu={setMenuItemId}
            onAddRound={() =>
              mw((w) => {
                const b = w.blocks[bi]
                const max = Math.max(...slots.map((s) => s.order + 1), ...b.items.map((it) => it.sets))
                b.items.forEach((it) => (it.sets = max + 1))
              })
            }
            onRemoveRound={() =>
              mw((w) => {
                const b = w.blocks[bi]
                b.items.forEach((it) => {
                  const used = Math.max(-1, ...logsOfItem(it.id).map((s) => s.order)) + 1
                  it.sets = Math.max(1, used, it.sets - 1)
                })
              })
            }
          />
        ))}

        {!workout.blocks.length && <p className="muted pad">Este dia não tem exercícios. Adicione abaixo.</p>}

        <button className="btn dashed" onClick={() => setPicker({ mode: 'add' })}>
          <IconPlus size={18} /> Adicionar exercício {mode === 'live' ? 'só hoje' : ''}
        </button>

        {mode === 'live' ? (
          <div className="finish">
            <button className="btn primary block big" onClick={finish}>
              <IconCheck /> Finalizar treino
            </button>
            <button
              className="btn text danger block"
              onClick={async () => {
                if (confirm(`Descartar este treino${doneCount ? ` e as ${doneCount} séries anotadas` : ''}?`))
                  await deleteWorkout(workoutId)
              }}
            >
              Descartar treino
            </button>
          </div>
        ) : (
          <div className="finish">
            <button className="btn primary block big" onClick={onClose}>
              <IconCheck /> Pronto
            </button>
            <button
              className="btn text danger block"
              onClick={async () => {
                if (confirm('Apagar este treino do histórico? Não dá para desfazer.')) {
                  onClose?.()
                  await deleteWorkout(workoutId)
                }
              }}
            >
              Apagar treino
            </button>
          </div>
        )}
      </main>

      <ExercisePicker
        open={!!picker}
        onClose={() => setPicker(null)}
        prefer={workout.muscles}
        title={picker?.mode === 'swap' ? 'Trocar só neste treino' : 'Adicionar ao treino'}
        onPick={async (exerciseId) => {
          const p = picker
          setPicker(null)
          if (p?.mode === 'swap') {
            if (logsOfItem(p.itemId).length) {
              if (!confirm('As séries já anotadas desse exercício neste treino serão apagadas. Continuar?')) return
              await deleteItemSets(workoutId, p.itemId)
            }
            await mw((w) => {
              const it = findItem(w.blocks, p.itemId)
              if (it) it.exerciseId = exerciseId
            })
          } else {
            await mw((w) => w.blocks.push(newBlock(exerciseId)))
          }
        }}
      />

      <Sheet open={!!menuItem} onClose={() => setMenuItemId(null)} title={menuEx?.name}>
        {menuItem && (
          <div className="list">
            <MenuItem
              icon={<IconHistory size={20} />}
              label="Ver evolução e histórico"
              onClick={() => {
                setHistoryId(menuItem.exerciseId)
                setMenuItemId(null)
              }}
            />
            <MenuItem
              icon={<IconChevron size={20} />}
              label="Trocar só neste treino"
              hint="A ficha continua igual"
              onClick={() => {
                setPicker({ mode: 'swap', itemId: menuItem.id })
                setMenuItemId(null)
              }}
            />
            <MenuItem
              icon={<IconDots size={20} />}
              label="Ajustes do exercício"
              hint="Tipo de carga e quanto o +/− sobe"
              onClick={() => {
                setSettingsId(menuItem.exerciseId)
                setMenuItemId(null)
              }}
            />
            <MenuItem
              icon={<IconX size={20} />}
              label="Tirar deste treino"
              danger
              onClick={async () => {
                const n = logsOfItem(menuItem.id).length
                if (n && !confirm(`Apagar as ${n} séries anotadas desse exercício neste treino?`)) return
                setMenuItemId(null)
                await deleteItemSets(workoutId, menuItem.id)
                await mw((w) => removeItem(w.blocks, menuItem.id))
              }}
            />
          </div>
        )}
      </Sheet>

      <ExerciseSettings
        exercise={settingsId ? exercises.get(settingsId) ?? null : null}
        onClose={() => setSettingsId(null)}
      />

      <Sheet
        open={!!historyId}
        onClose={() => setHistoryId(null)}
        title={historyId ? exercises.get(historyId)?.name : ''}
        tall
      >
        {historyId && <ExerciseEvolution exerciseId={historyId} />}
      </Sheet>
    </>
  )
}

function BlockCard({
  block,
  index,
  slots,
  exercises,
  current,
  refsOf,
  draftOf,
  onSelect,
  onDraft,
  onSave,
  onRemove,
  onMenu,
  onAddRound,
  onRemoveRound,
}: {
  block: PlanBlock
  index: number
  slots: Slot[]
  exercises: Map<string, Exercise>
  current: string | null
  refsOf: (exId: string) => ExerciseRefs
  draftOf: (s: Slot) => Draft
  onSelect: (key: string) => void
  onDraft: (key: string, d: Draft) => void
  onSave: (s: Slot) => void
  onRemove: (s: Slot) => void
  onMenu: (itemId: string) => void
  onAddRound: () => void
  onRemoveRound: () => void
}) {
  const biset = block.items.length > 1
  const lastRoundEmpty = block.items.every((it) => {
    const mine = slots.filter((s) => s.item.id === it.id)
    const last = mine[mine.length - 1]
    return !last || !last.log
  })
  const workSets = (itemId: string) => slots.filter((s) => s.item.id === itemId && !s.warm).length
  const canRemoveRound = lastRoundEmpty && Math.max(...block.items.map((it) => slots.filter((s) => s.item.id === it.id).length)) > 1

  return (
    <section className={`card ex-card${biset ? ' biset' : ''}`}>
      {biset && (
        <div className="biset-tag">
          <IconLink size={14} /> Biset
        </div>
      )}
      {block.items.map((it, k) => {
        const ex = exercises.get(it.exerciseId)
        const r = refsOf(it.exerciseId)
        return (
          <div key={it.id} className="ex-head">
            <span className="idx">
              {index + 1}
              {biset ? 'ab'[k] : ''}
            </span>
            <div className="ex-title">
              <h2>{ex?.name ?? 'Exercício removido'}</h2>
              <div className="ex-meta">
                {[
                  ex && loadShort(ex.loadMode),
                  workSets(it.id) &&
                    `${workSets(it.id)} ${workSets(it.id) === 1 ? 'série' : 'séries'}${it.reps ? ` de ${it.reps}` : ''}`,
                  it.drop && dropText(it.drop),
                  r.prevDate && `último ${relDate(r.prevDate)}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {it.restPause && (
                <div className="rp-tag">
                  <IconPause size={12} /> Rest-pause
                </div>
              )}
              {it.note && <div className="ex-note">{it.note}</div>}
            </div>
            <button className="icon-btn" onClick={() => onMenu(it.id)} aria-label="Opções do exercício">
              <IconDots />
            </button>
          </div>
        )
      })}

      <div className="slots">
        {slots.map((s) => {
          const r = refsOf(s.item.exerciseId)
          const ant = s.workNo ? r.prev[s.workNo - 1] : undefined
          return s.key === current ? (
            <SetEditor
              key={s.key}
              slot={s}
              refs={r}
              draft={draftOf(s)}
              onChange={(d) => onDraft(s.key, d)}
              onSave={() => onSave(s)}
              onRemove={() => onRemove(s)}
              onCollapse={() => onSelect(s.key)}
            />
          ) : (
            <SetRow key={s.key} slot={s} ant={ant} best={r.best} onClick={() => onSelect(s.key)} />
          )
        })}
      </div>

      <div className="ex-foot">
        <button className="btn small ghost" onClick={onAddRound}>
          <IconPlus size={16} /> Série
        </button>
        {canRemoveRound && (
          <button className="btn small ghost" onClick={onRemoveRound} aria-label="Remover última série vazia">
            <IconMinus size={16} /> Série
          </button>
        )}
      </div>
    </section>
  )
}

function TrendMark({ cur, ant, best }: { cur: Perf; ant?: Perf; best: Perf | null }) {
  if (best && cmpPerf(cur, best) > 0)
    return (
      <span className="trend record" title="Novo recorde">
        <IconTrophy size={16} />
      </span>
    )
  if (!ant) return null
  const t = trend(cur, ant)
  return (
    <span className={`trend ${t}`} title={t === 'up' ? 'Melhor que a anterior' : t === 'down' ? 'Abaixo da anterior' : 'Igual à anterior'}>
      {t === 'up' ? <IconUp size={16} /> : t === 'down' ? <IconDown size={16} /> : <IconEqual size={16} />}
    </span>
  )
}

function DropsText({ drops }: { drops: Drop[] }) {
  if (!drops.length) return null
  return (
    <span className="drops-text">
      {drops.map((d, i) => (
        <span key={i}>
          <IconDrop size={12} /> {fmtNum(d.weight)}×{d.reps}
        </span>
      ))}
    </span>
  )
}

function SetRow({ slot, ant, best, onClick }: { slot: Slot; ant?: SetLog; best: SetLog | null; onClick: () => void }) {
  const log = slot.log
  return (
    <button id={`slot-${slot.key}`} className={`set-row${log ? ' done' : ''}${slot.warm ? ' warm' : ''}`} onClick={onClick}>
      <span className="set-no">{slot.label}</span>
      <span className="set-main">
        {slot.biset && <span className="set-ex">{slot.ex?.name}</span>}
        {log ? (
          <span className="set-val">
            <b>{fmtNum(log.weight)}</b>
            <small>kg</small> × <b>{log.reps}</b>
            <DropsText drops={log.drops} />
          </span>
        ) : (
          <span className="set-ghost">
            {ant ? `anterior ${fmtNum(ant.weight)} × ${ant.reps}` : 'toque para anotar'}
            {slot.plannedDrops > 0 && (
              <span className="drop-tag">
                {' '}
                · <IconDrop size={12} /> {slot.plannedDrops > 1 ? `${slot.plannedDrops} drops` : 'com drop'}
              </span>
            )}
          </span>
        )}
      </span>
      {log ? (
        !log.warmup && <TrendMark cur={log} ant={ant} best={best} />
      ) : (
        <span className="set-empty" aria-hidden="true" />
      )}
    </button>
  )
}

function SetEditor({
  slot,
  refs,
  draft,
  onChange,
  onSave,
  onRemove,
  onCollapse,
}: {
  slot: Slot
  refs: ExerciseRefs
  draft: Draft
  onChange: (d: Draft) => void
  onSave: () => void
  onRemove: () => void
  onCollapse: () => void
}) {
  const ex = slot.ex
  const step = ex?.step ?? 2
  const ant = slot.workNo ? refs.prev[slot.workNo - 1] : undefined
  const best = refs.best
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch })
  const setDrop = (i: number, patch: Partial<Drop>) =>
    set({ drops: draft.drops.map((d, k) => (k === i ? { ...d, ...patch } : d)) })

  const addDrop = () => {
    const base = draft.drops[draft.drops.length - 1] ?? draft
    set({ drops: [...draft.drops, { weight: fix(floorTo(base.weight * 0.75, step)), reps: base.reps }] })
  }

  return (
    <div id={`slot-${slot.key}`} className="set-editor">
      <div className="se-head">
        <button className="se-title" onClick={onCollapse} aria-label="Recolher série">
          <span className="set-no">{slot.label}</span>
          <span>
            {draft.warmup ? 'Aquecimento' : `Série ${slot.workNo}`}
            {slot.biset && <small>{ex?.name}</small>}
          </span>
        </button>
        <button
          className={`chip small${draft.warmup ? ' active' : ''}`}
          aria-pressed={draft.warmup}
          onClick={() => set({ warmup: !draft.warmup })}
        >
          Aquecimento
        </button>
      </div>

      {!draft.warmup && (
        <div className="refs">
          <div className="ref">
            <small>Anterior{refs.prevDate ? ` · ${relDate(refs.prevDate)}` : ''}</small>
            <b>{ant ? perfText(ant) : '—'}</b>
            {ant && <DropsText drops={ant.drops} />}
          </div>
          <div className="ref best">
            <small>
              <IconTrophy size={12} /> Melhor
            </small>
            <b>{best ? perfText(best) : '—'}</b>
          </div>
        </div>
      )}

      <div className="se-steppers">
        <Stepper
          label={ex ? loadLabel(ex.loadMode) : 'Carga'}
          unit="kg"
          value={draft.weight}
          step={step}
          onChange={(weight) => set({ weight })}
        />
        <Stepper label="Reps" value={draft.reps} step={1} decimals={false} onChange={(reps) => set({ reps })} />
      </div>

      {draft.drops.map((d, i) => (
        <div key={i} className="drop-row">
          <div className="drop-head">
            <span>
              <IconDrop size={14} /> Drop {i + 1}
            </span>
            <button
              className="icon-btn small"
              onClick={() => set({ drops: draft.drops.filter((_, k) => k !== i) })}
              aria-label={`Remover drop ${i + 1}`}
            >
              <IconX size={16} />
            </button>
          </div>
          <div className="se-steppers">
            <Stepper compact unit="kg" value={d.weight} step={step} onChange={(weight) => setDrop(i, { weight })} />
            <Stepper compact value={d.reps} step={1} decimals={false} onChange={(reps) => setDrop(i, { reps })} />
          </div>
        </div>
      ))}

      {!draft.warmup && <Delta cur={draft} ant={ant} best={best} />}

      <div className="se-actions">
        {!draft.warmup && (
          <button className="btn ghost" onClick={addDrop}>
            <IconDrop size={18} /> Drop
          </button>
        )}
        <button className="btn primary grow big" onClick={onSave}>
          <IconCheck /> {slot.log ? 'Salvar' : 'Feito'}
        </button>
      </div>
      {slot.log && (
        <button className="btn text danger small block" onClick={onRemove}>
          Apagar série
        </button>
      )}
    </div>
  )
}

function Delta({ cur, ant, best }: { cur: Perf; ant?: Perf; best: Perf | null }) {
  if (best && cmpPerf(cur, best) > 0)
    return (
      <div className="delta record">
        <IconTrophy size={16} /> Novo recorde! Antes era {perfText(best)}
      </div>
    )
  if (!ant) return best ? null : <div className="delta muted">Primeira vez anotando este exercício</div>
  const dw = fix(cur.weight - ant.weight)
  const dr = cur.reps - ant.reps
  const t = trend(cur, ant)
  const parts: string[] = []
  if (dw) parts.push(`${dw > 0 ? '+' : '−'}${fmtNum(Math.abs(dw))} kg`)
  if (dr) parts.push(`${dr > 0 ? '+' : '−'}${Math.abs(dr)} ${Math.abs(dr) === 1 ? 'rep' : 'reps'}`)
  return (
    <div className={`delta ${t}`}>
      {t === 'up' ? <IconUp size={16} /> : t === 'down' ? <IconDown size={16} /> : <IconEqual size={16} />}
      {parts.length ? `${parts.join(', ')} em relação à anterior` : 'Igual à anterior'}
    </div>
  )
}
