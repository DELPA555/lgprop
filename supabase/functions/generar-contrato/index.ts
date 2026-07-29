// ════════════════════════════════════════════════════════════════════════════
// Edge Function: generar-contrato
// Redacta un contrato de locación completo con la API de Claude (Anthropic) a
// partir de los datos que carga el usuario, usando una plantilla base con las
// cláusulas estándar de la locación de vivienda en Argentina. La API key NUNCA
// sale del backend. Guarda un registro en contratos_generados para trazabilidad.
//
// Solo la puede invocar un miembro activo del equipo.
//
// Requiere el secret ANTHROPIC_API_KEY:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Deploy: supabase functions deploy generar-contrato
//
// Body esperado: {
//   inquilino: { nombre, dni? }, dueno: { nombre }, propiedad: { direccion },
//   monto: number, fecha_inicio: 'YYYY-MM-DD', duracion_meses: number,
//   indice: string, frecuencia_meses: number, clausulas_particulares?: string,
//   contrato_id?: string|null
// }
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.68.0'

// claude-sonnet-5 es el equilibrio recomendado calidad/costo. Para máxima calidad usar 'claude-opus-5'.
const MODEL = 'claude-sonnet-5'

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

const SYSTEM = `Sos un abogado argentino especializado en derecho inmobiliario. Redactás
contratos de locación de vivienda claros, completos y profesionales, ajustados a la
legislación argentina vigente en materia de alquileres.

Instrucciones de redacción:
- Redactá el contrato COMPLETO, listo para imprimir y firmar, en español (Argentina).
- Estructurá con un encabezado, la identificación de las partes (LOCADOR y LOCATARIO) y
  cláusulas numeradas (PRIMERA, SEGUNDA, …) que cubran al menos: objeto y destino, plazo,
  precio y forma de pago, actualización del canon según el índice indicado, depósito en
  garantía, expensas y servicios, estado y conservación del inmueble, prohibiciones y
  obligaciones del locatario, causales de rescisión, garantías, domicilios constituidos y
  jurisdicción. Cerrá con lugar/fecha y espacios para firma y aclaración de ambas partes.
- Usá EXCLUSIVAMENTE los datos provistos. Donde falte un dato (por ejemplo el DNI del dueño
  o el garante) dejá una línea de puntos "_______________" para completar a mano.
- Integrá las cláusulas particulares del usuario tal como las pide, sin agregar cláusulas
  que no haya solicitado ni inventar montos, plazos ni condiciones.
- Tono profesional y legal. Devolvé SOLO el texto del contrato, sin comentarios previos ni
  posteriores y sin usar formato markdown (nada de #, *, ni bloques de código).`

function buildUserPrompt(b: Record<string, any>): string {
  const monto = typeof b.monto === 'number' ? b.monto.toLocaleString('es-AR') : b.monto
  const lines = [
    'Redactá un contrato de locación de vivienda con estos datos:',
    '',
    `- LOCADOR (dueño): ${b.dueno?.nombre ?? '(no informado)'}`,
    `- LOCATARIO (inquilino): ${b.inquilino?.nombre ?? '(no informado)'}` +
      (b.inquilino?.dni ? `, DNI ${b.inquilino.dni}` : ''),
    `- Inmueble: ${b.propiedad?.direccion ?? '(no informado)'}`,
    `- Canon mensual inicial: $${monto}`,
    `- Fecha de inicio: ${b.fecha_inicio ?? '(no informada)'}`,
    `- Plazo: ${b.duracion_meses ?? '(no informado)'} meses`,
    `- Actualización del canon: índice ${b.indice ?? '(no informado)'}, ` +
      `cada ${b.frecuencia_meses ?? '(no informado)'} meses`
  ]
  if (b.clausulas_particulares && String(b.clausulas_particulares).trim()) {
    lines.push('', 'Cláusulas particulares solicitadas por el usuario (incluilas):')
    lines.push(String(b.clausulas_particulares).trim())
  }
  return lines.join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return json({ ok: false, error: 'Falta configurar ANTHROPIC_API_KEY' }, 500)

    // 1) Verificar que el que llama es un miembro activo del equipo
    const authHeader = req.headers.get('Authorization') ?? ''
    const asCaller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: userData } = await asCaller.auth.getUser()
    const caller = userData?.user
    if (!caller) return json({ ok: false, error: 'No autenticado' }, 401)
    const { data: me } = await asCaller
      .from('usuarios_equipo')
      .select('nombre, activo')
      .eq('auth_user_id', caller.id)
      .maybeSingle()
    if (!me || !me.activo) return json({ ok: false, error: 'Sin acceso' }, 403)

    // 2) Validar entrada mínima
    const body = await req.json()
    if (!body?.inquilino?.nombre || !body?.dueno?.nombre || !body?.propiedad?.direccion) {
      return json({ ok: false, error: 'Faltan datos de las partes o el inmueble' }, 400)
    }

    // 3) Redactar el contrato (streaming interno para evitar timeouts)
    const anthropic = new Anthropic({ apiKey })
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: 8192,
      output_config: { effort: 'medium' },
      system: SYSTEM,
      messages: [{ role: 'user', content: buildUserPrompt(body) }]
    })
    const message = await stream.finalMessage()

    if (message.stop_reason === 'refusal') {
      return json({ ok: false, error: 'La IA no pudo redactar el contrato.' }, 422)
    }
    const textBlock = message.content.find((b) => b.type === 'text')
    const texto = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : ''
    if (!texto) return json({ ok: false, error: 'La IA no devolvió texto.' }, 502)

    // 4) Guardar trazabilidad (con service role; no bloquea la respuesta si falla)
    try {
      const admin = createClient(url, service)
      await admin.from('contratos_generados').insert({
        contrato_id: body.contrato_id ?? null,
        origen: 'redaccion',
        generado_por: caller.id,
        generado_por_nombre: me.nombre ?? null,
        datos: body,
        texto
      })
    } catch (_) {
      // ignorar: la trazabilidad es secundaria
    }

    return json({ ok: true, texto })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
