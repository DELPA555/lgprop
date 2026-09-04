import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, UserCheck, Instagram, Facebook, Globe, Loader2 } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type {
  Prospecto,
  RedOrigenProspecto,
  EstadoProspecto,
  Propiedad
} from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import TelefonoWhatsApp from '@/components/ui/TelefonoWhatsApp'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/format'
import { todayISO } from '@/lib/dates'

const RED_LABEL: Record<RedOrigenProspecto, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  otro: 'Otro'
}
const RED_BADGE: Record<RedOrigenProspecto, string> = {
  instagram: 'bg-pink-500/10 text-pink-400 border-pink-500/25',
  facebook: 'bg-sky-500/10 text-sky-400 border-sky-500/25',
  otro: 'bg-white/[0.05] text-ink-2 border-border'
}
const RedIcon = ({ red }: { red: RedOrigenProspecto }): JSX.Element => {
  if (red === 'instagram') return <Instagram size={13} />
  if (red === 'facebook') return <Facebook size={13} />
  return <Globe size={13} />
}

const ESTADO_LABEL: Record<EstadoProspecto, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  seguimiento: 'En seguimiento',
  descartado: 'Descartado',
  convertido: 'Convertido en cliente'
}
const ESTADO_BADGE: Record<EstadoProspecto, string> = {
  nuevo: 'bg-info/10 text-info border-info/25',
  contactado: 'bg-accent/12 text-accent border-accent/25',
  seguimiento: 'bg-warn/10 text-warn border-warn/25',
  descartado: 'bg-white/[0.05] text-ink-3 border-border',
  convertido: 'bg-ok/10 text-ok border-ok/25'
}

type Form = Partial<Prospecto>

