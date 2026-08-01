import { useEffect, useState } from 'react'
import { UserPlus, ShieldCheck, Loader2, Shield, Handshake, Pencil, Trash2, Plus } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { UsuarioEquipo, RolUsuario, Socio } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { formatDate } from '@/lib/format'

interface InviteForm {
  nombre: string
  email: string
  password: string
  rol: RolUsuario
}
const EMPTY: InviteForm = { nombre: '', email: '', password: '', rol: 'operador' }

type SocioForm = Partial<Socio>

export default function Equipo(): JSX.Element {
  const toast = useToast()
  const { member, refreshMember } = useAuth()
  const [rows, setRows] = useState<UsuarioEquipo[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<InviteForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [socios, setSocios] = useState<Socio[]>([])
  const [socioModal, setSocioModal] = useState(false)
  const [socioForm, setSocioForm] = useState<SocioForm>({})
  const [savingSocio, setSavingSocio] = useState(false)
  const [delSocio, setDelSocio] = useState<Socio | null>(null)

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data, error }, { data: soc }] = await Promise.all([
      supabase.from('usuarios_equipo').select('*').order('created_at'),
      supabase.from('socios').select('*').order('created_at')
    ])
    if (error) toast.error(error.message)
    setRows(data ?? [])
    setSocios(soc ?? [])
    setLoading(false)
  }

  const guardarSocio = async (): Promise<void> => {
    if (!socioForm.nombre?.trim()) return toast.error('Ingresá el nombre del socio')
    const pct = Number(socioForm.porcentaje_participacion)
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100)
      return toast.error('El % de participación debe estar entre 1 y 100')
    setSavingSocio(true)
    const payload = {
      nombre: socioForm.nombre.trim(),
      email: socioForm.email?.trim() || null,
      porcentaje_participacion: pct,
      usuario_equipo_id: socioForm.usuario_equipo_id || null,
      activo: socioForm.activo ?? true
    }
    const { error } = socioForm.id
      ? await supabase.from('socios').update(payload).eq('id', socioForm.id)
      : await supabase.from('socios').insert(payload)
    setSavingSocio(false)
    if (error) return void toast.error(error.message)
    toast.success(socioForm.id ? 'Socio actualizado' : 'Socio agregado')
    setSocioModal(false)
    await load()
    await refreshMember() // por si el usuario actual se acaba de volver socio
  }

  const eliminarSocio = async (): Promise<void> => {
    if (!delSocio) return
    const { error } = await supabase.from('socios').delete().eq('id', delSocio.id)
    if (error) return void toast.error(error.message)
    toast.success('Socio eliminado')
    setDelSocio(null)
    await load()
    await refreshMember()
  }

  useEffect(() => {
    void load()
  }, [])

  const changeRol = async (u: UsuarioEquipo, rol: RolUsuario): Promise<void> => {
    if (u.id === member?.id) return void toast.error('No podés cambiar tu propio rol')
    setRows((prev) => prev.map((x) => (x.id === u.id ? { ...x, rol } : x)))
    const { error } = await supabase.from('usuarios_equipo').update({ rol }).eq('id', u.id)
    if (error) {
      toast.error(error.message)
      void load()
    }
  }

  const toggleActivo = async (u: UsuarioEquipo): Promise<void> => {
    if (u.id === member?.id) return void toast.error('No podés desactivar tu propia cuenta')
    const activo = !u.activo
    setRows((prev) => prev.map((x) => (x.id === u.id ? { ...x, activo } : x)))
    const { error } = await supabase.from('usuarios_equipo').update({ activo }).eq('id', u.id)
    if (error) {
      toast.error(error.message)
      void load()
    }
  }

  const invitar = async (): Promise<void> => {
    if (!form.nombre.trim()) return toast.error('Ingresá el nombre')
    if (!form.email.trim()) return toast.error('Ingresá el email')
    if (form.password.length < 6) return toast.error('La contraseña debe tener al menos 6 caracteres')
    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('crear-usuario', {
        body: {
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          password: form.password,
          rol: form.rol
        }
      })
      if (error) throw error
      const res = data as { ok?: boolean; error?: string } | null
      if (!res?.ok) throw new Error(res?.error || 'No se pudo crear el usuario')
      toast.success('Usuario creado')
      setModalOpen(false)
      setForm(EMPTY)
      void load()
    } catch (e) {
      toast.error(
        (e as Error).message ||
          'No se pudo crear. Verificá que la Edge Function "crear-usuario" esté desplegada.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Equipo"
        subtitle="Usuarios y roles de acceso"
        actions={
          <button
            onClick={() => {
              setForm(EMPTY)
              setModalOpen(true)
            }}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <UserPlus size={16} /> Nuevo usuario
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium text-center">Activo</th>
              <th className="px-4 py-3 font-medium">Alta</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-600">
                  Todavía no hay usuarios cargados.
                </td>
              </tr>
            ) : (
              rows.map((u) => {
                const esYo = u.id === member?.id
                return (
                  <tr key={u.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white font-medium">
                      {u.nombre}
                      {esYo && <span className="text-[10px] text-zinc-500 ml-2">(vos)</span>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {u.rol === 'admin' ? (
                          <ShieldCheck size={14} className="text-accent" />
                        ) : (
                          <Shield size={14} className="text-zinc-500" />
                        )}
                        <select
                          value={u.rol}
                          disabled={esYo}
                          onChange={(e) => changeRol(u, e.target.value as RolUsuario)}
                          className="bg-surface border border-border rounded-md px-2 py-1 text-xs text-white outline-none disabled:opacity-50"
                        >
                          <option value="operador">Operador</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleActivo(u)}
                        disabled={esYo}
                        className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-40 ${
                          u.activo ? 'bg-emerald-600' : 'bg-zinc-700'
                        }`}
                        title={u.activo ? 'Activo' : 'Inactivo'}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                            u.activo ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{formatDate(u.created_at)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Socios de la sociedad ─────────────────────────────────────── */}
      <div className="flex items-center justify-between mt-8 mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Handshake size={16} className="text-accent" /> Socios de la sociedad
          </h2>
          <p className="text-xs text-zinc-500 mt-1">
            Dueños del negocio con % de participación. Solo ellos ven la sección{' '}
            <span className="text-zinc-300">Sociedad</span> (información financiera privada).
          </p>
        </div>
        <button
          onClick={() => {
            setSocioForm({ porcentaje_participacion: 50, activo: true })
            setSocioModal(true)
          }}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus size={16} /> Nuevo socio
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Socio</th>
              <th className="px-4 py-3 font-medium">Usuario vinculado</th>
              <th className="px-4 py-3 font-medium text-right">Participación</th>
              <th className="px-4 py-3 font-medium text-center">Activo</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {socios.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-600">
                  No hay socios cargados. Agregá a los dueños y vinculalos a su usuario del equipo.
                </td>
              </tr>
            ) : (
              socios.map((s) => {
                const usr = rows.find((u) => u.id === s.usuario_equipo_id)
                return (
                  <tr key={s.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white font-medium">
                      {s.nombre}
                      {s.email && <div className="text-[11px] text-zinc-500">{s.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {usr ? usr.nombre : <span className="text-amber-400">— sin vincular —</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-white tabular-nums">
                      {s.porcentaje_participacion}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={s.activo ? 'text-emerald-400' : 'text-zinc-500'}>
                        {s.activo ? 'Sí' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setSocioForm(s)
                            setSocioModal(true)
                          }}
                          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5"
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDelSocio(s)}
                          className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-white/5"
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
      {socios.length > 0 && (
        <p className="text-[11px] text-zinc-600 mt-2">
          Los % de participación deberían sumar 100% entre los socios activos (el cálculo los
          normaliza igual si no suman exacto).
        </p>
      )}

      <Modal
        open={socioModal}
        title={socioForm.id ? 'Editar socio' : 'Nuevo socio'}
        onClose={() => setSocioModal(false)}
        footer={
          <>
            <button
              onClick={() => setSocioModal(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button onClick={guardarSocio} disabled={savingSocio} className="btn-primary text-sm">
              {savingSocio ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nombre" required>
            <TextInput
              autoFocus
              value={socioForm.nombre ?? ''}
              onChange={(e) => setSocioForm((f) => ({ ...f, nombre: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <TextInput
                type="email"
                value={socioForm.email ?? ''}
                onChange={(e) => setSocioForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Participación (%)" required>
              <TextInput
                type="number"
                min={1}
                max={100}
                value={socioForm.porcentaje_participacion ?? 50}
                onChange={(e) =>
                  setSocioForm((f) => ({ ...f, porcentaje_participacion: Number(e.target.value) }))
                }
              />
            </Field>
          </div>
          <Field label="Usuario del equipo vinculado">
            <Select
              value={socioForm.usuario_equipo_id ?? ''}
              onChange={(e) =>
                setSocioForm((f) => ({ ...f, usuario_equipo_id: e.target.value || null }))
              }
            >
              <option value="">— Sin vincular —</option>
              {rows.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.email})
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={socioForm.activo ?? true}
              onChange={(e) => setSocioForm((f) => ({ ...f, activo: e.target.checked }))}
            />
            Socio activo
          </label>
          <p className="text-[11px] text-zinc-600">
            Vinculá el socio a su usuario del equipo para que pueda ver la sección Sociedad. Sin
            vincular, no tendrá acceso a la información financiera.
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delSocio}
        message={`¿Eliminar al socio "${delSocio?.nombre}"? Se borrarán también sus gastos de sociedad cargados.`}
        onConfirm={eliminarSocio}
        onClose={() => setDelSocio(null)}
      />

      <Modal
        open={modalOpen}
        title="Nuevo usuario"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button onClick={invitar} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Creando…' : 'Crear usuario'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nombre" required>
            <TextInput
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              autoFocus
            />
          </Field>
          <Field label="Email" required>
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Contraseña inicial" required>
              <TextInput
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="mín. 6 caracteres"
              />
            </Field>
            <Field label="Rol">
              <Select
                value={form.rol}
                onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value as RolUsuario }))}
              >
                <option value="operador">Operador</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
          </div>
          <p className="text-[11px] text-zinc-600">
            Se crea la cuenta con esa contraseña. El usuario puede cambiarla después. La creación la
            procesa la Edge Function <code className="text-zinc-400">crear-usuario</code> (con
            permisos de servicio).
          </p>
        </div>
      </Modal>
    </div>
  )
}
