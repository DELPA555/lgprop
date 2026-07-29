import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Plus, Trash2, TrendingUp, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { IndiceValor, TipoIndice } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { todayISO } from '@/lib/dates'

// Índices con valor numérico real (los que se guardan en indices_valores).
// Combinado / Porcentaje fijo / Manual son modos del contrato, no series.
const REAL_INDICES: TipoIndice[] = ['ICL', 'IPC', 'Casa Propia', 'UVA']

function formatValor(v: number): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 }).format(v)
}

interface ManualForm {
  tipo_indice: TipoIndice
  fecha: string
  valor: string
}

export default function Indices(): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<IndiceValor[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TipoIndice>('ICL')
  const [refreshing, setRefreshing] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ManualForm>({ tipo_indice: 'ICL', fecha: todayISO(), valor: '' })
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<IndiceValor | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('indices_valores')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(500)
    if (error) toast.error(error.message)
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  // Último valor por índice (para las tarjetas)
  const ultimos = useMemo(() => {
    const m: Record<string, IndiceValor> = {}
    for (const r of rows) {
      if (!m[r.tipo_indice] || r.fecha > m[r.tipo_indice].fecha) m[r.tipo_indice] = r
    }
    return m
  }, [rows])

  const historial = useMemo(
    () => rows.filter((r) => r.tipo_indice === selected),
    [rows, selected]
  )

  const actualizarAhora = async (): Promise<void> => {
    setRefreshing(true)
    try {
      const { data, error } = await supabase.functions.invoke('actualizar-indices', { body: {} })
      if (error) throw error
      const res = data as { ok?: boolean; insertados?: number; errores?: string[] } | null
      if (res?.errores?.length) {
        toast.info(`Actualizado con avisos: ${res.errores.join(' · ')}`)
      } else {
        toast.success(`Índices actualizados (${res?.insertados ?? 0} valores nuevos)`)
      }
      await load()
    } catch (e) {
      toast.error(
        'No se pudo actualizar automáticamente. Verificá que la Edge Function "actualizar-indices" esté desplegada.'
      )
    } finally {
      setRefreshing(false)
    }
  }

  const openManual = (): void => {
    setForm({ tipo_indice: selected, fecha: todayISO(), valor: '' })
    setModalOpen(true)
  }

  const saveManual = async (): Promise<void> => {
    const valor = Number(form.valor)
    if (!form.fecha) return toast.error('Elegí una fecha')
    if (!form.valor || Number.isNaN(valor)) return toast.error('Ingresá un valor numérico')
    setSaving(true)
    const { error } = await supabase
      .from('indices_valores')
      .upsert(
        { tipo_indice: form.tipo_indice, fecha: form.fecha, valor, fuente: 'manual' },
        { onConflict: 'tipo_indice,fecha' }
      )
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success('Valor guardado')
    setModalOpen(false)
    setSelected(form.tipo_indice)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('indices_valores').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Valor eliminado')
    setDelTarget(null)
    void load()
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Índices"
        subtitle="Valores de actualización (ICL, IPC, Casa Propia, UVA)"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={openManual}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border text-zinc-300 hover:text-white"
            >
              <Plus size={15} /> Cargar valor
            </button>
            <button
              onClick={actualizarAhora}
              disabled={refreshing}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Actualizar ahora
            </button>
          </div>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      {/* Tarjetas: último valor por índice */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        {REAL_INDICES.map((idx) => {
          const u = ultimos[idx]
          return (
            <button
              key={idx}
              onClick={() => setSelected(idx)}
              className={`card p-4 text-left transition-colors ${
                selected === idx ? 'border-accent/50' : 'hover:border-border'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">{idx}</span>
                <TrendingUp size={15} className="text-accent" />
              </div>
              <div className="text-2xl font-bold text-white mt-2 tabular-nums">
                {u ? formatValor(u.valor) : '—'}
              </div>
              <div className="text-[11px] text-zinc-600 mt-0.5">
                {u ? `${formatDate(u.fecha)} · ${u.fuente ?? ''}` : 'Sin datos'}
              </div>
            </button>
          )
        })}
      </div>

      {/* Historial del índice seleccionado */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">
            Historial — <span className="text-accent">{selected}</span>
          </h3>
          <div className="flex gap-1">
            {REAL_INDICES.map((idx) => (
              <button
                key={idx}
                onClick={() => setSelected(idx)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  selected === idx ? 'bg-accent text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {idx}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium text-right">Valor</th>
              <th className="px-4 py-3 font-medium">Fuente</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-600">
                  Cargando…
                </td>
              </tr>
            ) : historial.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-zinc-600">
                  Sin valores para {selected}. Usá “Actualizar ahora” o cargá uno manualmente.
                </td>
              </tr>
            ) : (
              historial.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-zinc-300">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-2.5 text-right text-white tabular-nums">
                    {formatValor(r.valor)}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">{r.fuente ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end">
                      <button
                        onClick={() => setDelTarget(r)}
                        className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-white/5"
                        title="Eliminar"
                      >
                        <Trash2 size={14} />
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
        open={modalOpen}
        title="Cargar valor de índice"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button onClick={saveManual} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Índice">
            <Select
              value={form.tipo_indice}
              onChange={(e) => setForm((f) => ({ ...f, tipo_indice: e.target.value as TipoIndice }))}
            >
              {REAL_INDICES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha" required>
              <TextInput
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              />
            </Field>
            <Field label="Valor" required>
              <TextInput
                type="number"
                step="any"
                value={form.valor}
                onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              />
            </Field>
          </div>
          <p className="text-[11px] text-zinc-600">
            Si ya existe un valor para ese índice y fecha, se reemplaza.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message={`¿Eliminar el valor de ${delTarget?.tipo_indice} del ${delTarget ? formatDate(delTarget.fecha) : ''}?`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
