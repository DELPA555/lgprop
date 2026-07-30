import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, Home, Users } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type {
  Consorcio,
  UnidadFuncional,
  PropietarioConsorcio,
  UsuarioEquipo
} from '@/types/database'
import ConfigNotice from '@/components/ConfigNotice'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EstadoChip from '@/components/ui/EstadoChip'
import TelefonoWhatsApp from '@/components/ui/TelefonoWhatsApp'
import Modal from '@/components/ui/Modal'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import ProveedoresSection from '@/components/consorcios/ProveedoresSection'
import GastosSection from '@/components/consorcios/GastosSection'
import LiquidacionExpensasSection from '@/components/consorcios/LiquidacionExpensasSection'
import FondoReservaSection from '@/components/consorcios/FondoReservaSection'

const NUEVO = '__new__'

export default function ConsorcioDetalle(): JSX.Element {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [cons, setCons] = useState<Consorcio | null>(null)
  const [unidades, setUnidades] = useState<UnidadFuncional[]>([])
  const [propietarios, setPropietarios] = useState<PropietarioConsorcio[]>([])
  const [equipo, setEquipo] = useState<UsuarioEquipo[]>([])
  const [loading, setLoading] = useState(true)

  // Modal de unidad
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<UnidadFuncional | null>(null)
  const [identificador, setIdentificador] = useState('')
  const [propietarioId, setPropietarioId] = useState('')
  const [pctFiscal, setPctFiscal] = useState<number>(0)
  const [notas, setNotas] = useState('')
  // Alta rápida de propietario
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoTel, setNuevoTel] = useState('')
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<UnidadFuncional | null>(null)
  const [deleting, setDeleting] = useState(false)

  const propMap = useMemo(() => {
    const m: Record<string, PropietarioConsorcio> = {}
    for (const p of propietarios) m[p.id] = p
    return m
  }, [propietarios])
  const equipoMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of equipo) m[e.id] = e.nombre
    return m
  }, [equipo])

  const totalPct = useMemo(
    () => unidades.reduce((t, u) => t + (Number(u.porcentaje_fiscal) || 0), 0),
    [unidades]
  )
  const totalRound = Math.round(totalPct * 1000) / 1000

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured || !id) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: c }, { data: uni }, { data: props }, { data: eq }] = await Promise.all([
      supabase.from('consorcios').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('unidades_funcionales')
        .select('*')
        .eq('consorcio_id', id)
        .order('identificador'),
      supabase.from('propietarios_consorcio').select('*').order('nombre'),
      supabase.from('usuarios_equipo').select('*')
    ])
    setCons(c ?? null)
    setUnidades(uni ?? [])
    setPropietarios(props ?? [])
    setEquipo(eq ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [id])

  const openCreate = (): void => {
    setEditing(null)
    setIdentificador('')
    setPropietarioId('')
    setPctFiscal(0)
    setNotas('')
    setNuevoNombre('')
    setNuevoTel('')
    setNuevoEmail('')
    setModalOpen(true)
  }
  const openEdit = (u: UnidadFuncional): void => {
    setEditing(u)
    setIdentificador(u.identificador)
    setPropietarioId(u.propietario_id ?? '')
    setPctFiscal(Number(u.porcentaje_fiscal) || 0)
    setNotas(u.notas ?? '')
    setNuevoNombre('')
    setNuevoTel('')
    setNuevoEmail('')
    setModalOpen(true)
  }

  const guardarUnidad = async (): Promise<void> => {
    if (!identificador.trim()) return toast.error('Poné el identificador de la unidad (ej: 3° B)')
    const pct = Number(pctFiscal) || 0
    if (pct < 0) return toast.error('El % fiscal no puede ser negativo')
    // Validar que no se pase de 100% (excluyendo la unidad que se está editando)
    const otros = unidades
      .filter((u) => u.id !== editing?.id)
      .reduce((t, u) => t + (Number(u.porcentaje_fiscal) || 0), 0)
    if (otros + pct > 100.0001) {
      return toast.error(
        `El % fiscal excede el 100%. Ya hay ${Math.round(otros * 1000) / 1000}% asignado en otras unidades.`
      )
    }
    if (propietarioId === NUEVO && !nuevoNombre.trim())
      return toast.error('Poné el nombre del nuevo propietario')

    setSaving(true)
    try {
      // Alta rápida de propietario si corresponde
      let propId: string | null = propietarioId || null
      if (propietarioId === NUEVO) {
        const { data, error } = await supabase
          .from('propietarios_consorcio')
          .insert({
            nombre: nuevoNombre.trim(),
            telefono: nuevoTel || null,
            email: nuevoEmail || null
          })
          .select('id')
          .single()
        if (error || !data) {
          setSaving(false)
          return void toast.error(error?.message ?? 'No se pudo crear el propietario')
        }
        propId = data.id
      }

      const payload = {
        consorcio_id: id,
        identificador: identificador.trim(),
        propietario_id: propId,
        porcentaje_fiscal: pct,
        notas: notas || null
      }
      const { error } = editing
        ? await supabase.from('unidades_funcionales').update(payload).eq('id', editing.id)
        : await supabase.from('unidades_funcionales').insert(payload)
      setSaving(false)
      if (error) return void toast.error(error.message)
      toast.success(editing ? 'Unidad actualizada' : 'Unidad agregada')
      setModalOpen(false)
      void load()
    } catch (e) {
      setSaving(false)
      toast.error((e as Error).message)
    }
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('unidades_funcionales').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Unidad eliminada')
    setDelTarget(null)
    void load()
  }

  const totalChip = (): JSX.Element => {
    if (totalRound === 100) return <EstadoChip tone="ok">100% asignado</EstadoChip>
    if (totalRound > 100) return <EstadoChip tone="bad">excede: {totalRound}%</EstadoChip>
    return <EstadoChip tone="warn">{totalRound}% · faltan {Math.round((100 - totalRound) * 1000) / 1000}%</EstadoChip>
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6">
        <ConfigNotice />
      </div>
    )
  }

  const adminNombre = cons?.administrador_usuario_id
    ? equipoMap[cons.administrador_usuario_id] ?? '—'
    : cons?.administrador_nombre || '—'

  return (
    <div className="p-6">
      <button
        onClick={() => navigate('/consorcios')}
        className="flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink mb-4"
      >
        <ArrowLeft size={15} /> Volver a Consorcios
      </button>

      {loading && !cons ? (
        <div className="flex items-center gap-2 text-ink-3">
          <Loader2 size={16} className="animate-spin" /> Cargando…
        </div>
      ) : !cons ? (
        <p className="text-ink-3">No se encontró el consorcio.</p>
      ) : (
        <>
          {/* Info del consorcio */}
          <div className="card p-5 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                <Home size={18} />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">{cons.nombre}</h1>
                {cons.direccion && <p className="text-sm text-ink-2">{cons.direccion}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
              <div>
                <div className="text-xs text-ink-3 uppercase tracking-wider">CUIT</div>
                <div className="text-ink-2 mt-0.5">{cons.cuit || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-ink-3 uppercase tracking-wider">Unidades</div>
                <div className="text-ink-2 mt-0.5 num">
                  {unidades.length}
                  {cons.cantidad_unidades > 0 && ` / ${cons.cantidad_unidades} declaradas`}
                </div>
              </div>
              <div>
                <div className="text-xs text-ink-3 uppercase tracking-wider">Administrador</div>
                <div className="text-ink-2 mt-0.5">{adminNombre}</div>
              </div>
              <div>
                <div className="text-xs text-ink-3 uppercase tracking-wider">Desde</div>
                <div className="text-ink-2 mt-0.5">
                  {formatDate(cons.fecha_inicio_administracion)}
                </div>
              </div>
            </div>
          </div>

          {/* Unidades funcionales */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Users size={16} className="text-ink-3" /> Unidades funcionales
              <span className="ml-1">{totalChip()}</span>
            </h2>
            <button
              onClick={openCreate}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Plus size={15} /> Nueva unidad
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
                  <th className="px-4 py-3 font-medium">Unidad</th>
                  <th className="px-4 py-3 font-medium">Propietario</th>
                  <th className="px-4 py-3 font-medium">Contacto</th>
                  <th className="px-4 py-3 font-medium text-right">% fiscal</th>
                  <th className="px-4 py-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {unidades.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-ink-3">
                      Todavía no hay unidades cargadas. Agregá la primera con “Nueva unidad”.
                    </td>
                  </tr>
                ) : (
                  unidades.map((u) => {
                    const p = u.propietario_id ? propMap[u.propietario_id] : null
                    return (
                      <tr key={u.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-white font-medium">{u.identificador}</td>
                        <td className="px-4 py-3 text-ink-2">{p?.nombre ?? '—'}</td>
                        <td className="px-4 py-3 text-ink-2">
                          {p?.telefono ? (
                            <TelefonoWhatsApp numero={p.telefono} size={14} />
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right num text-ink-2">
                          {Number(u.porcentaje_fiscal) || 0}%
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEdit(u)}
                              className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-white/5"
                              title="Editar"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => setDelTarget(u)}
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

          {totalRound !== 100 && unidades.length > 0 && (
            <p className="text-xs text-warn mt-2">
              La suma de los % fiscales debería dar 100%. Actualmente suma {totalRound}%.
            </p>
          )}

          {/* Tanda 2: gastos + proveedores del edificio */}
          <GastosSection consorcioId={id} />
          <ProveedoresSection consorcioId={id} />

          {/* Tanda 3: liquidación de expensas + fondo de reserva */}
          <LiquidacionExpensasSection consorcio={cons} />
          <FondoReservaSection consorcioId={id} />
        </>
      )}

      {/* Modal de unidad */}
      <Modal
        open={modalOpen}
        title={editing ? 'Editar unidad' : 'Nueva unidad funcional'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button onClick={guardarUnidad} disabled={saving} className="btn-primary text-sm">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Identificador (piso/depto)" required>
              <TextInput
                value={identificador}
                onChange={(e) => setIdentificador(e.target.value)}
                placeholder="Ej: 3° B"
                autoFocus
              />
            </Field>
            <Field label="% fiscal">
              <TextInput
                type="number"
                min={0}
                max={100}
                step={0.001}
                value={pctFiscal}
                onChange={(e) => setPctFiscal(Number(e.target.value))}
              />
            </Field>
          </div>

          <Field label="Propietario">
            <Select value={propietarioId} onChange={(e) => setPropietarioId(e.target.value)}>
              <option value="">— Sin asignar —</option>
              {propietarios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
              <option value={NUEVO}>＋ Crear nuevo propietario…</option>
            </Select>
          </Field>

          {propietarioId === NUEVO && (
            <div className="rounded-lg border border-border bg-surface p-3 space-y-3">
              <p className="text-xs text-ink-3 uppercase tracking-wider">Nuevo propietario</p>
              <Field label="Nombre" required>
                <TextInput value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono">
                  <TextInput value={nuevoTel} onChange={(e) => setNuevoTel(e.target.value)} />
                </Field>
                <Field label="Email">
                  <TextInput value={nuevoEmail} onChange={(e) => setNuevoEmail(e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          <Field label="Notas">
            <TextArea value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message={`¿Eliminar la unidad "${delTarget?.identificador}"? Esta acción no se puede deshacer.`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </div>
  )
}
