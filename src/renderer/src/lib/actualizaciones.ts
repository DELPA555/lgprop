// Motor de cálculo de actualizaciones de alquiler.
// Puro: recibe el contrato + los valores de índices y devuelve el nuevo monto.
// NUNCA aplica cambios; solo calcula. La aplicación (con confirmación) vive en la UI.

import type { Contrato, IndiceValor, TipoIndice } from '@/types/database'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Valor del índice vigente a una fecha (último publicado con fecha <= objetivo). */
export function valorAtDate(
  valores: IndiceValor[],
  tipo: TipoIndice,
  fechaISO: string
): number | null {
  const target = fechaISO.slice(0, 10)
  let best: IndiceValor | null = null
  for (const v of valores) {
    if (v.tipo_indice !== tipo) continue
    if (v.fecha.slice(0, 10) > target) continue
    if (!best || v.fecha > best.fecha) best = v
  }
  return best ? best.valor : null
}

/** Coeficiente de un índice entre dos fechas = valor(nueva) / valor(anterior). */
export function coefIndice(
  valores: IndiceValor[],
  tipo: TipoIndice,
  fechaAnterior: string,
  fechaNueva: string
): number | null {
  const vAnt = valorAtDate(valores, tipo, fechaAnterior)
  const vNue = valorAtDate(valores, tipo, fechaNueva)
  if (vAnt == null || vNue == null || vAnt === 0) return null
  return vNue / vAnt
}

export interface CalculoResult {
  ok: boolean
  manual?: boolean
  montoNuevo: number
  coeficiente: number | null
  indiceUsado: TipoIndice
  detalle: string
  motivo?: string
}

/**
 * Calcula el nuevo monto de un contrato para una actualización.
 * @param fechaAnterior  fecha de la última actualización (o inicio del contrato)
 * @param fechaNueva     fecha de esta actualización
 */
export function calcularActualizacion(
  contrato: Contrato,
  fechaAnterior: string,
  fechaNueva: string,
  valores: IndiceValor[]
): CalculoResult {
  const montoActual = contrato.monto_actual
  const modo = contrato.indice_actualizacion

  const fail = (indice: TipoIndice, motivo: string): CalculoResult => ({
    ok: false,
    montoNuevo: montoActual,
    coeficiente: null,
    indiceUsado: indice,
    detalle: motivo,
    motivo
  })

  if (modo === 'Manual') {
    return {
      ok: true,
      manual: true,
      montoNuevo: montoActual,
      coeficiente: null,
      indiceUsado: 'Manual',
      detalle: 'Ingresá el nuevo monto a mano'
    }
  }

  if (modo === 'Porcentaje fijo') {
    const pct = contrato.porcentaje_fijo ?? 0
    const coef = 1 + pct / 100
    return {
      ok: true,
      montoNuevo: round2(montoActual * coef),
      coeficiente: coef,
      indiceUsado: 'Porcentaje fijo',
      detalle: `+${pct}% fijo`
    }
  }

  if (modo === 'Combinado') {
    const a = contrato.indice_primario
    const b = contrato.indice_secundario
    if (!a || !b) return fail('Combinado', 'El contrato no tiene los dos índices del combinado')
    const ca = coefIndice(valores, a, fechaAnterior, fechaNueva)
    const cb = coefIndice(valores, b, fechaAnterior, fechaNueva)
    if (ca == null || cb == null) {
      const faltan = [ca == null ? a : null, cb == null ? b : null].filter(Boolean).join(' y ')
      return fail('Combinado', `Faltan valores de ${faltan} en el período`)
    }
    const coef = (ca + cb) / 2
    return {
      ok: true,
      montoNuevo: round2(montoActual * coef),
      coeficiente: coef,
      indiceUsado: 'Combinado',
      detalle: `Promedio ${a} (${ca.toFixed(4)}) y ${b} (${cb.toFixed(4)})`
    }
  }

  // Índice simple: ICL / IPC / UVA / Casa Propia
  const coef = coefIndice(valores, modo, fechaAnterior, fechaNueva)
  if (coef == null) return fail(modo, `Falta el valor de ${modo} para el período`)
  return {
    ok: true,
    montoNuevo: round2(montoActual * coef),
    coeficiente: coef,
    indiceUsado: modo,
    detalle: `Coeficiente ${modo} ${coef.toFixed(4)}`
  }
}
