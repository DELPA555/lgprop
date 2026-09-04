// Aplica una actualización de alquiler "a mano" (el usuario marca que ya se
// actualizó), sin depender de que exista una actualización pendiente generada
// por el sistema. Registra el movimiento en actualizaciones_contrato, avanza el
// monto_actual y recalcula proxima_actualizacion según la frecuencia del contrato.
import { supabase } from '@/lib/supabase/client'
import type { Contrato } from '@/types/database'
import { addMonthsISO, todayISO } from '@/lib/dates'

// Calcula la próxima fecha de actualización tras marcar una: avanza por la
// frecuencia del contrato desde la fecha vigente hasta superar hoy. null si
// supera el fin del contrato.
export function proximaTrasActualizar(contrato: Contrato): string | null {
  const hoy = todayISO()
  const freq = contrato.frecuencia_actualizacion_meses || 1
  let next = contrato.proxima_actualizacion ?? hoy
  let guard = 0
  do {
    next = addMonthsISO(next, freq)
    guard++
  } while (next <= hoy && guard < 600)
  if (contrato.fecha_fin && next > contrato.fecha_fin) return null
  return next
}

export async function aplicarActualizacionManual(
  contrato: Contrato,
  montoNuevo: number
): Promise<{ error?: string; nextProx: string | null }> {
  const hoy = todayISO()
  const nextProx = proximaTrasActualizar(contrato)
  // Fecha efectiva del aumento: la fecha que estaba pendiente si ya venció, si
  // no hoy (el usuario lo actualizó por su cuenta antes de tiempo).
  const fechaEfectiva =
    contrato.proxima_actualizacion && contrato.proxima_actualizacion <= hoy
      ? contrato.proxima_actualizacion
      : hoy

  const { data: userData } = await supabase.auth.getUser()
  const uid = userData?.user?.id ?? null

  // ¿Hay una actualización pendiente para este contrato? Si sí, la confirmamos
  // en lugar de crear una nueva (evita duplicados con el flujo automático).
  const { data: pend } = await supabase
    .from('actualizaciones_contrato')
    .select('*')
    .eq('contrato_id', contrato.id)
    .eq('confirmado_por_usuario', false)
    .order('fecha_calculo', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pend) {
    const upd = await supabase
      .from('actualizaciones_contrato')
      .update({
        confirmado_por_usuario: true,
        confirmado_at: new Date().toISOString(),
        confirmado_por: uid,
        monto_nuevo: montoNuevo
      })
      .eq('id', pend.id)
    if (upd.error) return { error: upd.error.message, nextProx }
  } else {
    const ins = await supabase.from('actualizaciones_contrato').insert({
      contrato_id: contrato.id,
      fecha_calculo: fechaEfectiva,
      monto_anterior: contrato.monto_actual,
      monto_nuevo: montoNuevo,
      indice_usado: contrato.indice_actualizacion,
      coeficiente: null,
      confirmado_por_usuario: true,
      confirmado_at: new Date().toISOString(),
      confirmado_por: uid
    })
    if (ins.error) return { error: ins.error.message, nextProx }
  }

  const upC = await supabase
    .from('contratos')
    .update({ monto_actual: montoNuevo, proxima_actualizacion: nextProx })
    .eq('id', contrato.id)
  if (upC.error) return { error: upC.error.message, nextProx }

  return { nextProx }
}
