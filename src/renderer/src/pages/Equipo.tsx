import { useEffect, useState } from 'react'
import { UserPlus, ShieldCheck, Loader2, Shield } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { UsuarioEquipo, RolUsuario } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
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

export default function Equipo(): JSX.Element {
  const toast = useToast()
  const { member } = useAuth()
  const [rows, setRows] = useState<UsuarioEquipo[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<InviteForm>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('usuarios_equipo')
      .select('*')
      .order('created_at')
    if (error) toast.error(error.message)
    setRows(data ?? [])
    setLoading(false)
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
