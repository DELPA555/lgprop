import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Search, Loader2, Wallet } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Pago, Contrato, Propiedad, Inquilino, EstadoPago } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatARS, formatDate } from '@/lib/format'
import { todayISO } from '@/lib/dates'

const currentYM = (): string => todayISO().slice(0, 7)
const monthStart = (ym: string): string => `${ym}-01`

const ESTADOS: { id: EstadoPago; label: string; cls: string }[] = [
  { id: 'pendiente', label: 'Pendiente', cls: 'bg-zinc-500/15 text-zinc-300' },
  { id: 'pagado', label: 'Pagado', cls: 'bg-emerald-500/15 text-emerald-400' },
  { id: 'atrasado', label: 'Atrasado', cls: 'bg-red-500/15 text-red-400' }
]

export default function Pagos(): JSX.Element {
  const toast = useToast()
  const [ym, setYm] = useState(currentYM())
  const [pagos, setPagos] = useState<Pago[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<'todos' | EstadoPago>('todos')
  const [editing, setEditing] = useState<Pago | null>(null)
  const [form, setForm] = useState<Partial<Pago>>({})
  const [saving, setSaving] = useState(false)

  const mesISO = monthStart(ym)

  const propMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of propiedades) m[p.id] = p.direccion
    return m
  }, [propiedades])
  const inqMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const i of inquilinos) m[i.id] = i.nombre
    return m
  }, [inquilinos])
  const contratoMap = useMemo(() => {
    const m: Record<string, Contrato> = {}
    for (const c of contratos) m[c.id] = c
    return m
  }, [contratos])

  const loadBase = async (): Promise<void> => {
    if (!isSupabaseConfigured) return
    const [c, p, i] = await Promise.all([
      supabase.from('contratos').select('*'),
      supabase.from('propiedades').select('*'),
      supabase.from('inquilinos').select('*')
    ])
    setContratos(c.data ?? [])
    setPropiedades(p.data ?? [])
    setInquilinos(i.data ?? [])
  }

  const loadPagos = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('pagos')
      .select('*')
      .eq('mes_correspondiente', mesISO)
    if (error) toast.error(error.message)
    setPagos(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void loadBase()
  }, [])
  useEffect(() => {
    void loadPagos()
  }, [mesISO])

  const contratoLabel = (contratoId: string): string => {
    const c = contratoMap[contratoId]
    if (!c) return 'Contrato'
    return `${propMap[c.propiedad_id] ?? 'Propiedad'} · ${inqMap[c.inquilino_id] ?? ''}`
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return pagos
      .filter((p) => (filtro === 'todos' ? true : p.estado === filtro))
      .filter((p) => (s ? contratoLabel(p.contrato_id).toLowerCase().includes(s) : true))
      .sort((a, b) => contratoLabel(a.contrato_id).localeCompare(contratoLabel(b.contrato_id)))
  }, [pagos, q, filtro, contratoMap, propMap, inqMap])

  const resumen = useMemo(() => {
    const total = pagos.reduce((s, p) => s + p.monto, 0)
    const cobrado = pagos.filter((p) => p.estado === 'pagado').reduce((s, p) => s + p.monto, 0)
    const atrasados = pagos.filter((p) => p.estado === 'atrasado').length
    const pendientes = pagos.filter((p) => p.estado === 'pendiente').length
    return { total, cobrado, atrasados, pendientes, pendienteMonto: total - cobrado }
  }, [pagos])

  // ── Generar las cuotas del mes para los contratos activos sin pago cargado ──
  const generar = async (): Promise<void> => {
    setGenerating(true)
    try {
      const existentes = new Set(pagos.map((p) => p.contrato_id))
      const pastDue = mesISO < monthStart(currentYM())
      const nuevos = contratos
        .filter((c) => c.estado === 'activo' && !existentes.has(c.id))
        .map((c) => ({
          contrato_id: c.id,
          mes_correspondiente: mesISO,
          monto: c.monto_actual,
          estado: (pastDue ? 'atrasado' : 'pendiente') as EstadoPago,
          expensas_pagadas: false
        }))
      if (nuevos.length === 0) {
        toast.info('No hay contratos activos sin cuota para este mes.')
        return
      }
      const { error } = await supabase.from('pagos').insert(nuevos)
      if (error) return void toast.error(error.message)
      toast.success(`${nuevos.length} cuota(s) generada(s)`)
      await loadPagos()
    } finally {
      setGenerating(false)
    }
  }

  const setEstado = async (p: Pago, estado: EstadoPago): Promise<void> => {
    const fecha_pago = estado === 'pagado' ? (p.fecha_pago ?? todayISO()) : null
    // Optimista
    setPagos((prev) => prev.map((x) => (x.id === p.id ? { ...x, estado, fecha_pago } : x)))
    const { error } = await supabase.from('pagos').update({ estado, fecha_pago }).eq('id', p.id)
    if (error) {
      toast.error(error.message)
      void loadPagos()
    }
  }

  const toggleExpensas = async (p: Pago): Promise<void> => {
    const expensas_pagadas = !p.expensas_pagadas
    setPagos((prev) => prev.map((x) => (x.id === p.id ? { ...x, expensas_pagadas } : x)))
    const { error } = await supabase
      .from('pagos')
      .update({ expensas_pagadas })
      .eq('id', p.id)
    if (error) {
      toast.error(error.message)
      void loadPagos()
    }
  }

  const openEdit = (p: Pago): void => {
    setEditing(p)
    setForm({ ...p })
  }

  const saveEdit = async (): Promise<void> => {
    if (!editing) return
    setSaving(true)
    const { error } = await supabase
      .from('pagos')
      .update({
        monto: Number(form.monto) || 0,
        estado: (form.estado ?? 'pendiente') as EstadoPago,
        fecha_pago: form.fecha_pago || null,
        expensas_pagadas: !!form.expensas_pagadas,
        notas: form.notas || null
      })
      .eq('id', editing.id)
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success('Pago actualizado')
    setEditing(null)
    void loadPagos()
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Pagos"
        subtitle="Registro mensual de alquileres"
        actions={
          <button
            onClick={generar}
            disabled={generating}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Generar cuotas del mes
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      {/* Resumen del mes */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <div className="card p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Total del mes</p>
          <p className="text-2xl font-bold text-white mt-1 tabular-nums">{formatARS(resumen.total)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Cobrado</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
            {formatARS(resumen.cobrado)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Por cobrar</p>
          <p className="text-2xl font-bold text-amber-400 mt-1 tabular-nums">
            {formatARS(resumen.pendienteMonto)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Atrasados</p>
          <p className="text-2xl font-bold text-red-400 mt-1 tabular-nums">{resumen.atrasados}</p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div>
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value || currentYM())}
            className="input"
          />
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="input w-full pl-9"
            placeholder="Buscar contrato…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
          {(['todos', 'pendiente', 'pagado', 'atrasado'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
                filtro === f ? 'bg-accent text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Contrato</th>
              <th className="px-4 py-3 font-medium text-right">Monto</th>
              <th className="px-4 py-3 font-medium text-right">Comisión</th>
              <th className="px-4 py-3 font-medium text-right">Neto dueño</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-center">Expensas</th>
              <th className="px-4 py-3 font-medium">Fecha pago</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-600">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-600">
                  {pagos.length === 0
                    ? 'No hay cuotas para este mes. Usá “Generar cuotas del mes”.'
                    : 'Sin resultados con el filtro actual.'}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-white">{contratoLabel(p.contrato_id)}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-200 tabular-nums">
                    {formatARS(p.monto)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-amber-400/80 tabular-nums text-xs">
                    {p.monto_comision > 0 ? formatARS(p.monto_comision) : '—'}
                    {p.porcentaje_comision_aplicado > 0 && (
                      <div className="text-[10px] text-zinc-600">
                        {p.porcentaje_comision_aplicado}%
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-emerald-400 tabular-nums">
                    {formatARS(p.monto_neto)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      {ESTADOS.map((e) => (
                        <button
                          key={e.id}
                          onClick={() => setEstado(p, e.id)}
                          className={`px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                            p.estado === e.id ? e.cls : 'text-zinc-600 hover:text-zinc-300'
                          }`}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-blue-500"
                      checked={p.expensas_pagadas}
                      onChange={() => toggleExpensas(p)}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">
                    {p.fecha_pago ? formatDate(p.fecha_pago) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!editing}
        title="Editar pago"
        onClose={() => setEditing(null)}
        footer={
          <>
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button onClick={saveEdit} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Wallet size={15} className="text-accent" />
              {contratoLabel(editing.contrato_id)} · {formatDate(editing.mes_correspondiente)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monto">
                <TextInput
                  type="number"
                  min={0}
                  value={form.monto ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, monto: Number(e.target.value) }))}
                />
              </Field>
              <Field label="Estado">
                <Select
                  value={form.estado ?? 'pendiente'}
                  onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as EstadoPago }))}
                >
                  <option value="pendiente">Pendiente</option>
                  <option value="pagado">Pagado</option>
                  <option value="atrasado">Atrasado</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <Field label="Fecha de pago">
                <TextInput
                  type="date"
                  value={form.fecha_pago ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_pago: e.target.value || null }))}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-zinc-300 pb-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-blue-500"
                  checked={!!form.expensas_pagadas}
                  onChange={(e) => setForm((f) => ({ ...f, expensas_pagadas: e.target.checked }))}
                />
                Expensas pagadas
              </label>
            </div>
            <Field label="Notas">
              <TextArea
                value={form.notas ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  )
}
