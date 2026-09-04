// ════════════════════════════════════════════════════════════════════════════
// Edge Function: enviar-recibo
// Envía por email (Resend) el PDF de un recibo de reserva al reservante, con el
// PDF adjunto. Baja el PDF del bucket privado 'recibos-reserva' con service role.
//
// Solo la puede invocar un miembro activo del equipo (identificado por su JWT).
// Se llama desde la app: supabase.functions.invoke('enviar-recibo', { body }).
// Deploy: supabase functions deploy enviar-recibo
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          RESEND_API_KEY, EMAIL_FROM
// ⚠️ Con EMAIL_FROM en el dominio de prueba de Resend (onboarding@resend.dev)
//    solo se puede enviar a la casilla dueña de la cuenta. Para mandar a los
//    reservantes hay que verificar un dominio propio en Resend.
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  })
}

function toBase64(buf: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const BUCKET = 'recibos-reserva'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // 1) Identificar y validar al que llama (miembro activo)
    const asCaller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: userData } = await asCaller.auth.getUser()
    const caller = userData?.user
    if (!caller) return json({ ok: false, error: 'No autenticado' }, 401)

    const admin = createClient(url, service)
    const { data: me } = await admin
      .from('usuarios_equipo')
      .select('activo')
      .eq('auth_user_id', caller.id)
      .maybeSingle()
    if (!me || !me.activo) return json({ ok: false, error: 'Sin acceso' }, 403)

    // 2) Entrada
    const { recibo_id, to } = await req.json()
    if (!recibo_id) return json({ ok: false, error: 'Falta recibo_id' }, 400)

    // 3) Traer el recibo
    const { data: recibo, error: rErr } = await admin
      .from('recibos_reserva')
      .select('*')
      .eq('id', recibo_id)
      .maybeSingle()
    if (rErr || !recibo) return json({ ok: false, error: 'Recibo no encontrado' }, 404)

    const destino: string = (to || recibo.reservante_email || '').trim()
    if (!destino) return json({ ok: false, error: 'El reservante no tiene email cargado' }, 400)
    if (!recibo.pdf_path) return json({ ok: false, error: 'El recibo no tiene PDF guardado' }, 400)

    // 4) Bajar el PDF del bucket privado
    const { data: file, error: dErr } = await admin.storage.from(BUCKET).download(recibo.pdf_path)
    if (dErr || !file) return json({ ok: false, error: 'No se pudo leer el PDF' }, 500)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const b64 = toBase64(bytes)

    // 5) Enviar por Resend con el PDF adjunto
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('EMAIL_FROM')
    if (!apiKey || !from) return json({ ok: false, error: 'Email no configurado (Resend)' }, 500)

    const tipoLabel = recibo.tipo === 'locacion' ? 'locación' : 'venta'
    const numero = String(recibo.numero).padStart(6, '0')
    const filename = `recibo-reserva-${recibo.tipo}-${numero}.pdf`
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1b2640;font-size:14px;line-height:1.6">
        <p>Hola ${recibo.reservante_nombre},</p>
        <p>Te enviamos adjunto el <strong>recibo de reserva de ${tipoLabel}</strong>
        (N° ${numero}) correspondiente a <strong>${recibo.direccion}</strong>.</p>
        <p>Ante cualquier consulta, quedamos a disposición.</p>
        <p style="color:#6b7280;margin-top:24px">LG Propiedades — REG. ${recibo.registro}</p>
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [destino],
        subject: `Recibo de reserva de ${tipoLabel} N° ${numero} — LG Propiedades`,
        html,
        attachments: [{ filename, content: b64 }]
      })
    })
    if (!res.ok) {
      const detail = await res.text()
      return json({ ok: false, error: `Resend: ${res.status} ${detail}` }, 502)
    }

    return json({ ok: true, to: destino })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
