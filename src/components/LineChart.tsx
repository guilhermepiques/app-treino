import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fmtShortDate, isoFromTs } from '../lib/util'

export interface ChartPoint {
  /** timestamp do dia */
  x: number
  y: number
  /** linha forte do balão (valor) */
  title: string
  /** linha fraca do balão (data, detalhe) */
  sub: string
  /** ponto de recorde */
  record?: boolean
}

const H = 216
const PAD = { l: 42, r: 16, t: 28, b: 28 }

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

function niceTicks(min: number, max: number, floorZero: boolean) {
  let lo = min
  let hi = max
  if (hi - lo < 1e-9) {
    const pad = Math.max(1, Math.abs(hi) * 0.1)
    lo -= pad
    hi += pad
  }
  if (floorZero) lo = Math.max(0, lo)
  const step = niceStep((hi - lo) / 3)
  const a = Math.floor(lo / step) * step
  let b = Math.ceil(hi / step) * step
  if (b === a) b = a + step
  const ticks: number[] = []
  for (let v = a; v <= b + step / 1000; v += step) ticks.push(Math.round(v * 1000) / 1000)
  return ticks
}

/** Gráfico de linha de uma série só, com cruz que segue o dedo e balão com o valor. */
export function LineChart({
  points,
  tick,
  label,
}: {
  points: ChartPoint[]
  /** formata os números do eixo */
  tick: (v: number) => string
  /** descrição para leitor de tela */
  label: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [active, setActive] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!points.length) return <div className="chart" ref={box} />

  const ticks = niceTicks(Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y)), true)
  const y0 = ticks[0]
  const y1 = ticks[ticks.length - 1]
  const x0 = points[0].x
  const x1 = points[points.length - 1].x
  const innerW = Math.max(10, width - PAD.l - PAD.r)
  const innerH = H - PAD.t - PAD.b
  const px = (x: number) => (x1 === x0 ? PAD.l + innerW / 2 : PAD.l + ((x - x0) / (x1 - x0)) * innerW)
  const py = (y: number) => PAD.t + (1 - (y - y0) / (y1 - y0)) * innerH
  const pts = points.map((p) => ({ ...p, cx: px(p.x), cy: py(p.y) }))
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join('')
  const area = `${line}L${pts[pts.length - 1].cx.toFixed(1)},${PAD.t + innerH}L${pts[0].cx.toFixed(1)},${PAD.t + innerH}Z`
  const showDots = pts.length <= 30
  const last = pts[pts.length - 1]
  const act = active !== null ? pts[active] : null

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    let best = 0
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].cx - x) < Math.abs(pts[best].cx - x)) best = i
    setActive(best)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(pts.length - 1, (a ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? pts.length) - 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  const endAnchor = last.cx > width - 60 ? 'end' : 'middle'

  return (
    <div className="chart" ref={box}>
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={label}
        tabIndex={0}
        onPointerDown={pick}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons) && pick(e)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={PAD.l} x2={width - PAD.r} y1={py(t)} y2={py(t)} />
            <text className="chart-tick" x={PAD.l - 8} y={py(t)} dy="0.32em" textAnchor="end">
              {tick(t)}
            </text>
          </g>
        ))}
        <text className="chart-tick" x={pts[0].cx} y={H - 8} textAnchor={pts.length > 1 ? 'start' : 'middle'}>
          {fmtShortDate(isoFromTs(x0))}
        </text>
        {pts.length > 1 && (
          <text className="chart-tick" x={last.cx} y={H - 8} textAnchor="end">
            {fmtShortDate(isoFromTs(x1))}
          </text>
        )}

        {pts.length > 1 && <path className="chart-area" d={area} />}
        {pts.length > 1 && <path className="chart-line" d={line} />}

        {act && <line className="chart-cross" x1={act.cx} x2={act.cx} y1={PAD.t - 6} y2={PAD.t + innerH} />}

        {pts.map((p, i) =>
          showDots || p.record || i === pts.length - 1 || i === active ? (
            <circle
              key={i}
              className={`chart-dot${p.record ? ' record' : ''}`}
              cx={p.cx}
              cy={p.cy}
              r={i === active ? 6 : 4}
            />
          ) : null,
        )}

        {!act && (
          <text className="chart-end" x={last.cx} y={last.cy - 12} textAnchor={endAnchor}>
            {last.title}
          </text>
        )}
      </svg>

      {act && (
        <div
          className="chart-tip"
          style={{ left: Math.min(Math.max(act.cx, 70), width - 70), top: act.cy - 14 }}
          role="status"
        >
          <b>{act.title}</b>
          <small>{act.sub}</small>
        </div>
      )}
    </div>
  )
}

/** Linha pequena de tendência (sem eixos). */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="spark-empty" />
  const w = 64
  const h = 26
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [3 + (i / (values.length - 1)) * (w - 6), 3 + (1 - (v - min) / span) * (h - 6)])
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg className="spark" width={w} height={h} aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} />
      <circle cx={lx} cy={ly} r={3} />
    </svg>
  )
}
