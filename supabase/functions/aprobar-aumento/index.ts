// ════════════════════════════════════════════════════════════════════════════
// Edge Function PÚBLICA (API JSON): aprobar-aumento  (deploy con --no-verify-jwt)
// La página estática docs/aprobar.html (GitHub Pages) consume esta API. Se hace
// así porque el gateway de funciones fuerza text/plain + CSP sandbox y no sirve
// para renderizar HTML. La mutación va por POST (el GET solo consulta), así un
// prefetch del link del email no aprueba solo.
//
// GET  ?token=UUID            -> { ok, valido, estado?, error?, propiedad, montoAnterior, montoNuevo, moneda }
// POST { token, accion }      -> { ok, estado } | { ok:false, error }
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy: supabase functions deploy aprobar-aumento --no-verify-jwt
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}
const json = (b: unknown, s = 200): Response =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

interface Ctx {
  id: string
  monto_anterior: number
  monto_nuevo: number
  aprobacion_estado: string | null
  aprobacion_token_expira: string | null
  confirmado_por_usuario: boolean
  moneda: string
  direccion: string
}

async function fetchCtx(token: string): Promise<Ctx | null> {
  const { data: act } = await admin
    .from('actualizaciones_contrato')
    .select(
      'id, contrato_id, monto_anterior, monto_nuevo, aprobacion_estado, aprobacion_token_expira, confirmado_por_usuario'
    )
    .eq('aprobacion_token', token)
    .maybeSingle()
  if (!act) return null
  const { data: ctr } = await admin
    .from('contratos')
    .select('moneda, propiedad_id')
    .eq('id', act.contrato_id)
    .maybeSingle()
  const { data: prop } = ctr
    ? await admin.from('propiedades').select('direccion').eq('id', ctr.propiedad_id).maybeSingle()
    : { data: null }
  return {
    id: act.id,
    monto_anterior: act.monto_anterior,
    monto_nuevo: act.monto_nuevo,
    aprobacion_estado: act.aprobacion_estado,
    aprobacion_token_expira: act.aprobacion_token_expira,
    confirmado_por_usuario: act.confirmado_por_usuario,
    moneda: ctr?.moneda ?? 'ARS',
    direccion: prop?.direccion ?? 'la propiedad'
  }
}

// Motivo por el que el link ya no se puede operar (o null si sigue pendiente/vigente)
function invalidez(c: Ctx): string | null {
  if (c.confirmado_por_usuario) return 'Este aumento ya fue aplicado en el sistema.'
  if (c.aprobacion_estado === 'aprobado') return 'Ya habías APROBADO este aumento.'
  if (c.aprobacion_estado === 'rechazado') return 'Ya habías RECHAZADO este aumento.'
  if (c.aprobacion_estado !== 'pendiente') return 'Este enlace no está disponible.'
  if (c.aprobacion_token_expira && new Date(c.aprobacion_token_expira) < new Date())
    return 'El enlace venció. Pedile a la administración que te reenvíe la solicitud.'
  return null
}

const detalle = (c: Ctx): Record<string, unknown> => ({
  propiedad: c.direccion,
  montoAnterior: c.monto_anterior,
  montoNuevo: c.monto_nuevo,
  moneda: c.moneda,
  estado: c.aprobacion_estado
})

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    if (req.method === 'GET') {
      const token = new URL(req.url).searchParams.get('token') ?? ''
      const c = token ? await fetchCtx(token) : null
      if (!c) return json({ ok: true, valido: false, error: 'El enlace no es válido.' })
      const err = invalidez(c)
      return json({ ok: true, valido: !err, error: err, ...detalle(c) })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      const token = String(body?.token ?? '')
      const accion = String(body?.accion ?? '') === 'rechazar' ? 'rechazar' : 'aprobar'
      const c = token ? await fetchCtx(token) : null
      if (!c) return json({ ok: false, error: 'El enlace no es válido.' }, 400)
      const err = invalidez(c)
      if (err) return json({ ok: false, error: err, ...detalle(c) }, 409)

      const nuevoEstado = accion === 'aprobar' ? 'aprobado' : 'rechazado'
      const { error, count } = await admin
        .from('actualizaciones_contrato')
        .update(
          { aprobacion_estado: nuevoEstado, aprobacion_respondido_at: new Date().toISOString() },
          { count: 'exact' }
        )
        .eq('id', c.id)
        .eq('aprobacion_token', token)
        .eq('aprobacion_estado', 'pendiente') // single-use / guard de concurrencia
      if (error) return json({ ok: false, error: error.message }, 500)
      if (!count) return json({ ok: false, error: 'La solicitud ya fue respondida.' }, 409)
      return json({ ok: true, ...detalle(c), estado: nuevoEstado })
    }

    return json({ ok: false, error: 'Método no permitido' }, 405)
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
