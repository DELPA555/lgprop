// ════════════════════════════════════════════════════════════════════════════
// Edge Function: enviar-avisos
// Motor de avisos. Detecta 4 situaciones y genera notificaciones + un email
// resumen (digest) para el equipo. Diseñado para correr por cron (diario).
//
//   1. Contratos que vencen dentro de 60 días.
//   2. Contratos con actualización de monto pendiente (proxima_actualizacion <= hoy).
//      → NO auto-aplica el aumento: solo avisa. El cálculo y la confirmación se
//        hacen desde la app.
//   3. Pagos atrasados (en mora).
//   4. Expensas pendientes de conciliar.
//
// Idempotencia: no re-crea una notificación del mismo tipo+contrato si ya hay
// una sin leer creada en los últimos 25 días.
//
// Lenguaje de los emails: claro y profesional, sin tono acusatorio.
//
// Secrets requeridos:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, EMAIL_FROM, AVISOS_EMAIL_TO
// Deploy:  supabase functions deploy enviar-avisos
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const HOY = new Date().toISOString().slice(0, 10)
const enDias = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

type Tipo =
  | 'vencimiento_contrato'
  | 'actualizacion_monto'
  | 'pago_atrasado'
  | 'expensas_pendientes'
  | 'deposito_pendiente'
  | 'seguro_por_vencer'
  | 'expensas_liquidacion_pendiente'
  | 'expensa_impaga'
  | 'reclamo_sin_resolver'
  | 'visita_proxima'

interface NuevaNotif {
  tipo: Tipo
  contrato_id: string | null
  titulo: string
  mensaje: string
  metadata?: Record<string, unknown>
}

// Clave de deduplicación: usa el contrato o, si no hay (ej. seguros), el id en metadata.
function dedupeKey(n: { tipo: string; contrato_id: string | null; metadata?: Record<string, unknown> | null }): string {
  const ref =
    n.contrato_id ??
    (n.metadata?.seguro_id as string | undefined) ??
    (n.metadata?.ref as string | undefined) ??
    ''
  return `${n.tipo}|${ref}`
}

