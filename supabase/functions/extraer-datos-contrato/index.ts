// ════════════════════════════════════════════════════════════════════════════
// Edge Function: extraer-datos-contrato
// Recibe un contrato firmado (PDF o imagen en base64) y usa la API de Claude
// (Anthropic) para extraer los datos clave y devolverlos como JSON, listos para
// precargar el formulario de "Nuevo contrato". La API key NUNCA sale del backend.
//
// Solo la puede invocar un miembro activo del equipo (mismo criterio que RLS).
//
// Requiere el secret ANTHROPIC_API_KEY en el proyecto Supabase:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// Deploy: supabase functions deploy extraer-datos-contrato
//
// Body esperado: { file_base64: string, media_type: string }
//   media_type ∈ application/pdf | image/png | image/jpeg | image/webp | image/gif
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.68.0'

// Modelo de Claude. claude-sonnet-5 es el equilibrio recomendado calidad/costo.
// Para máxima calidad en escaneos difíciles usar 'claude-opus-5'; para abaratar más, 'claude-haiku-4-5'.
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

const INDICES = ['ICL', 'IPC', 'Casa Propia', 'UVA', 'Combinado', 'Porcentaje fijo', 'Manual']

const PROMPT = `Sos un asistente que extrae datos de contratos de locación (alquiler) argentinos.
Te paso un contrato ya firmado (PDF o foto/escaneo). Extraé los datos y devolvé EXCLUSIVAMENTE
un objeto JSON válido, sin texto adicional, sin explicaciones y sin bloques de código markdown.

El JSON debe tener EXACTAMENTE estas claves (usá null cuando el dato no figure en el documento):
{
  "nombre_inquilino": string|null,
  "dni_inquilino": string|null,
  "email_inquilino": string|null,
  "telefono_inquilino": string|null,
  "nombre_dueno": string|null,
  "email_dueno": string|null,
  "telefono_dueno": string|null,
  "dueno_confianza": "alta"|"baja"|null,
  "direccion_propiedad": string|null,
  "monto_inicial": number|null,
  "fecha_inicio": string|null,        // formato YYYY-MM-DD
  "fecha_fin": string|null,           // formato YYYY-MM-DD
  "duracion_meses": number|null,      // PLAZO TOTAL del contrato en meses
  "indice_actualizacion": string|null,// uno de: ${INDICES.join(', ')}
  "frecuencia_actualizacion_meses": number|null,
  "monto_expensas": number|null
}

IDENTIFICACIÓN DE LAS PARTES (importante — los contratos usan etiquetas muy variadas):
- El DUEÑO/propietario puede aparecer como: "LOCADOR", "LOCADORA", "LA LOCADORA",
  "EL LOCADOR", "PROPIETARIO", "PROPIETARIA", "parte locadora", "el/la titular",
  "cedente", o simplemente nombrado en el encabezado antes de "por una parte". Su nombre
  también puede estar en la cláusula de domicilios constituidos. Tomá a esa persona como
  "nombre_dueno" (si es una inmobiliaria/administradora actuando por el propietario, usá el
  nombre del propietario real si figura; si no, el de quien firma como locador).
- El INQUILINO puede aparecer como: "LOCATARIO", "LOCATARIA", "INQUILINO", "parte locataria",
  "el/la tomador/a".
- "dueno_confianza": "alta" si identificaste al locador/propietario con claridad; "baja" si
  tuviste que inferirlo o hay ambigüedad; null si NO lograste identificarlo. Preferí "baja" o
  null antes que arriesgar un nombre incorrecto.

PLAZO Y ACTUALIZACIÓN (no los confundas):
- "duracion_meses" es el PLAZO TOTAL de la locación (típico: 12, 24 o 36 meses), lo que suele
  decirse como "el plazo de la locación es de X meses" o surge de la diferencia entre
  fecha_inicio y fecha_fin.
- "frecuencia_actualizacion_meses" es CADA CUÁNTOS meses se ajusta el monto (ej: "actualización
  trimestral" = 3; "cuatrimestral" = 4; "semestral" = 6; "anual" = 12).
- NO uses el número de la frecuencia como duración ni viceversa. Ejemplo de trampa: "ajuste
  trimestral durante 24 meses" → duracion_meses = 24, frecuencia = 3.
- Si tenés fecha_inicio y fecha_fin, "duracion_meses" DEBE coincidir con la cantidad de meses
  entre ambas. Si no coincide o dudás, priorizá las fechas y dejá "duracion_meses" en null.

Otras reglas:
- "monto_inicial" y "monto_expensas" son números sin símbolos ni separadores de miles (ej: 250000.5).
- El email y el teléfono de cada parte suelen estar en el encabezado, en los domicilios
  constituidos, o en la cláusula de notificaciones/domicilios. Buscalos ahí. Si el contrato
  no los menciona (pasa seguido, sobre todo el email), dejá esa clave en null: NO inventes
  ni asumas datos de contacto. Asociá cada email/teléfono a la parte correcta.
- Mapeá el índice de actualización a la opción más parecida de la lista. Si el contrato usa
  un porcentaje fijo por período, poné "Porcentaje fijo". Si dice que el ajuste es manual o a
  convenir, poné "Manual". Si no se menciona ningún ajuste, poné null.
- Las fechas SIEMPRE en formato YYYY-MM-DD. Si sólo hay mes y año, usá el día 01.
- No inventes datos: ante la duda, usá null.
Devolvé sólo el JSON.`

function extractJson(text: string): unknown {
  let t = text.trim()
  // Quitar cercas de markdown si aparecieran igual
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  // Recortar al primer { … último }
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first >= 0 && last > first) t = t.slice(first, last + 1)
  return JSON.parse(t)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
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
      .select('activo')
      .eq('auth_user_id', caller.id)
      .maybeSingle()
    if (!me || !me.activo) return json({ ok: false, error: 'Sin acceso' }, 403)

    // 2) Validar entrada
    const { file_base64, media_type } = await req.json()
    if (!file_base64 || !media_type) {
      return json({ ok: false, error: 'Falta el archivo (file_base64 / media_type)' }, 400)
    }
    const isPdf = media_type === 'application/pdf'
    const isImg = /^image\/(png|jpe?g|webp|gif)$/.test(media_type)
    if (!isPdf && !isImg) {
      return json({ ok: false, error: `Tipo de archivo no soportado: ${media_type}` }, 400)
    }

    // 3) Armar el bloque de documento/imagen + pedido
    const fileBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type, data: file_base64 } }
      : { type: 'image', source: { type: 'base64', media_type, data: file_base64 } }

    const anthropic = new Anthropic({ apiKey })
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          // El bloque del documento va ANTES del texto (recomendación de la API).
          content: [fileBlock, { type: 'text', text: PROMPT }]
        }
      ]
    })

    if (message.stop_reason === 'refusal') {
      return json({ ok: false, error: 'La IA no pudo procesar el documento.' }, 422)
    }

    const textBlock = message.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return json({ ok: false, error: 'La IA no devolvió datos.' }, 502)
    }

    let datos: Record<string, unknown>
    try {
      datos = extractJson(textBlock.text) as Record<string, unknown>
    } catch {
      return json({ ok: false, error: 'No se pudo interpretar la respuesta de la IA.' }, 502)
    }

    return json({ ok: true, datos })
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500)
  }
})
