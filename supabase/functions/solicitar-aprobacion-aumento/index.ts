// ════════════════════════════════════════════════════════════════════════════
// Edge Function: solicitar-aprobacion-aumento  (requiere miembro activo)
// Genera un token firmado (único + con vencimiento) para una actualización de
// monto pendiente y le manda al DUEÑO un email con dos links: aprobar / rechazar.
// El aumento no se puede confirmar en la app hasta que el dueño apruebe.
//
// Body: { actualizacion_id: string }
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          RESEND_API_KEY, EMAIL_FROM
// Deploy: supabase functions deploy solicitar-aprobacion-aumento
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (b: unknown, s = 200): Response =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const DIAS_VALIDEZ = 14

function money(n: number, moneda: string): string {
  const [int, dec] = (Math.round(Number(n) * 100) / 100).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${moneda === 'USD' ? 'US$' : '$'} ${grouped},${dec}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1) Verificar miembro activo
    const authHeader = req.headers.get('Authorization') ?? ''
    const asCaller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: userData } = await asCaller.auth.getUser()
    const caller = userData?.user
    if (!caller) return json({ ok: false, error: 'No autenticado' }, 401)
    const { data: me } = await asCaller
      .from('usuarios_equipo')
      .select('activo')
      .eq('auth_user_id', caller.id)
      .maybeSingle()
    if (!me || !me.activo) return json({ ok: false, error: 'Sin acceso' }, 403)

    const { actualizacion_id } = await req.json()
    if (!actualizacion_id) return json({ ok: false, error: 'Falta actualizacion_id' }, 400)

    const admin = createClient(url, service)

    // 2) Traer la actualización + contrato + propiedad + dueño + inquilino
    const { data: act } = await admin
      .from('actualizaciones_contrato')
      .select('id, contrato_id, monto_anterior, monto_nuevo, fecha_calculo, indice_usado, confirmado_por_usuario')
      .eq('id', actualizacion_id)
      .maybeSingle()
    if (!act) return json({ ok: false, error: 'No se encontró la actualización' }, 404)
    if (act.confirmado_por_usuario)
      return json({ ok: false, error: 'Esa actualización ya fue confirmada' }, 400)

    const { data: ctr } = await admin
      .from('contratos')
      .select('id, moneda, dueno_id, propiedad_id, inquilino_id')
      .eq('id', act.contrato_id)
      .maybeSingle()
    if (!ctr) return json({ ok: false, error: 'No se encontró el contrato' }, 404)

    const [{ data: prop }, { data: inq }] = await Promise.all([
      admin.from('propiedades').select('direccion, dueno_id').eq('id', ctr.propiedad_id).maybeSingle(),
      admin.from('inquilinos').select('nombre').eq('id', ctr.inquilino_id).maybeSingle()
    ])
    const duenoId = prop?.dueno_id ?? ctr.dueno_id
    if (!duenoId) return json({ ok: false, error: 'El contrato no tiene dueño asignado' }, 400)
    const { data: dueno } = await admin
      .from('duenos')
      .select('nombre, email')
      .eq('id', duenoId)
      .maybeSingle()
    if (!dueno?.email)
      return json({ ok: false, error: 'El dueño no tiene email cargado. Cargalo en su ficha.' }, 400)

    // 3) Generar token + vencimiento y guardarlo
    const token = crypto.randomUUID()
    const expira = new Date(Date.now() + DIAS_VALIDEZ * 86400 * 1000).toISOString()
    const upd = await admin
      .from('actualizaciones_contrato')
      .update({
        aprobacion_estado: 'pendiente',
        aprobacion_token: token,
        aprobacion_token_expira: expira,
        aprobacion_solicitada_at: new Date().toISOString(),
        aprobacion_respondido_at: null
      })
      .eq('id', act.id)
    if (upd.error) return json({ ok: false, error: upd.error.message }, 500)

    // 4) Email al dueño con los dos links (página estática que consume la API)
    const pageBase =
      Deno.env.get('APROBACION_BASE_URL') ?? 'https://delpa555.github.io/lgprop/aprobar.html'
    const base = `${pageBase}?token=${token}`
    const linkAprobar = `${base}&accion=aprobar`
    const linkRechazar = `${base}&accion=rechazar`
    const moneda = ctr.moneda ?? 'ARS'
    const pct =
      act.monto_anterior > 0
        ? (((act.monto_nuevo - act.monto_anterior) / act.monto_anterior) * 100).toFixed(1)
        : '0'
    const dir = prop?.direccion ?? 'la propiedad'

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
        <div style="background:#0a0d12;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
          <div style="font-size:18px;font-weight:700">LG Prop</div>
          <div style="font-size:12px;color:#9ca3af">Aprobación de aumento de alquiler</div>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:20px 24px">
          <p>Hola ${dueno.nombre ?? ''}, se calculó una actualización del alquiler de tu propiedad y
          queremos tu aprobación antes de comunicársela al inquilino.</p>
          <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse">
            <tr><td style="color:#6b7280;padding:4px 0">Propiedad</td><td style="text-align:right"><b>${dir}</b></td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Inquilino</td><td style="text-align:right">${inq?.nombre ?? '-'}</td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Índice</td><td style="text-align:right">${act.indice_usado}</td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Monto actual</td><td style="text-align:right">${money(act.monto_anterior, moneda)}</td></tr>
            <tr><td style="color:#6b7280;padding:8px 0"><b>Monto propuesto</b></td><td style="text-align:right;font-size:16px"><b>${money(act.monto_nuevo, moneda)}</b> <span style="color:#059669">(+${pct}%)</span></td></tr>
          </table>
          <div style="text-align:center;margin:22px 0">
            <a href="${linkAprobar}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:600;margin:0 6px">Aprobar</a>
            <a href="${linkRechazar}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:600;margin:0 6px">Rechazar</a>
          </div>
          <p style="color:#9ca3af;font-size:12px">El enlace es personal y vence en ${DIAS_VALIDEZ} días.
          Al tocar un botón vas a ver una pantalla para confirmar tu decisión.</p>
        </div>
      </div>`

    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('EMAIL_FROM')
    if (!apiKey || !from)
      return json({ ok: false, error: 'Falta configurar RESEND_API_KEY / EMAIL_FROM' }, 500)
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [dueno.email],
        subject: `Aprobación de aumento — ${dir}`,
        html
      })
    })
    if (!res.ok) {
      const t = await res.text()
      return json({ ok: false, error: `No se pudo enviar el email: ${t}` }, 502)
    }

    return json({ ok: true, email: dueno.email })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