export default function Prospectos(): JSX.Element {
  const toast = useToast()
  const { member } = useAuth()
  const [rows, setRows] = useState<Prospecto[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [fRed, setFRed] = useState<'' | RedOrigenProspecto>('')
  const [fEstado, setFEstado] = useState<'' | EstadoProspecto>('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Prospecto | null>(null)
  const [form, setForm] = useState<Form>({})

  const [delTarget, setDelTarget] = useState<Prospecto | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [convTarget, setConvTarget] = useState<Prospecto | null>(null)
  const [convTipo, setConvTipo] = useState<'inquilino' | 'dueno'>('inquilino')
  const [converting, setConverting] = useState(false)

  const propMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of propiedades) m[p.id] = p.direccion
    return m
  }, [propiedades])

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: pr }, { data: pp }] = await Promise.all([
      supabase.from('prospectos').select('*').order('fecha_contacto', { ascending: false }),
      supabase.from('propiedades').select('id, direccion, estado').order('direccion')
    ])
    setRows(pr ?? [])
    setPropiedades((pp as Propiedad[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [])

  const visibles = useMemo(
    () => rows.filter((r) => (!fRed || r.red_origen === fRed) && (!fEstado || r.estado === fEstado)),
    [rows, fRed, fEstado]
  )

  const openCreate = (): void => {
    setEditing(null)
    setForm({ red_origen: 'instagram', estado: 'nuevo', fecha_contacto: todayISO() })
    setModalOpen(true)
  }
  const openEdit = (r: Prospecto): void => {
    setEditing(r)
    setForm({ ...r })
    setModalOpen(true)
  }

  const cambiarEstado = async (r: Prospecto, estado: EstadoProspecto): Promise<void> => {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, estado } : x)))
    const { error } = await supabase.from('prospectos').update({ estado }).eq('id', r.id)
    if (error) {
      toast.error(error.message)
      void load()
    }
  }

  const save = async (): Promise<void> => {
    if (!form.nombre?.trim()) return void toast.error('Poné el nombre del prospecto')
    setSaving(true)
    const payload = {
      nombre: form.nombre.trim(),
      telefono: form.telefono?.trim() || null,
      red_origen: (form.red_origen ?? 'instagram') as RedOrigenProspecto,
      fecha_contacto: form.fecha_contacto || todayISO(),
      propiedad_id: form.propiedad_id || null,
      propiedad_interes: form.propiedad_interes?.trim() || null,
      estado: (form.estado ?? 'nuevo') as EstadoProspecto,
      notas: form.notas?.trim() || null
    }
    const { error } = editing
      ? await supabase.from('prospectos').update(payload).eq('id', editing.id)
      : await supabase.from('prospectos').insert({ ...payload, creado_por: member?.id ?? null })
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success(editing ? 'Prospecto actualizado' : 'Prospecto agregado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('prospectos').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Prospecto eliminado')
    setDelTarget(null)
    void load()
  }

  const openConvertir = (r: Prospecto): void => {
    setConvTarget(r)
    setConvTipo('inquilino')
  }

  const convertir = async (): Promise<void> => {
    if (!convTarget) return
    setConverting(true)
    try {
      const base = { nombre: convTarget.nombre, telefono: convTarget.telefono || null }
      const tabla = convTipo === 'inquilino' ? 'inquilinos' : 'duenos'
      const ins = await supabase.from(tabla).insert(base).select('id').single()
      if (ins.error) return void toast.error(ins.error.message)
      const upd = await supabase
        .from('prospectos')
        .update({
          estado: 'convertido',
          convertido_inquilino_id: convTipo === 'inquilino' ? ins.data.id : null,
          convertido_dueno_id: convTipo === 'dueno' ? ins.data.id : null
        })
        .eq('id', convTarget.id)
      if (upd.error) return void toast.error(upd.error.message)
      toast.success(
        `Prospecto convertido en ${convTipo === 'inquilino' ? 'inquilino' : 'dueño'}. Completá sus datos en ${
          convTipo === 'inquilino' ? 'Inquilinos' : 'Dueños'
        }.`
      )
      setConvTarget(null)
      void load()
    } finally {
      setConverting(false)
    }
  }

  const set = (p: Partial<Form>): void => setForm((f) => ({ ...f, ...p }))

  return (
    <div className="p-6">
      <PageHeader
        title="Prospectos"
        subtitle="Contactos de Instagram y Facebook para recontactar"
        actions={
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nuevo prospecto
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select
          value={fRed}
          onChange={(e) => setFRed(e.target.value as '' | RedOrigenProspecto)}
          className="w-auto"
        >
          <option value="">Todas las redes</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="otro">Otro</option>
        </Select>
        <Select
          value={fEstado}
          onChange={(e) => setFEstado(e.target.value as '' | EstadoProspecto)}
          className="w-auto"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(ESTADO_LABEL) as EstadoProspecto[]).map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABEL[e]}
            </option>
          ))}
        </Select>
        <span className="text-xs text-ink-3">
          {visibles.length} prospecto{visibles.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Red</th>
              <th className="px-4 py-3 font-medium">Contacto</th>
              <th className="px-4 py-3 font-medium">Interés</th>
              <th className="px-4 py-3 font-medium">Teléfono</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-3">
                  Cargando…
                </td>
              </tr>
            ) : visibles.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-3">
                  No hay prospectos. Cargá el primero con “Nuevo prospecto”.
                </td>
              </tr>
            ) : (
              visibles.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ink font-medium">{r.nombre}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${RED_BADGE[r.red_origen]}`}
                    >
                      <RedIcon red={r.red_origen} />
                      {RED_LABEL[r.red_origen]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-2 num text-xs">{formatDate(r.fecha_contacto)}</td>
                  <td className="px-4 py-3 text-ink-2 text-xs max-w-[200px] truncate">
                    {r.propiedad_id ? propMap[r.propiedad_id] : r.propiedad_interes || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {r.telefono ? (
                      <TelefonoWhatsApp
                        numero={r.telefono}
                        mensaje={`Hola ${r.nombre}, te contactamos de LG Propiedades por tu consulta.`}
                        size={14}
                      />
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={r.estado}
                      onChange={(e) => cambiarEstado(r, e.target.value as EstadoProspecto)}
                      className={`text-xs rounded-full border px-2 py-0.5 bg-transparent cursor-pointer ${ESTADO_BADGE[r.estado]}`}
                      title="Cambiar estado"
                    >
                      {(Object.keys(ESTADO_LABEL) as EstadoProspecto[]).map((e) => (
                        <option key={e} value={e} className="bg-surface text-ink">
                          {ESTADO_LABEL[e]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {r.estado !== 'convertido' && (
                        <button
                          onClick={() => openConvertir(r)}
                          className="p-1.5 rounded-md text-ink-3 hover:text-ok hover:bg-white/5"
                          title="Convertir en cliente (inquilino o dueño)"
                        >
                          <UserCheck size={15} />
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 rounded-md text-ink-3 hover:text-ink hover:bg-white/5"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDelTarget(r)}
                        className="p-1.5 rounded-md text-ink-3 hover:text-bad hover:bg-white/5"
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

      {/* Alta / edición */}
      <Modal
        open={modalOpen}
        title={editing ? 'Editar prospecto' : 'Nuevo prospecto'}
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" required>
              <TextInput
                value={form.nombre ?? ''}
                onChange={(e) => set({ nombre: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Teléfono">
              <TextInput
                value={form.telefono ?? ''}
                onChange={(e) => set({ telefono: e.target.value })}
                placeholder="223 555 1234"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Red de origen">
              <Select
                value={form.red_origen ?? 'instagram'}
                onChange={(e) => set({ red_origen: e.target.value as RedOrigenProspecto })}
              >
                <option value="instagram">Instagram</option>
                <option value="facebook">Facebook</option>
                <option value="otro">Otro</option>
              </Select>
            </Field>
            <Field label="Fecha de contacto">
              <TextInput
                type="date"
                value={form.fecha_contacto ?? ''}
                onChange={(e) => set({ fecha_contacto: e.target.value })}
              />
            </Field>
            <Field label="Estado">
              <Select
                value={form.estado ?? 'nuevo'}
                onChange={(e) => set({ estado: e.target.value as EstadoProspecto })}
              >
                {(Object.keys(ESTADO_LABEL) as EstadoProspecto[]).map((e) => (
                  <option key={e} value={e}>
                    {ESTADO_LABEL[e]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Propiedad de interés (del sistema)">
            <Select
              value={form.propiedad_id ?? ''}
              onChange={(e) => set({ propiedad_id: e.target.value || null })}
            >
              <option value="">— Sin especificar —</option>
              {propiedades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.direccion}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Propiedad de interés (texto libre)">
            <TextInput
              value={form.propiedad_interes ?? ''}
              onChange={(e) => set({ propiedad_interes: e.target.value })}
              placeholder="Ej: 2 ambientes en el centro, hasta $250.000"
            />
          </Field>
          <Field label="Notas">
            <TextArea
              value={form.notas ?? ''}
              onChange={(e) => set({ notas: e.target.value })}
              placeholder="Qué consultó, seguimiento, etc."
            />
          </Field>
        </div>
      </Modal>

      {/* Convertir en cliente */}
      <Modal
        open={!!convTarget}
        title="Convertir en cliente"
        onClose={() => setConvTarget(null)}
        footer={
          <>
            <button
              onClick={() => setConvTarget(null)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button
              onClick={convertir}
              disabled={converting}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {converting ? <Loader2 size={15} className="animate-spin" /> : <UserCheck size={15} />}
              Convertir
            </button>
          </>
        }
      >
        {convTarget && (
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              Se crea <span className="text-ink">{convTarget.nombre}</span>
              {convTarget.telefono ? ` (${convTarget.telefono})` : ''} en el sistema y el prospecto
              queda marcado como convertido.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['inquilino', 'dueno'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setConvTipo(t)}
                  className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                    convTipo === t
                      ? 'border-accent/50 bg-accent/10 text-accent'
                      : 'border-border text-ink-2 hover:text-ink'
                  }`}
                >
                  Crear como {t === 'inquilino' ? 'inquilino' : 'dueño'}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-3">
              Después completá el resto de los datos en el módulo correspondiente.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message={`¿Eliminar a "${delTarget?.nombre}" de prospectos?`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
