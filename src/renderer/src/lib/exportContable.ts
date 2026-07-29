// Exportación contable a CSV (abre en Excel). Columnas: período, fecha de pago,
// propiedad, dueño, inquilino, bruto, comisión, neto, estado de pago.
// Separador ';' + BOM UTF-8 para compatibilidad con Excel en español (AR).
import { supabase } from '@/lib/supabase/client'
import type { EstadoPago } from '@/types/database'

export type FilaContable = {
  periodo: string // YYYY-MM
  fecha_pago: string | null
  propiedad: string
  dueno: string
  inquilino: string
  bruto: number
  comision: number
  neto: number
  estado: EstadoPago
}

const estadoLabel: Record<EstadoPago, string> = {
  pagado: 'Pagado',
  pendiente: 'Pendiente',
  atrasado: 'Atrasado'
}

// Trae las filas contables de los pagos cuyo mes_correspondiente cae en [desdeISO, hastaISO]
// (ambos 'YYYY-MM-01'). Junta propiedad / dueño / inquilino desde las tablas base.
export async function fetchFilasContables(
  desdeISO: string,
  hastaISO: string
): Promise<FilaContable[]> {
  const [pg, ct, pr, du, iq] = await Promise.all([
    supabase
      .from('pagos')
      .select('mes_correspondiente, fecha_pago, monto, monto_comision, monto_neto, estado, contrato_id')
      .gte('mes_correspondiente', desdeISO)
      .lte('mes_correspondiente', hastaISO)
      .order('mes_correspondiente'),
    supabase.from('contratos').select('id, propiedad_id, inquilino_id, dueno_id'),
    supabase.from('propiedades').select('id, direccion, dueno_id'),
    supabase.from('duenos').select('id, nombre'),
    supabase.from('inquilinos').select('id, nombre')
  ])
  if (pg.error) throw new Error(pg.error.message)

  const ctMap: Record<string, { propiedad_id: string; inquilino_id: string; dueno_id: string | null }> = {}
  for (const c of ct.data ?? []) ctMap[c.id] = c
  const prMap: Record<string, { direccion: string; dueno_id: string | null }> = {}
  for (const p of pr.data ?? []) prMap[p.id] = p
  const duMap: Record<string, string> = {}
  for (const d of du.data ?? []) duMap[d.id] = d.nombre
  const iqMap: Record<string, string> = {}
  for (const i of iq.data ?? []) iqMap[i.id] = i.nombre

  return (pg.data ?? []).map((p) => {
    const c = ctMap[p.contrato_id]
    const prop = c ? prMap[c.propiedad_id] : undefined
    const duenoId = prop?.dueno_id ?? c?.dueno_id ?? null
    return {
      periodo: String(p.mes_correspondiente).slice(0, 7),
      fecha_pago: p.fecha_pago,
      propiedad: prop?.direccion ?? '—',
      dueno: duenoId ? duMap[duenoId] ?? '—' : '—',
      inquilino: c ? iqMap[c.inquilino_id] ?? '—' : '—',
      bruto: p.monto,
      comision: p.monto_comision,
      neto: p.monto_neto,
      estado: p.estado as EstadoPago
    }
  })
}

const money = (n: number): string => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',')

function csvField(v: string): string {
  // Escapa si contiene separador, comillas o salto de línea
  if (/[;"\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function exportContableCSV(filas: FilaContable[], filename: string): void {
  const headers = [
    'Período',
    'Fecha de pago',
    'Propiedad',
    'Dueño',
    'Inquilino',
    'Bruto',
    'Comisión',
    'Neto',
    'Estado de pago'
  ]
  const rows = filas.map((f) => [
    f.periodo,
    f.fecha_pago ?? '',
    f.propiedad,
    f.dueno,
    f.inquilino,
    money(f.bruto),
    money(f.comision),
    money(f.neto),
    estadoLabel[f.estado]
  ])
  const csv = [headers, ...rows].map((r) => r.map(csvField).join(';')).join('\r\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