async function enviarEmail(asunto: string, html: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM')
  const to = Deno.env.get('AVISOS_EMAIL_TO')
  if (!apiKey || !from || !to) {
    console.warn('[enviar-avisos] Falta RESEND_API_KEY / EMAIL_FROM / AVISOS_EMAIL_TO; no se envía email.')
    return false
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: to.split(',').map((s) => s.trim()), subject: asunto, html })
  })
  if (!res.ok) {
    console.error('[enviar-avisos] Resend error', res.status, await res.text())
    return false
  }
  return true
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const pendientes: NuevaNotif[] = []

  // Días de anticipación configurables (Ajustes → default 60)
  let diasAnticipacion = 60
  {
    const { data } = await supabase
      .from('configuracion')
      .select('valor')
      .eq('clave', 'avisos_dias_anticipacion_contrato')
      .maybeSingle()
    const n = parseInt(data?.valor ?? '', 10)
    if (Number.isFinite(n) && n > 0) diasAnticipacion = n
  }

  // Config del módulo Consorcios
  const cfgInt = async (clave: string, def: number): Promise<number> => {
    const { data } = await supabase.from('configuracion').select('valor').eq('clave', clave).maybeSingle()
    const n = parseInt(data?.valor ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : def
  }
  const corteLiquidacionDia = await cfgInt('consorcios_corte_liquidacion_dia', 10)
  const reclamoDiasAlerta = await cfgInt('consorcios_reclamo_dias_alerta', 15)

  // Nota: solo se avisa por propiedades ADMINISTRADAS por LG Prop. Las cargadas
  // como referencia (administrada = false) no generan avisos de ningún tipo.

  // 1) Vencimientos de contrato dentro de la anticipación configurada
  {
    const { data } = await supabase
      .from('contratos')
      .select('id, fecha_fin, propiedades!inner(direccion, administrada)')
      .eq('estado', 'activo')
      .eq('propiedades.administrada', true)
      .gte('fecha_fin', HOY)
      .lte('fecha_fin', enDias(diasAnticipacion))
    for (const c of data ?? []) {
      const dir = (c as any).propiedades?.direccion ?? 'la propiedad'
      pendientes.push({
        tipo: 'vencimiento_contrato',
        contrato_id: c.id,
        titulo: `Contrato próximo a vencer — ${dir}`,
        mensaje: `El contrato de ${dir} finaliza el ${c.fecha_fin}. Conviene coordinar la renovación o la desocupación con la debida anticipación.`
      })
    }
  }

  // 2) Actualizaciones de monto pendientes (no se auto-aplican)
  {
    const { data } = await supabase
      .from('contratos')
      .select(
        'id, monto_actual, indice_actualizacion, proxima_actualizacion, propiedades!inner(direccion, administrada)'
      )
      .eq('estado', 'activo')
      .eq('propiedades.administrada', true)
      .not('proxima_actualizacion', 'is', null)
      .lte('proxima_actualizacion', enDias(7))
    for (const c of data ?? []) {
      const dir = (c as any).propiedades?.direccion ?? 'la propiedad'
      pendientes.push({
        tipo: 'actualizacion_monto',
        contrato_id: c.id,
        titulo: `Corresponde actualizar el alquiler — ${dir}`,
        mensaje: `El contrato de ${dir} tiene una actualización prevista para el ${c.proxima_actualizacion} según el índice ${c.indice_actualizacion}. Revisá el cálculo en la app y confirmalo para aplicarlo.`
      })
    }
  }

  // 3) Pagos atrasados
  {
    const { data } = await supabase
      .from('pagos')
      .select(
        'id, contrato_id, mes_correspondiente, monto, contratos!inner(propiedades!inner(direccion, administrada))'
      )
      .eq('estado', 'atrasado')
      .eq('contratos.propiedades.administrada', true)
    for (const p of data ?? []) {
      const dir = (p as any).contratos?.propiedades?.direccion ?? 'la propiedad'
      pendientes.push({
        tipo: 'pago_atrasado',
        contrato_id: p.contrato_id,
        titulo: `Pago pendiente de registrar — ${dir}`,
        mensaje: `Figura sin registrar el pago del período ${String(p.mes_correspondiente).slice(0, 7)} de ${dir}. Verificá si el pago fue recibido para actualizar el estado.`
      })
    }
  }

  // 4) Expensas pendientes de conciliar (meses ya vencidos)
  {
    const { data } = await supabase
      .from('pagos')
      .select(
        'id, contrato_id, mes_correspondiente, contratos!inner(propiedades!inner(direccion, administrada))'
      )
      .eq('expensas_pagadas', false)
      .eq('contratos.propiedades.administrada', true)
      .lte('mes_correspondiente', HOY)
    for (const p of data ?? []) {
      const dir = (p as any).contratos?.propiedades?.direccion ?? 'la propiedad'
      pendientes.push({
        tipo: 'expensas_pendientes',
        contrato_id: p.contrato_id,
        titulo: `Expensas por conciliar — ${dir}`,
        mensaje: `Quedan expensas sin conciliar del período ${String(p.mes_correspondiente).slice(0, 7)} en ${dir}.`
      })
    }
  }

  // 5) Depósitos pendientes de devolución (contratos finalizados, depósito retenido)
  {
    const { data } = await supabase
      .from('contratos')
      .select('id, monto_deposito, propiedades!inner(direccion, administrada)')
      .eq('propiedades.administrada', true)
      .in('estado', ['vencido', 'rescindido'])
      .eq('estado_deposito', 'retenido')
      .gt('monto_deposito', 0)
    for (const c of data ?? []) {
      const dir = (c as any).propiedades?.direccion ?? 'la propiedad'
      const monto = Number((c as any).monto_deposito || 0).toLocaleString('es-AR')
      pendientes.push({
        tipo: 'deposito_pendiente',
        contrato_id: c.id,
        titulo: `Depósito por devolver — ${dir}`,
        mensaje: `El contrato de ${dir} está finalizado y el depósito en garantía ($${monto}) sigue retenido. Coordiná la devolución con el inquilino y marcá el depósito como devuelto en la app.`
      })
    }
  }

  // 6) Seguros / ART por vencer (misma anticipación configurada que los contratos)
  {
    const { data } = await supabase
      .from('seguros_propiedad')
      .select('id, tipo, aseguradora, fecha_vencimiento, propiedades!inner(direccion, administrada)')
      .eq('propiedades.administrada', true)
      .gte('fecha_vencimiento', HOY)
      .lte('fecha_vencimiento', enDias(diasAnticipacion))
    for (const s of data ?? []) {
      const dir = (s as any).propiedades?.direccion ?? 'la propiedad'
      const nombre = s.tipo === 'art' ? 'La ART' : s.tipo === 'seguro' ? 'El seguro' : 'La póliza'
      const aseg = (s as any).aseguradora ? ` (${(s as any).aseguradora})` : ''
      pendientes.push({
        tipo: 'seguro_por_vencer',
        contrato_id: null,
        metadata: { seguro_id: s.id },
        titulo: `Seguro por vencer — ${dir}`,
        mensaje: `${nombre}${aseg} de ${dir} vence el ${s.fecha_vencimiento}. Gestioná la renovación antes de esa fecha.`
      })
    }
  }

  // ── Consorcios ────────────────────────────────────────────────────────────

  // 7) Liquidación del mes anterior sin generar (pasado el día de corte)
  {
    const hoyDate = new Date(HOY + 'T00:00:00Z')
    if (hoyDate.getUTCDate() >= corteLiquidacionDia) {
      const prev = new Date(Date.UTC(hoyDate.getUTCFullYear(), hoyDate.getUTCMonth() - 1, 1))
      const mesAnterior = prev.toISOString().slice(0, 10)
      const mesLabel = `${String(prev.getUTCMonth() + 1).padStart(2, '0')}/${prev.getUTCFullYear()}`
      const { data: cons } = await supabase.from('consorcios').select('id, nombre')
      for (const c of cons ?? []) {
        const { count: uni } = await supabase
          .from('unidades_funcionales')
          .select('*', { count: 'exact', head: true })
          .eq('consorcio_id', c.id)
        if (!uni || uni === 0) continue
        const { count: liq } = await supabase
          .from('liquidaciones_expensas')
          .select('*', { count: 'exact', head: true })
          .eq('consorcio_id', c.id)
          .eq('mes', mesAnterior)
        if (liq && liq > 0) continue
        pendientes.push({
          tipo: 'expensas_liquidacion_pendiente',
          contrato_id: null,
          metadata: { ref: `liq|${c.id}|${mesAnterior}` },
          titulo: `Falta generar expensas — ${c.nombre}`,
          mensaje: `Todavía no se generó la liquidación de expensas de ${mesLabel} para ${c.nombre}. Generala en Consorcios → detalle → Liquidación de expensas.`
        })
      }
    }
  }

  // 8) Expensas de una unidad sin pagar, de meses ya vencidos
  {
    const monthStart = HOY.slice(0, 7) + '-01'
    const { data: liqs } = await supabase
      .from('liquidaciones_expensas')
      .select('id, mes, consorcios(nombre)')
      .lt('mes', monthStart)
    const liqMap = new Map((liqs ?? []).map((l) => [l.id, l]))
    const ids = (liqs ?? []).map((l) => l.id)
    if (ids.length > 0) {
      const { data: exps } = await supabase
        .from('expensas_por_unidad')
        .select('id, liquidacion_id, identificador, monto_a_pagar, estado')
        .in('liquidacion_id', ids)
        .neq('estado', 'pagado')
      for (const e of exps ?? []) {
        const l = liqMap.get(e.liquidacion_id) as any
        const nombre = l?.consorcios?.nombre ?? 'el consorcio'
        const mesL = String(l?.mes ?? '').slice(0, 7)
        const monto = Number(e.monto_a_pagar || 0).toLocaleString('es-AR')
        pendientes.push({
          tipo: 'expensa_impaga',
          contrato_id: null,
          metadata: { ref: `exp|${e.id}` },
          titulo: `Expensa impaga — ${nombre} (${e.identificador ?? 'unidad'})`,
          mensaje: `La unidad ${e.identificador ?? ''} de ${nombre} tiene la expensa de ${mesL} sin pagar ($${monto}). Verificá el cobro.`
        })
      }
    }
  }

  // 9) Reclamos de consorcio sin resolver hace más de N días
  {
    const limite = enDias(-reclamoDiasAlerta)
    const { data } = await supabase
      .from('reclamos_consorcio')
      .select('id, descripcion, fecha_reporte, consorcios(nombre)')
      .neq('estado', 'resuelto')
      .lte('fecha_reporte', limite)
    for (const r of data ?? []) {
      const nombre = (r as any)?.consorcios?.nombre ?? 'un consorcio'
      pendientes.push({
        tipo: 'reclamo_sin_resolver',
        contrato_id: null,
        metadata: { ref: `rec|${r.id}` },
        titulo: `Reclamo sin resolver — ${nombre}`,
        mensaje: `Hay un reclamo abierto desde el ${r.fecha_reporte} en ${nombre}: "${String(r.descripcion).slice(0, 120)}". Pasaron más de ${reclamoDiasAlerta} días.`
      })
    }
  }

  // 10) Agenda: visitas programadas en las próximas ~48 h (recordatorio)
  {
    const ahora = new Date().toISOString()
    const en48 = new Date(Date.now() + 48 * 3600 * 1000).toISOString()
    const { data } = await supabase
      .from('visitas')
      .select('id, fecha, visitante, propiedades(direccion)')
      .eq('estado', 'programada')
      .gte('fecha', ahora)
      .lte('fecha', en48)
    for (const v of data ?? []) {
      const dir = (v as any)?.propiedades?.direccion ?? v.visitante ?? 'una propiedad'
      const cuando = new Date(v.fecha).toLocaleString('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short'
      })
      pendientes.push({
        tipo: 'visita_proxima',
        contrato_id: null,
        metadata: { ref: `vis|${v.id}` },
        titulo: `Visita próxima — ${dir}`,
        mensaje: `Hay una visita agendada para el ${cuando}${v.visitante ? ` con ${v.visitante}` : ''} en ${dir}. Coordiná los detalles con anticipación.`
      })
    }
  }

  // Dedup contra notificaciones recientes sin leer
  const { data: recientes } = await supabase
    .from('notificaciones')
    .select('tipo, contrato_id, metadata')
    .eq('leida', false)
    .gte('created_at', enDias(-25))
  const yaExiste = new Set((recientes ?? []).map((r) => dedupeKey(r as any)))

  const aInsertar = pendientes.filter((n) => !yaExiste.has(dedupeKey(n)))

  let creadas = 0
  if (aInsertar.length > 0) {
    const { error, count } = await supabase
      .from('notificaciones')
      .insert(aInsertar.map((n) => ({ ...n, email_enviado: true })), { count: 'exact' })
    if (!error) creadas = count ?? aInsertar.length
  }

  // Email digest al equipo
  if (aInsertar.length > 0) {
    const grupos: Record<Tipo, NuevaNotif[]> = {
      vencimiento_contrato: [],
      actualizacion_monto: [],
      pago_atrasado: [],
      expensas_pendientes: [],
      deposito_pendiente: [],
      seguro_por_vencer: [],
      expensas_liquidacion_pendiente: [],
      expensa_impaga: [],
      reclamo_sin_resolver: [],
      visita_proxima: []
    }
    for (const n of aInsertar) grupos[n.tipo].push(n)

    const titulos: Record<Tipo, string> = {
      vencimiento_contrato: 'Contratos por vencer',
      actualizacion_monto: 'Actualizaciones de alquiler pendientes',
      pago_atrasado: 'Pagos por registrar',
      expensas_pendientes: 'Expensas por conciliar',
      deposito_pendiente: 'Depósitos por devolver',
      seguro_por_vencer: 'Seguros / ART por vencer',
      expensas_liquidacion_pendiente: 'Consorcios · liquidaciones por generar',
      expensa_impaga: 'Consorcios · expensas impagas',
      reclamo_sin_resolver: 'Consorcios · reclamos sin resolver',
      visita_proxima: 'Agenda · visitas próximas'
    }

    const secciones = (Object.keys(grupos) as Tipo[])
      .filter((k) => grupos[k].length)
      .map(
        (k) => `
          <h3 style="margin:18px 0 8px;color:#2563eb;font-size:14px">${titulos[k]} (${grupos[k].length})</h3>
          <ul style="margin:0;padding-left:18px;color:#374151;font-size:13px;line-height:1.6">
            ${grupos[k].map((n) => `<li><b>${n.titulo}</b><br/>${n.mensaje}</li>`).join('')}
          </ul>`
      )
      .join('')

    const html = `
      <div style="font-family:Inter,Arial,sans-serif;max-width:640px;margin:0 auto">
        <div style="background:#0b0d12;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
          <div style="font-size:18px;font-weight:700">LG Prop</div>
          <div style="font-size:12px;color:#9ca3af">Resumen de avisos · ${HOY}</div>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:16px 24px">
          <p style="color:#374151;font-size:13px">Hola equipo, estos son los puntos que requieren atención hoy:</p>
          ${secciones}
          <p style="color:#9ca3af;font-size:11px;margin-top:20px">
            Este es un aviso automático de gestión interna. Revisá y confirmá cada acción desde la aplicación LG Prop.
          </p>
        </div>
      </div>`

    await enviarEmail(`LG Prop — ${aInsertar.length} aviso(s) del día`, html)
  }

  return new Response(
    JSON.stringify({ ok: true, detectadas: pendientes.length, creadas }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
