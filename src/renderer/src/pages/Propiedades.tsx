import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, Eye } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Propiedad, Dueno, EstadoPropiedad, PagaExpensas } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import EstadoChip from '@/components/ui/EstadoChip'
import { formatARS } from '@/lib/format'

type Form = Partial<Propiedad>
const EMPTY: Form = {
  direccion: '',
  tipo: '',
  dueno_id: null,
  estado: 'vacia',
  monto_expensas: 0,
  paga_expensas: 'inquilino',
  porcentaje_comision: null,
  administrada: true,
  notas: ''
}

const ESTADO_BADGE: Record<EstadoPropiedad, string> = {
  alquilada: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  vacia: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
}

type AdminFiltro = 'todas' | 'admin' | 'noadmin'

export default function Propiedades(): JSX.Element {
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Propiedad[]>([])
  const [duenos, setDuenos] = useState<Dueno[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Propiedad | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<Propiedad | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [adminFiltro, setAdminFiltro] = useState<AdminFiltro>('todas')
  // Confirmación al quitar "administrada" de una propiedad con contratos activos
  const [confirmUnmark, setConfirmUnmark] = useState<{ count: number } | null>(null)

  const duenoNombre = useMemo(() => {
    const m: Record<string, string> = {}
    for (const d of duenos) m[d.id] = d.nombre
    return m
  }, [duenos])

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: props, error }, { data: dus }] = await Promise.all([
      supabase.from('propiedades').select('*').order('direccion'),
      supabase.from('duenos').select('*').order('nombre')
    ])
    if (error) toast.error(error.message)
    setRows(props ?? [])
    setDuenos(dus ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows
      .filter((r) =>
        adminFiltro === 'todas'
          ? true
          : adminFiltro === 'admin'
            ? r.administrada
            : !r.administrada
      )
      .filter((r) =>
        !s
          ? true
          : [r.direccion, r.tipo, r.dueno_id ? duenoNombre[r.dueno_id] : '']
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(s))
      )
  }, [rows, q, duenoNombre, adminFiltro])

  const countAdmin = useMemo(() => rows.filter((r) => r.administrada).length, [rows])

  const openCreate = (): void => {
    setEditing(null)
    setForm(EMPTY)
    setModalOpen(true)
  }
  const openEdit = (d: Propiedad): void => {
    setEditing(d)
    setForm({ ...d })
    setModalOpen(true)
  }

  const persist = async (): Promise<void> => {
    setSaving(true)
    const payload = {
      direccion: form.direccion!.trim(),
      tipo: form.tipo || null,
      dueno_id: form.dueno_id || null,
      estado: (form.estado ?? 'vacia') as EstadoPropiedad,
      monto_expensas: Number(form.monto_expensas) || 0,
      paga_expensas: (form.paga_expensas ?? 'inquilino') as PagaExpensas,
      porcentaje_comision:
        form.porcentaje_comision === null || form.porcentaje_comision === undefined
          ? null
          : Number(form.porcentaje_comision),
      administrada: form.administrada ?? true,
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('propiedades').update(payload).eq('id', editing.id)
      : await supabase.from('propiedades').insert(payload)
    setSaving(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success(editing ? 'Propiedad actualizada' : 'Propiedad creada')
    setConfirmUnmark(null)
    setModalOpen(false)
    void load()
  }

  const save = async (): Promise<void> => {
    if (!form.direccion?.trim()) {
      toast.error('La dirección es obligatoria')
      return
    }
    // Si se está desmarcando "administrada" en una propiedad con contratos activos,
    // avisar qué implica antes de aplicar.
    if (editing && editing.administrada && form.administrada === false) {
      const { count } = await supabase
        .from('contratos')
        .select('*', { count: 'exact', head: true })
        .eq('propiedad_id', editing.id)
        .eq('estado', 'activo')
      if ((count ?? 0) > 0) {
        setConfirmUnmark({ count: count ?? 0 })
        return
      }
    }
    void persist()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('propiedades').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) {
      toast.error(
        error.message.includes('foreign key')
          ? 'No se puede eliminar: la propiedad tiene contratos asociados.'
          : error.message
      )
      return
    }
    toast.success('Propiedad eliminada')
    setDelTarget(null)
    void load()
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Propiedades"
        subtitle={`${rows.length} registrada${rows.length !== 1 ? 's' : ''}`}
        actions={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nueva propiedad
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            className="input w-full pl-9"
            placeholder="Buscar por dirección, tipo o dueño…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
          {(
            [
              ['todas', 'Todas'],
              ['admin', 'Administradas'],
              ['noadmin', 'No administradas']
            ] as [AdminFiltro, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setAdminFiltro(id)}
              className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                adminFiltro === id
                  ? 'bg-accent text-[#04110f] font-medium'
                  : 'text-ink-2 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Dirección</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Dueño</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Expensas</th>
              <th className="px-4 py-3 font-medium text-center">Comisión</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-600">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-600">
                  {rows.length === 0 ? 'Todavía no hay propiedades cargadas.' : 'Sin resultados.'}
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium">
                    <button
                      onClick={() => navigate(`/propiedades/${d.id}`)}
                      className="text-white hover:text-accent text-left"
                    >
                      {d.direccion}
                    </button>
                    <div className="mt-1">
                      {d.administrada ? (
                        <EstadoChip tone="ok">Administrada</EstadoChip>
                      ) : (
                        <EstadoChip tone="muted">No administrada</EstadoChip>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{d.tipo || '—'}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {d.dueno_id ? duenoNombre[d.dueno_id] ?? '—' : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs border capitalize ${ESTADO_BADGE[d.estado]}`}
                    >
                      {d.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-300 tabular-nums">
                    {d.monto_expensas > 0 ? (
                      <>
                        {formatARS(d.monto_expensas)}
                        <div className="text-[10px] text-zinc-600">paga {d.paga_expensas}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {d.porcentaje_comision != null ? (
                      <span className="text-zinc-300">{d.porcentaje_comision}%</span>
                    ) : (
                      <span className="text-[11px] text-zinc-600">hereda</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/propiedades/${d.id}`)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5"
                        title="Ver detalle"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => openEdit(d)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDelTarget(d)}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-white/5"
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
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar propiedad' : 'Nueva propiedad'}
        onClose={() => setModalOpen(false)}
        wide
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
          <Field label="Dirección" required>
            <TextInput
              value={form.direccion ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <TextInput
                placeholder="Depto, casa, local…"
                value={form.tipo ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
              />
            </Field>
            <Field label="Dueño">
              <Select
                value={form.dueno_id ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, dueno_id: e.target.value || null }))}
              >
                <option value="">— Sin asignar —</option>
                {duenos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Estado">
              <Select
                value={form.estado ?? 'vacia'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, estado: e.target.value as EstadoPropiedad }))
                }
              >
                <option value="vacia">Vacía</option>
                <option value="alquilada">Alquilada</option>
              </Select>
            </Field>
            <Field label="Monto expensas">
              <TextInput
                type="number"
                min={0}
                value={form.monto_expensas ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, monto_expensas: Number(e.target.value) }))
                }
              />
            </Field>
            <Field label="Paga expensas">
              <Select
                value={form.paga_expensas ?? 'inquilino'}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paga_expensas: e.target.value as PagaExpensas }))
                }
              >
                <option value="inquilino">Inquilino</option>
                <option value="dueno">Dueño</option>
              </Select>
            </Field>
          </div>
          <Field label="Comisión (%) — dejar vacío para heredar la del dueño">
            <TextInput
              type="number"
              min={0}
              max={100}
              step={0.5}
              placeholder="Hereda del dueño"
              value={form.porcentaje_comision ?? ''}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  porcentaje_comision: e.target.value === '' ? null : Number(e.target.value)
                }))
              }
            />
          </Field>
          {/* Toggle: administrada por LG Prop */}
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, administrada: !(f.administrada ?? true) }))}
            className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-left"
          >
            <div>
              <div className="text-sm text-white">Administrada por LG Prop</div>
              <div className="text-[11px] text-ink-2 mt-0.5">
                {form.administrada ?? true
                  ? 'Se cobra comisión, entra en liquidaciones y avisos.'
                  : 'Solo referencia: sin comisión, sin liquidaciones ni avisos.'}
              </div>
            </div>
            <span
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                form.administrada ?? true ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  form.administrada ?? true ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </span>
          </button>

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
        message={`¿Eliminar la propiedad "${delTarget?.direccion}"? Esta acción no se puede deshacer.`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />

      <ConfirmDialog
        open={!!confirmUnmark}
        title="Marcar como no administrada"
        message={`Esta propiedad tiene ${confirmUnmark?.count ?? 0} contrato(s) activo(s). Al marcarla como NO administrada, LG Prop deja de generar comisión y de incluirla en las liquidaciones, y no aparecerá en los avisos. Los contratos y pagos existentes se conservan. ¿Confirmás el cambio?`}
        confirmLabel="Sí, marcar como no administrada"
        onConfirm={persist}
        onClose={() => setConfirmUnmark(null)}
        loading={saving}
      />
    </div>
  )
}
