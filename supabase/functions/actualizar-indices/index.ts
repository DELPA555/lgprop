// ════════════════════════════════════════════════════════════════════════════
// Edge Function: actualizar-indices
// Trae los últimos valores de ICL, IPC, UVA y Casa Propia y los guarda en
// public.indices_valores (upsert por tipo_indice + fecha).
//
// Fuente: API de Series de Tiempo de datos.gob.ar, que republica en JSON las
// series oficiales del BCRA (ICL, UVA, Casa Propia) y del INDEC (IPC). Es más
// estable que scrapear cada organismo por separado.
//
// Programar con cron (ver supabase/functions/README o el cron.sql):
//   select cron.schedule('actualizar-indices-mensual', '0 12 2 * *',
//     $$ select net.http_post(...) $$);
//
// Deploy:  supabase functions deploy actualizar-indices
// Test:    supabase functions invoke actualizar-indices
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// IDs de serie verificados contra el catálogo datos.gob.ar (2026-07-29).
// Dejar id '' desactiva ese índice → se carga a mano desde el módulo Índices.
//   - IPC: nivel general nacional, número índice base dic-2016 (INDEC).
//   - UVA: serie diaria (BCRA).
//   - ICL: NO está publicado en datos.gob.ar → carga manual en la app.
//   - Casa Propia: carga manual.
const SERIES: Record<string, { id: string; fuente: string }> = {
  ICL: { id: '', fuente: 'BCRA' }, // manual (no está en datos.gob.ar)
  IPC: { id: '148.3_INIVELNAL_DICI_M_26', fuente: 'INDEC' }, // nivel general nacional (nº índice)
  UVA: { id: '94.2_UVAD_D_0_0_10', fuente: 'BCRA' }, // UVA diario
  'Casa Propia': { id: '', fuente: 'BCRA' } // manual
}

const SERIES_API = 'https://apis.datos.gob.ar/series/api/series'

interface UpsertRow {
  tipo_indice: string
  fecha: string
  valor: number
  fuente: string
}

async function fetchUltimoValor(id: string): Promise<{ fecha: string; valor: number } | null> {
  const url = `${SERIES_API}/?ids=${encodeURIComponent(id)}&limit=1&sort=desc&format=json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Series API ${res.status} para ${id}`)
  const json = await res.json()
  const row = json?.data?.[0]
  if (!row || row[1] == null) return null
  return { fecha: String(row[0]).slice(0, 10), valor: Number(row[1]) }
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceKey)

  const rows: UpsertRow[] = []
  const errores: string[] = []

  for (const [tipo, def] of Object.entries(SERIES)) {
    if (!def.id) continue
    try {
      const dato = await fetchUltimoValor(def.id)
      if (dato) {
        rows.push({ tipo_indice: tipo, fecha: dato.fecha, valor: dato.valor, fuente: def.fuente })
      }
    } catch (e) {
      errores.push(`${tipo}: ${(e as Error).message}`)
    }
  }

  let insertados = 0
  if (rows.length > 0) {
    const { error, count } = await supabase
      .from('indices_valores')
      .upsert(rows, { onConflict: 'tipo_indice,fecha', ignoreDuplicates: false, count: 'exact' })
    if (error) errores.push(`upsert: ${error.message}`)
    else insertados = count ?? rows.length
  }

  return new Response(
    JSON.stringify({ ok: errores.length === 0, insertados, procesados: rows.length, errores }),
    { headers: { 'Content-Type': 'application/json' }, status: errores.length ? 207 : 200 }
  )
})
