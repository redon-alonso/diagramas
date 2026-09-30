import { bigO, growthClass } from './poly.js'

/** Clase de crecimiento de un polinomio (para colorear). */
export function classOf(poly) {
  return growthClass(bigO(poly).growth)
}

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

/** Número grande legible: 1,2 mil · 3,4 millones · 1,5·10¹⁵ */
export function formatBig(x) {
  if (!Number.isFinite(x)) return '∞'
  const a = Math.abs(x)
  if (a < 1e4) return nf.format(Math.round(x * 10) / 10)
  if (a < 1e6) return `${nf.format(x / 1e3)} mil`
  if (a < 1e9) return `${nf.format(x / 1e6)} ${Math.round(a / 1e5) === 10 ? 'millón' : 'millones'}`
  if (a < 1e12) return `${nf.format(x / 1e9)} mil millones`
  const exp = Math.floor(Math.log10(a))
  const mant = x / 10 ** exp
  const sup = String(exp).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)]).join('')
  return `${nf.format(mant)}·10${sup}`
}

/** Duración legible a partir de segundos. */
export function formatDuration(s) {
  if (!Number.isFinite(s)) return 'nunca termina'
  if (s < 1e-6) return 'menos de 1 µs'
  if (s < 1e-3) return `${nf.format(s * 1e6)} µs`
  if (s < 1) return `${nf.format(s * 1e3)} ms`
  if (s < 60) return `${nf.format(s)} s`
  if (s < 3600) return `${nf.format(s / 60)} min`
  if (s < 86400) return `${nf.format(s / 3600)} h`
  if (s < 86400 * 365) return `${nf.format(s / 86400)} días`
  const years = s / (86400 * 365)
  if (years < 1e6) return `${formatBig(years)} años`
  return years > 1.4e10 ? `${formatBig(years)} años (más que la edad del universo)` : `${formatBig(years)} años`
}

/** Semáforo de viabilidad según el tiempo estimado. */
export function viability(seconds) {
  if (seconds < 1) return { id: 'ok', label: 'Viable' }
  if (seconds < 60) return { id: 'slow', label: 'Lento' }
  return { id: 'bad', label: 'Inviable' }
}

export const OPS_PER_SECOND = 1e8
