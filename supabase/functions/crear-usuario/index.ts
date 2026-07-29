// ════════════════════════════════════════════════════════════════════════════
// Edge Function: crear-usuario
// Crea un usuario del equipo. Solo puede invocarla un admin activo.
// Pasos: identifica al que llama por su JWT → verifica rol admin → crea el auth
// user (service role) → inserta la fila en usuarios_equipo. Si falla la fila,
// revierte el auth user.
//
// Se llama desde la app con supabase.functions.invoke('crear-usuario', { body }).
// Deploy: supabase functions deploy crear-usuario
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // 1) Identificar al que llama por su token
    const asCaller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: userData } = await asCaller.auth.getUser()
    const caller = userData?.user
    if (!caller) return json({ ok: false, error: 'No autenticado' }, 401)

    // 2) Verificar que es admin activo (con service role para no depender de RLS)
    const admin = createClient(url, service)
    const { data: me } = await admin
      .from('usuarios_equipo')
      .select('rol, activo')
      .eq('auth_user_id', caller.id)
      .maybeSingle()
    if (!me || me.rol !== 'admin' || !me.activo) {
      return json({ ok: false, error: 'Se requiere rol de administrador' }, 403)
    }

    // 3) Validar entrada
    const { nombre, email, password, rol } = await req.json()
    if (!nombre || !email || !password) {
      return json({ ok: false, error: 'Faltan datos (nombre, email o contraseña)' }, 400)
    }

    // 4) Crear el usuario en Auth
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })
    if (cErr || !created?.user) {
      return json({ ok: false, error: cErr?.message ?? 'No se pudo crear la cuenta' }, 400)
    }

    // 5) Insertar la fila del equipo (rollback del auth user si falla)
    const { error: iErr } = await admin.from('usuarios_equipo').insert({
      auth_user_id: created.user.id,
      nombre,
      email,
      rol: rol === 'admin' ? 'admin' : 'operador',
      activo: true
    })
    if (iErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ ok: false, error: iErr.message }, 400)
    }

    return json({ ok: true, id: created.user.id })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
