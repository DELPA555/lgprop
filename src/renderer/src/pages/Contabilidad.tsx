import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Wallet, TrendingUp, Building2, Users, RefreshCcw } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { GastoLgprop, Contrato, Propiedad, Dueno, Pago } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { formatARS, formatDate } from '@/lib/format'
import { todayISO } from '@/lib/dates'

const CATEGORIAS = ['Sueldos', 'Herramientas', 'Oficina', 'Impuestos', 'Marketing', 'Servicios', 'Otros']
const currentYM = (): string => todayISO().slice(0, 7)
type FormGasto = Partial<GastoLgprop>

export default function Contabilidad(): JSX.Element {
  const toast = useToast()
  const { member } = useAuth()
  const [anio, setAnio] = useState<number>(new Date().getFullYear())
  const [ymGasto, setYmGasto] = useState(currentYM())
  const [gastos, setGastos] = useState<GastoLgprop[]>([])
  const [gastosMes, setGastosMes] = useState<GastoLgprop[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [duenos, setDuenos] = useState<Dueno[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<GastoLgprop | null>(null)
  const [form, setForm] = useState<FormGasto>({})
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<GastoLgprop | null>(null)
  const [deleting, setDeleting] = useState(false)

  const yearStart = `${anio}-01-01`
  const yearEnd = `${anio}-12-31`
  const monthStartISO = `${todayISO().slice(0, 7)}-01`
  const mesGastoISO = `${ymGasto}-01`

  const contratoMap = useMemo(() => {
    const m: Record<string, Contrato> = {}
    for (const c of contratos) m[c.id] = c
    return m
  }, [contratos])
  const propMap = useMemo(() => {
    const m: Record<string, Propiedad> = {}
    for (const p of propiedades) m[p.id] = p
    return m
  }, [propiedades])
  const duenoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const d of duenos) m[d.id] = d.nombre
    return m
  }, [duenos])

  const loadBase = async (): Promise<void> => {
    if (!isSupabaseConfigured) return
    const [c, p, d] = await Promise.all([
      supabase.from('contratos').select('*'),
      supabase.from('propiedades').select('*'),
      supabase.from('duenos').select('*')
    ])
    setContratos(c.data ?? [])
    setPropiedades(p.data ?? [])
    setDuenos(d.data ?? [])
  }
  const loadAnio = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [pg, gs] = await Promise.all([
      supabase
        .from('pagos')
        .select('contrato_id, monto_comision, cotizacion_usada, mes_correspondiente, estado')
        .eq('estado', 'pagado')
        .gte('mes_correspondiente', yearStart)
        .lte('mes_correspondiente', yearEnd),
      supabase
        .from('gastos_lgprop')
        .select('*')
        .gte('mes_correspondiente', yearStart)
        .lte('mes_correspondiente', yearEnd)
    ])
    setPagos((pg.data as Pago[]) ?? [])
    setGastos(gs.data ?? [])
    setLoading(false)
  }
  const loadGastosMes = async (): Promise<void> => {
    const { data } = await supabase
      .from('gastos_lgprop')
      .select('*')
      .eq('mes_correspondiente', mesGastoISO)
      .order('fecha', { ascending: false })
    setGastosMes(data ?? [])
  }

  useEffect(() => {
    void loadBase()
  }, [])
  useEffect(() => {
    void loadAnio()
  }, [anio])
  useEffect(() => {
    void loadGastosMes()
  }, [mesGastoISO])

  // Comisión ARS-equivalente de un pago (USD convertido por su cotización)
  const comAr = (p: Pago): number =>
    p.cotizacion_usada ? p.monto_comision * p.cotizacion_usada : p.monto_comision

  const rent = useMemo(() => {
    const comAnio = pagos.reduce((t, p) => t + comAr(p), 0)
    const comMes = pagos
      .filter((p) => p.mes_correspondiente === monthStartISO)
      .reduce((t, p) => t + comAr(p), 0)
    const gastosAnio = gastos.reduce((t, g) => t + (Number(g.monto) || 0), 0)
    const gastosMesTotal = gastos
      .filter((g) => g.mes_correspondiente === monthStartISO)
      .reduce((t, g) => t + (Number(g.monto) || 0), 0)
    return {
      comAnio,
      comMes,
      gastosAnio,
      gastosMesTotal,
      netoAnio: comAnio - gastosAnio,
      netoMes: comMes - gastosMesTotal
    }
  }, [pagos, gastos, monthStartISO])

  const rankProps = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of pagos) {
      const c = contratoMap[p.contrato_id]
      const propId = c?.propiedad_id
      if (!propId) continue
      m[propId] = (m[propId] ?? 0) + comAr(p)
    }
    return Object.entries(m)
      .map(([id, com]) => ({ id, com, label: propMap[id]?.direccion ?? '—' }))
      .sort((a, b) => b.com - a.com)
      .slice(0, 8)
  }, [pagos, contratoMap, propMap])

  const rankDuenos = useMemo(() => {
    const m: Record<string, number> = {}
    for (const p of pagos) {
      const c = contratoMap[p.contrato_id]
      const duenoId = (c && (propMap[c.propiedad_id]?.dueno_id ?? c.dueno_id)) || null
      if (!duenoId) continue
      m[duenoId] = (m[duenoId] ?? 0) + comAr(p)
    }
    return Object.entries(m)
      .map(([id, com]) => ({ id, com, label: duenoMap[id] ?? '—' }))
      .sort((a, b) => b.com - a.com)
      .slice(0, 8)
  }, [pagos, contratoMap, propMap, duenoMap])

  // Rotación: propiedades con más contratos finalizados (no renovados)
  const rotacion = useMemo(() => {
    const m: Record<string, { total: number; fin: number }> = {}
    for (const c of contratos) {
      const r = (m[c.propiedad_id] ??= { total: 0, fin: 0 })
      r.total++
      if (c.estado === 'vencido' || c.estado === 'rescindido') r.fin++
    }
    return Object.entries(m)
      .map(([id, v]) => ({ id, ...v, label: propMap[id]?.direccion ?? '—' }))
      .filter((x) => x.fin > 0)
      .sort((a, b) => b.fin - a.fin || b.total - a.total)
      .slice(0, 8)
  }, [contratos, propMap])

  // ── ABM de gastos propios ──
  const openCreate = (): void => {
    setEditing(null)
    setForm({ fecha: todayISO(), categoria: 'Otros', monto: 0 })
    setModalOpen(true)
  }
  const openEdit = (g: GastoLgprop): void => {
    setEditing(g)
    setForm({ ...g })
    setModalOpen(true)
  }
  const save = async (): Promise<void> => {
    if (!form.concepto?.trim()) return toast.error('Poné el concepto')
    if (!form.monto || Number(form.monto) <= 0) return toast.error('El monto debe ser mayor a 0')
    setSaving(true)
    const payload = {
      fecha: form.fecha || todayISO(),
      mes_correspondiente: mesGastoISO,
      concepto: form.concepto.trim(),
      categoria: form.categoria || null,
      monto: Number(form.monto),
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('gastos_lgprop').update(payload).eq('id', editing.id)
      : await supabase.from('gastos_lgprop').insert({ ...payload, creado_por: member?.id ?? null })
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Gasto actualizado' : 'Gasto agregado')
    setModalOpen(false)
    void loadGastosMes()
    void loadAnio()
  }
  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('gastos_lgprop').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Gasto eliminado')
    setDelTarget(null)
    void loadGastosMes()
    void loadAnio()
  }

  const totalMes = useMemo(() => gastosMes.reduce((t, g) => t + (Number(g.monto) || 0), 0), [gastosMes])

  const rankBar = (
    items: { id: string; com: number; label: string }[]
  ): JSX.Element => {
    const max = items[0]?.com || 1
    return (
      <div className="space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-ink-3">Sin comisión registrada este año.</p>
        ) : (
          items.map((it, i) => (
            <div key={it.id}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-ink-2 truncate">
                  <span className="text-ink-3 num mr-1">{i + 1}.</span>
                  {it.label}
                </span>
                <span className="num text-ink shrink-0">{formatARS(it.com)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.05] mt-1 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent/70"
                  style={{ width: `${Math.max(4, (it.com / max) * 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Contabilidad interna"
        subtitle="Rentabilidad real de LG Prop, después de tus propios costos"
        actions={
          <Select value={String(anio)} onChange={(e) => setAnio(Number(e.target.value))}>
            {[0, 1, 2].map((d) => {
              const y = new Date().getFullYear() - d
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              )
            })}
          </Select>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      {/* Rentabilidad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <p className="text-xs text-ink-3 uppercase tracking-wider">Comisión cobrada · {anio}</p>
          <p className="num text-2xl font-bold text-ok mt-1">{formatARS(rent.comAnio)}</p>
          <p className="text-[11px] text-ink-3 mt-1">Este mes {formatARS(rent.comMes)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs text-ink-3 uppercase tracking-wider">Gastos propios · {anio}</p>
          <p className="num text-2xl font-bold text-warn mt-1">{formatARS(rent.gastosAnio)}</p>
          <p className="text-[11px] text-ink-3 mt-1">Este mes {formatARS(rent.gastosMesTotal)}</p>
        </div>
        <div className="card p-5 bg-gradient-to-br from-accent-dim/25 via-card to-card border-accent/25">
          <p className="text-xs text-ink-3 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp size={13} className="text-accent" /> Rentabilidad neta · {anio}
          </p>
          <p className={`num text-3xl font-bold mt-1 ${rent.netoAnio >= 0 ? 'text-accent' : 'text-bad'}`}>
            {formatARS(rent.netoAnio)}
          </p>
          <p className="text-[11px] text-ink-3 mt-1">
            Este mes{' '}
            <span className={rent.netoMes >= 0 ? 'text-ink-2' : 'text-bad'}>
              {formatARS(rent.netoMes)}
            </span>{' '}
            · comisión − gastos propios (ARS)
          </p>
        </div>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <Building2 size={15} className="text-ink-3" /> Propiedades por comisión
          </h2>
          {rankBar(rankProps)}
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <Users size={15} className="text-ink-3" /> Dueños por comisión
          </h2>
          {rankBar(rankDuenos)}
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <RefreshCcw size={15} className="text-ink-3" /> Mayor rotación
          </h2>
          {rotacion.length === 0 ? (
            <p className="text-xs text-ink-3">Sin contratos finalizados.</p>
          ) : (
            <div className="space-y-2">
              {rotacion.map((r, i) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink-2 truncate">
                    <span className="text-ink-3 num mr-1">{i + 1}.</span>
                    {r.label}
                  </span>
                  <span className="num text-ink-3 shrink-0">
                    <span className="text-bad">{r.fin}</span> / {r.total} contratos
                  </span>
                </div>
              ))}
              <p className="text-[10px] text-ink-3 pt-1">Contratos finalizados / totales por propiedad.</p>
            </div>
          )}
        </div>
      </div>

      {/* Gastos propios (ABM por mes) */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Wallet size={16} className="text-ink-3" /> Gastos propios del mes
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={ymGasto}
            onChange={(e) => setYmGasto(e.target.value || currentYM())}
            className="input"
          />
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={15} /> Nuevo gasto
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Concepto</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium text-right">Monto</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-3">
                  Cargando…
                </td>
              </tr>
            ) : gastosMes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-3">
                  Sin gastos propios cargados este mes.
                </td>
              </tr>
            ) : (
              gastosMes.map((g) => (
                <tr key={g.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ink-3 text-xs whitespace-nowrap">{formatDate(g.fecha)}</td>
                  <td className="px-4 py-3 text-white">{g.concepto}</td>
                  <td className="px-4 py-3">
                    {g.categoria ? (
                      <span className="chip chip-muted">{g.categoria}</span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right num text-ink">{formatARS(g.monto)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(g)}
                        className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-white/5"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDelTarget(g)}
                        className="p-1.5 rounded-md text-ink-2 hover:text-bad hover:bg-white/5"
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {gastosMes.length > 0 && (
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={3} className="px-4 py-3 text-right text-xs text-ink-3 uppercase tracking-wider">
                  Total del mes
                </td>
                <td className="px-4 py-3 text-right num font-semibold text-warn">{formatARS(totalMes)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar gasto propio' : 'Nuevo gasto propio'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button onClick={save} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Concepto" required>
            <TextInput
              value={form.concepto ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
              placeholder="Ej: Sueldo vendedora / Suscripción software"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Categoría">
              <Select
                value={form.categoria ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value || null }))}
              >
                <option value="">— Sin categoría —</option>
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Monto" required>
              <TextInput
                type="number"
                min={0}
                value={form.monto ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, monto: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Fecha">
              <TextInput
                type="date"
                value={form.fecha ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              />
            </Field>
          </div>
          <p className="text-[11px] text-ink-3">
            Se imputa al mes seleccionado arriba ({ymGasto}).
          </p>
          <Field label="Notas">
            <TextArea
              value={form.notas ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message={`¿Eliminar el gasto "${delTarget?.concepto}"?`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
