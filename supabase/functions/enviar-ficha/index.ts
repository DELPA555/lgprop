// ════════════════════════════════════════════════════════════════════════════
// Edge Function: enviar-ficha
// Envía por email (Resend) la ficha de una propiedad (de cara al cliente), con
// el PDF adjunto. La app sube la ficha al bucket privado 'fotos-propiedades'
// (fichas/<propiedad_id>.pdf) y pasa su path; acá se baja con service role.
//
// Solo la puede invocar un miembro activo del equipo (JWT).
// Deploy: supabase functions deploy enviar-ficha
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//          RESEND_API_KEY, EMAIL_FROM
// ⚠️ Con EMAIL_FROM en onboarding@resend.dev solo se envía a la casilla dueña.
//    Para mandar a clientes reales hay que verificar un dominio propio en Resend.
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

const BUCKET = 'fotos-propiedades'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // 1) Validar miembro activo
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
    const { pdf_path, to, direccion, titulo } = await req.json()
    if (!pdf_path) return json({ ok: false, error: 'Falta pdf_path' }, 400)
    const destino: string = (to || '').trim()
    if (!destino) return json({ ok: false, error: 'Falta el email de destino' }, 400)

    // Seguridad: solo permitir paths dentro de la carpeta de fichas
    if (!String(pdf_path).startsWith('fichas/')) {
      return json({ ok: false, error: 'Ruta de ficha inválida' }, 400)
    }

    // 3) Bajar el PDF del bucket privado
    const { data: file, error: dErr } = await admin.storage.from(BUCKET).download(pdf_path)
    if (dErr || !file) return json({ ok: false, error: 'No se pudo leer la ficha' }, 500)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const b64 = toBase64(bytes)

    // 4) Enviar por Resend
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const from = Deno.env.get('EMAIL_FROM')
    if (!apiKey || !from) return json({ ok: false, error: 'Email no configurado (Resend)' }, 500)

    const dir = String(direccion || 'la propiedad')
    const tit = String(titulo || 'Ficha de propiedad')
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1b2640;font-size:14px;line-height:1.6">
        <p>Hola,</p>
        <p>Te enviamos adjunta la <strong>ficha de la propiedad</strong>
        ${dir ? `ubicada en <strong>${dir}</strong>` : ''} (${tit}).</p>
        <p>Ante cualquier consulta, quedamos a disposición.</p>
        <p style="color:#6b7280;margin-top:24px">LG Propiedades</p>
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [destino],
        subject: `Ficha de propiedad — ${dir} — LG Propiedades`,
        html,
        attachments: [{ filename: 'ficha-propiedad.pdf', content: b64 }]
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
