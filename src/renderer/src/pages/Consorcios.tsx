import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Search, Eye, Building } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Consorcio, UnidadFuncional, UsuarioEquipo } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EstadoChip from '@/components/ui/EstadoChip'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { todayISO } from '@/lib/dates'

type Form = Partial<Consorcio>
const EMPTY: Form = {
  nombre: '',
  direccion: '',
  cuit: '',
  cantidad_unidades: 0,
  administrador_usuario_id: null,
  administrador_nombre: '',
  fecha_inicio_administracion: todayISO(),
  notas: ''
}

export default function Consorcios(): JSX.Element {
  const toast = useToast()
  const navigate = useNavigate()
  const { member } = useAuth()
  const [rows, setRows] = useState<Consorcio[]>([])
  const [unidades, setUnidades] = useState<Pick<UnidadFuncional, 'consorcio_id' | 'porcentaje_fiscal'>[]>([])
  const [equipo, setEquipo] = useState<UsuarioEquipo[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Consorcio | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<Consorcio | null>(null)
  const [deleting, setDeleting] = useState(false)

  const equipoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of equipo) m[e.id] = e.nombre
    return m
  }, [equipo])

  // Resumen de unidades por consorcio: cantidad y % fiscal asignado
  const resumenUnidades = useMemo(() => {
    const m: Record<string, { cant: number; pct: number }> = {}
    for (const u of unidades) {
      const r = (m[u.consorcio_id] ??= { cant: 0, pct: 0 })
      r.cant++
      r.pct += Number(u.porcentaje_fiscal) || 0
    }
    return m
  }, [unidades])

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: cons, error }, { data: uni }, { data: eq }] = await Promise.all([
      supabase.from('consorcios').select('*').order('nombre'),
      supabase.from('unidades_funcionales').select('consorcio_id, porcentaje_fiscal'),
      supabase.from('usuarios_equipo').select('*').order('nombre')
    ])
    if (error) toast.error(error.message)
    setRows(cons ?? [])
    setUnidades(uni ?? [])
    setEquipo(eq ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) =>
      [r.nombre, r.direccion, r.cuit].filter(Boolean).some((v) => String(v).toLowerCase().includes(s))
    )
  }, [rows, q])

  const openCreate = (): void => {
    setEditing(null)
    setForm({ ...EMPTY, administrador_usuario_id: member?.id ?? null })
    setModalOpen(true)
  }
  const openEdit = (c: Consorcio): void => {
    setEditing(c)
    setForm({ ...c })
    setModalOpen(true)
  }

  const save = async (): Promise<void> => {
    if (!form.nombre?.trim()) return toast.error('El nombre del consorcio es obligatorio')
    setSaving(true)
    const payload = {
      nombre: form.nombre.trim(),
      direccion: form.direccion || null,
      cuit: form.cuit || null,
      cantidad_unidades: Number(form.cantidad_unidades) || 0,
      administrador_usuario_id: form.administrador_usuario_id || null,
      administrador_nombre: form.administrador_nombre || null,
      fecha_inicio_administracion: form.fecha_inicio_administracion || todayISO(),
      notas: form.notas || null
    }
    const { error } = editing
      ? await supabase.from('consorcios').update(payload).eq('id', editing.id)
      : await supabase.from('consorcios').insert(payload)
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Consorcio actualizado' : 'Consorcio creado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('consorcios').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Consorcio eliminado')
    setDelTarget(null)
    void load()
  }

  const pctChip = (pct: number): JSX.Element => {
    const round = Math.round(pct * 1000) / 1000
    if (round === 100) return <EstadoChip tone="ok">100%</EstadoChip>
    if (round === 0) return <EstadoChip tone="muted">sin asignar</EstadoChip>
    return <EstadoChip tone="warn">{round}%</EstadoChip>
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Consorcios"
        subtitle={`${rows.length} edificio${rows.length !== 1 ? 's' : ''} en administración`}
        actions={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nuevo consorcio
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          className="input w-full pl-9"
          placeholder="Buscar por nombre, dirección o CUIT…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Consorcio</th>
              <th className="px-4 py-3 font-medium">CUIT</th>
              <th className="px-4 py-3 font-medium text-center">Unidades</th>
              <th className="px-4 py-3 font-medium">% fiscal asignado</th>
              <th className="px-4 py-3 font-medium">Administrador</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-3">
                  Cargando…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-3">
                  {rows.length === 0
                    ? 'Todavía no hay consorcios cargados.'
                    : 'Sin resultados.'}
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const r = resumenUnidades[c.id] ?? { cant: 0, pct: 0 }
                return (
                  <tr key={c.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium">
                      <button
                        onClick={() => navigate(`/consorcios/${c.id}`)}
                        className="text-white hover:text-accent text-left flex items-center gap-2"
                      >
                        <Building size={15} className="text-ink-3 shrink-0" />
                        <span>
                          {c.nombre}
                          {c.direccion && (
                            <span className="block text-[11px] text-ink-3 font-normal">
                              {c.direccion}
                            </span>
                          )}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{c.cuit || '—'}</td>
                    <td className="px-4 py-3 text-center num text-ink-2">
                      {r.cant}
                      {c.cantidad_unidades > 0 && r.cant !== c.cantidad_unidades && (
                        <span className="text-[10px] text-ink-3"> / {c.cantidad_unidades}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{pctChip(r.pct)}</td>
                    <td className="px-4 py-3 text-ink-2">
                      {c.administrador_usuario_id
                        ? equipoMap[c.administrador_usuario_id] ?? '—'
                        : c.administrador_nombre || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => navigate(`/consorcios/${c.id}`)}
                          className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-white/5"
                          title="Ver detalle"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-white/5"
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDelTarget(c)}
                          className="p-1.5 rounded-md text-ink-2 hover:text-bad hover:bg-white/5"
                          title="Eliminar"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar consorcio' : 'Nuevo consorcio'}
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
          <Field label="Nombre / identificación del edificio" required>
            <TextInput
              value={form.nombre ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              placeholder="Ej: Consorcio Edificio Rivadavia 2500"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dirección">
              <TextInput
                value={form.direccion ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
              />
            </Field>
            <Field label="CUIT del consorcio">
              <TextInput
                value={form.cuit ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, cuit: e.target.value }))}
                placeholder="30-xxxxxxxx-x"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Cantidad de unidades">
              <TextInput
                type="number"
                min={0}
                value={form.cantidad_unidades ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, cantidad_unidades: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Inicio de administración">
              <TextInput
                type="date"
                value={form.fecha_inicio_administracion ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fecha_inicio_administracion: e.target.value }))
                }
              />
            </Field>
            <Field label="Administrador designado">
              <Select
                value={form.administrador_usuario_id ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, administrador_usuario_id: e.target.value || null }))
                }
              >
                <option value="">— Externo / otro —</option>
                {equipo.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                    {member?.id === e.id ? ' (vos)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!form.administrador_usuario_id && (
            <Field label="Nombre del administrador externo (si no es del equipo)">
              <TextInput
                value={form.administrador_nombre ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, administrador_nombre: e.target.value }))}
              />
            </Field>
          )}
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
        message={`¿Eliminar el consorcio "${delTarget?.nombre}"? Se borran también sus unidades funcionales. Esta acción no se puede deshacer.`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
