// ════════════════════════════════════════════════════════════════════════════
// Edge Function: actualizar-cotizaciones
// Trae la cotización del dólar (oficial, blue y MEP) y la guarda en
// public.cotizaciones_dolar (upsert por fecha + tipo). Corre por cron (diario).
//
// Fuente principal: dolarapi.com  (⚠️ dominio PELADO, sin el subdominio `api.`,
//   que no resuelve desde la Edge Function). Endpoints:
//     https://dolarapi.com/v1/dolares/oficial | /blue | /bolsa (MEP)
//   Devuelve { compra, venta, fechaActualizacion }.
// Respaldo: bluelytics.com.ar (/json/last_price) → oficial + blue.
//
// Deploy:  supabase functions deploy actualizar-cotizaciones
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface Row {
  fecha: string
  tipo: string
  compra: number | null
  venta: number | null
  fuente: string
}

const num = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const hoy = new Date().toISOString().slice(0, 10)
  const rows: Row[] = []
  const errores: string[] = []
  const cargados = new Set<string>()

  // 1) dolarapi (dominio pelado)
  const dolarapi: { endpoint: string; tipo: string }[] = [
    { endpoint: 'oficial', tipo: 'oficial' },
    { endpoint: 'blue', tipo: 'blue' },
    { endpoint: 'bolsa', tipo: 'mep' }
  ]
  for (const d of dolarapi) {
    try {
      const res = await fetch(`https://dolarapi.com/v1/dolares/${d.endpoint}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      const fecha =
        typeof j?.fechaActualizacion === 'string' ? j.fechaActualizacion.slice(0, 10) : hoy
      rows.push({ fecha, tipo: d.tipo, compra: num(j.compra), venta: num(j.venta), fuente: 'dolarapi' })
      cargados.add(d.tipo)
    } catch (e) {
      errores.push(`dolarapi/${d.tipo}: ${(e as Error).message}`)
    }
  }

  // 2) Respaldo bluelytics para oficial/blue si algo faltó
  if (!cargados.has('blue') || !cargados.has('oficial')) {
    try {
      const res = await fetch('https://api.bluelytics.com.ar/json/last_price')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const arr = (await res.json()) as {
        source: string
        value_sell: number
        value_buy: number
        date?: string
      }[]
      for (const it of arr) {
        const tipo = it.source // 'oficial' | 'blue'
        if ((tipo === 'oficial' || tipo === 'blue') && !cargados.has(tipo)) {
          rows.push({
            fecha: (it.date ?? hoy).slice(0, 10),
            tipo,
            compra: num(it.value_buy),
            venta: num(it.value_sell),
            fuente: 'bluelytics'
          })
          cargados.add(tipo)
        }
      }
    } catch (e) {
      errores.push(`bluelytics: ${(e as Error).message}`)
    }
  }

  let insertados = 0
  if (rows.length > 0) {
    const { error, count } = await supabase
      .from('cotizaciones_dolar')
      .upsert(rows, { onConflict: 'fecha,tipo', ignoreDuplicates: false, count: 'exact' })
    if (error) errores.push(`upsert: ${error.message}`)
    else insertados = count ?? rows.length
  }

  const ok = cargados.has('blue') // el blue es el que usamos por defecto
  return new Response(JSON.stringify({ ok, insertados, tipos: [...cargados], errores }), {
    headers: { 'Content-Type': 'application/json' },
    status: ok ? 200 : 207
  })
})
