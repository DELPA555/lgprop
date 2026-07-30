// Utilidades de fechas (trabajan con strings 'YYYY-MM-DD' en UTC para evitar
// corrimientos de huso).

function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return { y, m, d }
}
function fmt(y: number, m: number, d: number): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${y}-${p(m)}-${p(d)}`
}
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Suma `n` meses a una fecha ISO, clampeando el día al último del mes destino. */
export function addMonthsISO(iso: string, n: number): string {
  const { y, m, d } = parse(iso)
  const total = (y * 12 + (m - 1)) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  const nd = Math.min(d, lastDayOfMonth(ny, nm))
  return fmt(ny, nm, nd)
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Fin del contrato = inicio + duración (en meses). */
export function computeFechaFin(inicio: string, duracionMeses: number): string {
  if (!inicio || !duracionMeses) return ''
  return addMonthsISO(inicio, duracionMeses)
}

/**
 * Próxima actualización de monto: primer múltiplo de `frecuencia` a partir del
 * inicio que caiga después de hoy. Devuelve null si supera el fin del contrato.
 */
export function computeProximaActualizacion(
  inicio: string,
  frecuenciaMeses: number,
  fin: string
): string | null {
  if (!inicio || !frecuenciaMeses || frecuenciaMeses <= 0) return null
  const hoy = todayISO()
  let next = addMonthsISO(inicio, frecuenciaMeses)
  let guard = 0
  while (next <= hoy && guard < 600) {
    next = addMonthsISO(next, frecuenciaMeses)
    guard++
  }
  if (fin && next > fin) return null
  return next
}

/**
 * Meses (enteros) entre dos fechas ISO, redondeando al plazo más plausible.
 * Pensado para derivar la duración de un contrato desde inicio/fin, tolerando
 * el caso típico de "termina el día anterior al aniversario"
 * (ej. 2025-08-01 → 2026-07-31 = 12 meses). Devuelve null si falta alguna fecha.
 */
export function monthsBetween(inicio: string, fin: string): number | null {
  if (!inicio || !fin) return null
  const a = parse(inicio)
  const b = parse(fin)
  const base = (b.y - a.y) * 12 + (b.m - a.m)
  const daysDiff = (x: string, y: string): number =>
    Math.round((Date.parse(x + 'T00:00:00Z') - Date.parse(y + 'T00:00:00Z')) / 86400000)
  let best = Math.max(0, base)
  let bestDiff = Infinity
  for (let n = Math.max(0, base - 1); n <= base + 2; n++) {
    const cand = addMonthsISO(inicio, n)
    const diff = Math.abs(daysDiff(cand, fin))
    if (diff < bestDiff) {
      bestDiff = diff
      best = n
    }
  }
  return best
}

/** Días entre hoy y una fecha ISO (positivo = futuro). */
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const target = Date.parse(iso.slice(0, 10) + 'T00:00:00Z')
  const now = Date.parse(todayISO() + 'T00:00:00Z')
  return Math.round((target - now) / 86400000)
}
