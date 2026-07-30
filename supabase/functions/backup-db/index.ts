// ════════════════════════════════════════════════════════════════════════════
// Edge Function: backup-db
// Exporta TODAS las tablas de la base a un JSON y lo sube al bucket privado
// 'backups' con nombre backup-YYYY-MM-DD.json. Mantiene los últimos 8 (borra los
// más viejos). Pensada para correr por cron (semanal). También se puede disparar
// a mano desde Ajustes ("Generar backup ahora").
//
// Deploy:  supabase functions deploy backup-db
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const json = (b: unknown, s = 200): Response =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

const TABLAS = [
  'duenos',
  'inquilinos',
  'propiedades',
  'contratos',
  'indices_valores',
  'actualizaciones_contrato',
  'pagos',
  'usuarios_equipo',
  'notificaciones',
  'contratos_generados',
  'contratos_archivos',
  'liquidaciones',
  'mantenimiento',
  'seguros_propiedad',
  'configuracion',
  'cotizaciones_dolar',
  'log_actividad'
]

const MANTENER = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const errores: string[] = []
  const tablas: Record<string, unknown[]> = {}
  for (const t of TABLAS) {
    const { data, error } = await supabase.from(t).select('*')
    if (error) errores.push(`${t}: ${error.message}`)
    else tablas[t] = data ?? []
  }

  const backup = { generado: new Date().toISOString(), version: 1, tablas }
  const fecha = new Date().toISOString().slice(0, 10)
  const nombre = `backup-${fecha}.json`

  const up = await supabase.storage
    .from('backups')
    .upload(nombre, new Blob([JSON.stringify(backup)], { type: 'application/json' }), {
      contentType: 'application/json',
      upsert: true
    })
  if (up.error) {
    errores.push(`upload: ${up.error.message}`)
    return json({ ok: false, errores }, 500)
  }

  // Retención: dejar sólo los últimos MANTENER backups
  let borrados = 0
  const { data: files } = await supabase.storage
    .from('backups')
    .list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } })
  const sobrantes = (files ?? [])
    .map((f) => f.name)
    .filter((n) => n.endsWith('.json'))
    .slice(MANTENER)
  if (sobrantes.length > 0) {
    const rm = await supabase.storage.from('backups').remove(sobrantes)
    if (rm.error) errores.push(`retención: ${rm.error.message}`)
    else borrados = sobrantes.length
  }

  return json({
    ok: errores.length === 0,
    archivo: nombre,
    tablas: Object.keys(tablas).length,
    filas: Object.values(tablas).reduce((s, r) => s + r.length, 0),
    borrados,
    errores
  })
})
