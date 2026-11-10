export const uid = () =>
  (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '').slice(0, 16)

/** 37.5 → "37,5" */
export const fmtNum = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

export const parseNum = (s: string): number | null => {
  const v = Number(s.replace(',', '.').trim())
  return Number.isFinite(v) && s.trim() !== '' ? v : null
}

export const roundTo = (n: number, step: number) => Math.round(n / step) * step
export const floorTo = (n: number, step: number) => Math.max(0, Math.floor(n / step + 1e-9) * step)

export const fix = (n: number) => Math.round(n * 1000) / 1000

/** Data local em AAAA-MM-DD */
export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const parseISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTHS_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** "seg, 9 nov" */
export const fmtDate = (iso: string) => {
  const d = parseISO(iso)
  return `${WEEK[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** "9 nov" (com ano se não for o atual) */
export const fmtShortDate = (iso: string) => {
  const d = parseISO(iso)
  const y = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${y}`
}

export const fmtMonth = (iso: string) => {
  const d = parseISO(iso)
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}

export const weekday = (iso: string) => WEEK[parseISO(iso).getDay()]
export const dayOfMonth = (iso: string) => parseISO(iso).getDate()

export const relDate = (iso: string) => {
  const diff = Math.round((parseISO(todayISO()).getTime() - parseISO(iso).getTime()) / 86400000)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'ontem'
  if (diff > 1 && diff < 7) return `há ${diff} dias`
  return fmtShortDate(iso)
}

export const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()

export const DAY_LETTERS = 'ABCDEFG'.split('')

/** Timestamp → AAAA-MM-DD no horário local */
export const isoFromTs = (ts: number) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
