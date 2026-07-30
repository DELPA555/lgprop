import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  CalendarClock,
  Upload,
  Sparkles,
  Loader2,
  UserPlus,
  Home,
  AlertTriangle,
  ShieldCheck,
  Paperclip,
  FileText
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type {
  Contrato,
  Propiedad,
  Inquilino,
  Dueno,
  EstadoContrato,
  EstadoDeposito,
  TipoIndice,
  Moneda
} from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import TelefonoWhatsApp from '@/components/ui/TelefonoWhatsApp'
import ContratoMontos from '@/components/ui/ContratoMontos'
import { formatARS, formatDate, formatMoneda } from '@/lib/format'
import {
  computeFechaFin,
  computeProximaActualizacion,
  daysUntil,
  monthsBetween,
  todayISO
} from '@/lib/dates'
import GenerarContratoModal from '@/components/ai/GenerarContratoModal'
import ArchivoPreviewModal from '@/components/ArchivoPreviewModal'
import { edgeErrorMessage } from '@/lib/edgeError'
import {
  subirArchivo,
  listarArchivosPorContratos,
  borrarArchivo
} from '@/lib/contratoArchivos'
import type { ContratoArchivo } from '@/types/database'

type Form = Partial<Contrato>

// Datos que devuelve la Edge Function de extracción de contratos.
type Extraido = {
  nombre_inquilino?: string | null
  dni_inquilino?: string | null
  email_inquilino?: string | null
  telefono_inquilino?: string | null
  nombre_dueno?: string | null
  email_dueno?: string | null
  telefono_dueno?: string | null
  dueno_confianza?: 'alta' | 'baja' | null
  direccion_propiedad?: string | null
  monto_inicial?: number | null
  fecha_inicio?: string | null
  fecha_fin?: string | null
  duracion_meses?: number | null
  indice_actualizacion?: string | null
  frecuencia_actualizacion_meses?: number | null
  monto_expensas?: number | null
}

const INDICES: TipoIndice[] = [
  'ICL',
  'IPC',
  'Casa Propia',
  'UVA',
  'Combinado',
  'Porcentaje fijo',
  'Manual'
]

const EMPTY: Form = {
  propiedad_id: '',
  inquilino_id: '',
  dueno_id: null,
  fecha_inicio: todayISO(),
  fecha_fin: '',
  moneda: 'ARS',
  indice_sobre: null,
  monto_inicial: 0,
  monto_actual: 0,
  indice_actualizacion: 'ICL',
  indice_primario: null,
  indice_secundario: null,
  frecuencia_actualizacion_meses: 3,
  duracion_meses: 36,
  porcentaje_fijo: null,
  proxima_actualizacion: null,
  estado: 'activo',
  monto_deposito: 0,
  estado_deposito: 'retenido',
  fecha_devolucion_deposito: null,
  motivo_finalizacion: null,
  notas: ''
}

const ESTADO_BADGE: Record<EstadoContrato, string> = {
  activo: 'bg-ok/10 text-ok border-ok/25',
  vencido: 'bg-warn/10 text-warn border-warn/25',
  rescindido: 'bg-white/[0.03] text-ink-2 border-border'
}

export default function Contratos(): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<Contrato[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([])
  const [duenos, setDuenos] = useState<Dueno[]>([])
  // Contratos con actualización calculada pero sin confirmar
  const [pendientesSet, setPendientesSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Contrato | null>(null)
  const [form, setForm] = useState<Form>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [delTarget, setDelTarget] = useState<Contrato | null>(null)
  const [deleting, setDeleting] = useState(false)
  // IA: carga de contrato existente (extracción) y redacción
  const fileRef = useRef<HTMLInputElement>(null)
  const [extracting, setExtracting] = useState(false)
  const [extraido, setExtraido] = useState<Extraido | null>(null)
  // Avisos de revisión manual sobre lo que extrajo la IA (dueño dudoso, plazo incierto…)
  const [extraccionAvisos, setExtraccionAvisos] = useState<string[]>([])
  const [generarOpen, setGenerarOpen] = useState(false)
  // Archivos del contrato
  const archivoInputRef = useRef<HTMLInputElement>(null)
  const [archivosNuevos, setArchivosNuevos] = useState<File[]>([])
  const [archivosExistentes, setArchivosExistentes] = useState<ContratoArchivo[]>([])
  const [previewArchivo, setPreviewArchivo] = useState<ContratoArchivo | null>(null)

  const propMap = useMemo(() => {
    const m: Record<string, Propiedad> = {}
    for (const p of propiedades) m[p.id] = p
    return m
  }, [propiedades])
  const inqMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const i of inquilinos) m[i.id] = i.nombre
    return m
  }, [inquilinos])
  const duenoMap = useMemo(() => {
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
    const [ctr, prop, inq, dus, act] = await Promise.all([
      supabase.from('contratos').select('*').order('fecha_fin'),
      supabase.from('propiedades').select('*').order('direccion'),
      supabase.from('inquilinos').select('*').order('nombre'),
      supabase.from('duenos').select('*').order('nombre'),
      supabase
        .from('actualizaciones_contrato')
        .select('contrato_id')
        .eq('confirmado_por_usuario', false)
    ])
    if (ctr.error) toast.error(ctr.error.message)
    setRows(ctr.data ?? [])
    setPropiedades(prop.data ?? [])
    setInquilinos(inq.data ?? [])
    setDuenos(dus.data ?? [])
    setPendientesSet(new Set((act.data ?? []).map((a) => a.contrato_id)))
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((r) =>
      [propMap[r.propiedad_id]?.direccion, inqMap[r.inquilino_id], r.indice_actualizacion]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s))
    )
  }, [rows, q, propMap, inqMap])

  // Patch con recálculo de campos derivados (fecha_fin y próxima actualización)
  const patch = (next: Partial<Form>): void => {
    setForm((prev) => {
      const m = { ...prev, ...next }
      if (next.fecha_inicio !== undefined || next.duracion_meses !== undefined) {
        m.fecha_fin = computeFechaFin(m.fecha_inicio ?? '', Number(m.duracion_meses) || 0)
      }
      if (
        next.fecha_inicio !== undefined ||
        next.frecuencia_actualizacion_meses !== undefined ||
        next.duracion_meses !== undefined
      ) {
        m.proxima_actualizacion = computeProximaActualizacion(
          m.fecha_inicio ?? '',
          Number(m.frecuencia_actualizacion_meses) || 0,
          m.fecha_fin ?? ''
        )
      }
      // Al crear, el monto actual acompaña al inicial hasta la primera actualización
      if (next.monto_inicial !== undefined && !editing) {
        m.monto_actual = Number(m.monto_inicial) || 0
      }
      // Autocompletar el dueño desde la propiedad elegida
      if (next.propiedad_id !== undefined && next.propiedad_id) {
        const p = propMap[next.propiedad_id]
        if (p?.dueno_id) m.dueno_id = p.dueno_id
      }
      return m
    })
  }

  // ── IA: carga de contrato existente (extracción de PDF/imagen) ────────────
  const num = (v: unknown): number | null => {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v)
    return Number.isFinite(n) ? n : null
  }
  const asIndice = (v: unknown): TipoIndice | null =>
    INDICES.includes(v as TipoIndice) ? (v as TipoIndice) : null

  const readBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => {
        const s = String(r.result)
        resolve(s.slice(s.indexOf(',') + 1))
      }
      r.onerror = () => reject(new Error('No se pudo leer el archivo'))
      r.readAsDataURL(file)
    })

  const guessType = (f: File): string => {
    if (f.type) return f.type
    const n = f.name.toLowerCase()
    if (n.endsWith('.pdf')) return 'application/pdf'
    if (n.endsWith('.png')) return 'image/png'
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
    if (n.endsWith('.webp')) return 'image/webp'
    return ''
  }

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const f = e.target.files?.[0]
    e.target.value = '' // permitir re-seleccionar el mismo archivo
    if (!f) return
    const media_type = guessType(f)
    if (!media_type) return toast.error('Formato no soportado. Usá PDF, JPG, PNG o WEBP.')
    setExtracting(true)
    try {
      const file_base64 = await readBase64(f)
      const { data, error } = await supabase.functions.invoke('extraer-datos-contrato', {
        body: { file_base64, media_type }
      })
      if (error) return void toast.error(await edgeErrorMessage(error, 'No se pudieron extraer los datos'))
      if (!data?.ok) return void toast.error(data?.error ?? 'No se pudieron extraer los datos')
      applyExtraction(data.datos as Extraido, f)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setExtracting(false)
    }
  }

  const applyExtraction = (d: Extraido, file?: File): void => {
    const norm = (s?: string | null): string => (s ?? '').trim().toLowerCase()
    const inq = inquilinos.find(
      (i) =>
        (d.dni_inquilino && i.dni && norm(i.dni) === norm(d.dni_inquilino)) ||
        (d.nombre_inquilino && norm(i.nombre) === norm(d.nombre_inquilino)) ||
        (d.nombre_inquilino && norm(i.nombre).includes(norm(d.nombre_inquilino)))
    )
    const due = duenos.find(
      (x) => d.nombre_dueno && norm(x.nombre).includes(norm(d.nombre_dueno))
    )
    const prop = propiedades.find(
      (p) => d.direccion_propiedad && norm(p.direccion).includes(norm(d.direccion_propiedad))
    )
    const monto = num(d.monto_inicial) ?? 0
    const fi = d.fecha_inicio || todayISO()
    const freq = num(d.frecuencia_actualizacion_meses) ?? 3
    const avisos: string[] = []

    // ── Dueño: avisar si la IA no lo identificó o lo hizo con baja confianza ──
    if (!d.nombre_dueno || d.dueno_confianza === 'baja') {
      avisos.push(
        d.nombre_dueno
          ? `El dueño («${d.nombre_dueno}») se identificó con baja confianza. Verificá que sea el locador/propietario correcto.`
          : 'No se pudo identificar al dueño/locador en el contrato. Cargalo a mano y revisá el documento.'
      )
    } else if (d.nombre_dueno && !due) {
      // Se extrajo un nombre pero no coincide con ningún dueño existente → habrá que crearlo.
      avisos.push(
        `El dueño «${d.nombre_dueno}» no está en el sistema todavía. Crealo con el botón de abajo o asignalo a mano.`
      )
    }

    // ── Plazo / fechas: derivar la duración de las fechas y validar coherencia ──
    // Preferimos SIEMPRE la duración que surge de fecha_inicio/fecha_fin (más confiable
    // que un número suelto que la IA pueda confundir con la frecuencia).
    const durAI = num(d.duracion_meses)
    const durFechas = d.fecha_inicio && d.fecha_fin ? monthsBetween(d.fecha_inicio, d.fecha_fin) : null
    let duracion: number
    let ff: string
    if (durFechas && durFechas > 0) {
      duracion = durFechas
      ff = d.fecha_fin!
      // Si la IA reportó una duración muy distinta a la de las fechas → probable confusión
      // con la frecuencia; avisamos aunque usemos la de las fechas.
      if (durAI != null && Math.abs(durAI - durFechas) > 1) {
        avisos.push(
          `El plazo declarado por la IA (${durAI} meses) no coincide con las fechas (${durFechas} meses). Usé el de las fechas; verificá cuál es el correcto.`
        )
      }
    } else if (durAI != null && durAI > 0) {
      // Sólo tenemos duración (falta alguna fecha): la usamos pero marcamos para revisar.
      duracion = durAI
      ff = d.fecha_fin || computeFechaFin(fi, durAI)
      avisos.push(
        'No se pudieron leer ambas fechas del contrato para validar el plazo. Revisá la duración y las fechas antes de guardar.'
      )
    } else {
      // Sin datos confiables de plazo: no inventamos 36. Dejamos para revisión manual.
      duracion = 0
      ff = d.fecha_fin || ''
      avisos.push(
        'No se pudo determinar el plazo del contrato. Cargá la duración (meses) y la fecha de fin a mano.'
      )
    }

    setEditing(null)
    setForm({
      ...EMPTY,
      propiedad_id: prop?.id ?? '',
      inquilino_id: inq?.id ?? '',
      dueno_id: due?.id ?? prop?.dueno_id ?? null,
      monto_inicial: monto,
      monto_actual: monto,
      fecha_inicio: fi,
      fecha_fin: ff,
      duracion_meses: duracion,
      indice_actualizacion: asIndice(d.indice_actualizacion) ?? 'ICL',
      frecuencia_actualizacion_meses: freq,
      proxima_actualizacion: ff ? computeProximaActualizacion(fi, freq, ff) : null,
      estado: 'activo'
    })
    setExtraido(d)
    setExtraccionAvisos(avisos)
    if (avisos.length > 0) {
      toast.info(`Revisá ${avisos.length} dato(s): el sistema no está seguro de algunos campos.`)
    }
    // Reutilizar el mismo archivo que subió para la IA (no pedirlo dos veces)
    setArchivosNuevos(file ? [file] : [])
    setArchivosExistentes([])
    setModalOpen(true)
    toast.success('Datos extraídos. Revisalos y completá lo que falte.')
  }

  // Crear al vuelo la entidad que la IA leyó pero no existe todavía
  // (precarga email/teléfono extraídos del contrato)
  const createInquilino = async (): Promise<void> => {
    if (!extraido?.nombre_inquilino) return
    const { data, error } = await supabase
      .from('inquilinos')
      .insert({
        nombre: extraido.nombre_inquilino,
        dni: extraido.dni_inquilino || null,
        email: extraido.email_inquilino || null,
        telefono: extraido.telefono_inquilino || null
      })
      .select()
      .single()
    if (error || !data) return void toast.error(error?.message ?? 'No se pudo crear el inquilino')
    await load()
    patch({ inquilino_id: data.id })
    toast.success('Inquilino creado')
  }
  const createDueno = async (): Promise<void> => {
    if (!extraido?.nombre_dueno) return
    const { data, error } = await supabase
      .from('duenos')
      .insert({
        nombre: extraido.nombre_dueno,
        email: extraido.email_dueno || null,
        telefono: extraido.telefono_dueno || null
      })
      .select()
      .single()
    if (error || !data) return void toast.error(error?.message ?? 'No se pudo crear el dueño')
    await load()
    patch({ dueno_id: data.id })
    toast.success('Dueño creado')
  }

  // Enriquecer una ficha existente con un dato de contacto que trae el contrato
  // (sin sobreescribir: solo si el registro no lo tenía).
  const agregarDatoFicha = async (
    tabla: 'inquilinos' | 'duenos',
    id: string,
    campo: 'email' | 'telefono',
    valor: string
  ): Promise<void> => {
    const payload: { email?: string; telefono?: string } =
      campo === 'email' ? { email: valor } : { telefono: valor }
    const { error } =
      tabla === 'inquilinos'
        ? await supabase.from('inquilinos').update(payload).eq('id', id)
        : await supabase.from('duenos').update(payload).eq('id', id)
    if (error) return void toast.error(error.message)
    await load()
    toast.success(`${campo === 'email' ? 'Email' : 'Teléfono'} agregado a la ficha`)
  }
  const createPropiedad = async (): Promise<void> => {
    if (!extraido?.direccion_propiedad) return
    const { data, error } = await supabase
      .from('propiedades')
      .insert({
        direccion: extraido.direccion_propiedad,
        dueno_id: form.dueno_id || null,
        estado: 'alquilada',
        monto_expensas: num(extraido.monto_expensas) ?? 0,
        paga_expensas: 'inquilino'
      })
      .select()
      .single()
    if (error || !data) return void toast.error(error?.message ?? 'No se pudo crear la propiedad')
    await load()
    patch({ propiedad_id: data.id })
    toast.success('Propiedad creada')
  }

  const closeModal = (): void => {
    setModalOpen(false)
    setExtraido(null)
    setExtraccionAvisos([])
  }

  const openCreate = (): void => {
    setEditing(null)
    setExtraido(null)
    setExtraccionAvisos([])
    setArchivosNuevos([])
    setArchivosExistentes([])
    setForm({ ...EMPTY, fecha_inicio: todayISO() })
    // pre-cálculo de derivados
    setTimeout(
      () =>
        setForm((f) => ({
          ...f,
          fecha_fin: computeFechaFin(f.fecha_inicio ?? '', Number(f.duracion_meses) || 0),
          proxima_actualizacion: computeProximaActualizacion(
            f.fecha_inicio ?? '',
            Number(f.frecuencia_actualizacion_meses) || 0,
            computeFechaFin(f.fecha_inicio ?? '', Number(f.duracion_meses) || 0)
          )
        })),
      0
    )
    setModalOpen(true)
  }
  const openEdit = (c: Contrato): void => {
    setEditing(c)
    setExtraido(null)
    setExtraccionAvisos([])
    setArchivosNuevos([])
    setArchivosExistentes([])
    setForm({ ...c })
    setModalOpen(true)
    void listarArchivosPorContratos([c.id]).then((m) => setArchivosExistentes(m[c.id] ?? []))
  }

  const onArchivoInput = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) setArchivosNuevos((prev) => [...prev, ...files])
  }

  const borrarExistente = async (a: ContratoArchivo): Promise<void> => {
    const { error } = await borrarArchivo(a)
    if (error) return void toast.error(error)
    setArchivosExistentes((prev) => prev.filter((x) => x.id !== a.id))
    toast.success('Archivo eliminado')
  }

  const save = async (): Promise<void> => {
    if (!form.propiedad_id) return toast.error('Elegí una propiedad')
    if (!form.inquilino_id) return toast.error('Elegí un inquilino')
    if (!form.fecha_inicio || !form.fecha_fin) return toast.error('Completá las fechas del contrato')
    if (!form.monto_inicial || Number(form.monto_inicial) <= 0)
      return toast.error('El monto inicial debe ser mayor a 0')
    if (form.indice_actualizacion === 'Porcentaje fijo' && !form.porcentaje_fijo)
      return toast.error('Cargá el porcentaje fijo de actualización')
    if (
      form.indice_actualizacion === 'Combinado' &&
      (!form.indice_primario || !form.indice_secundario)
    )
      return toast.error('Elegí los dos índices para el modo combinado')

    setSaving(true)
    const payload = {
      propiedad_id: form.propiedad_id,
      inquilino_id: form.inquilino_id,
      dueno_id: form.dueno_id || null,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin,
      monto_inicial: Number(form.monto_inicial),
      monto_actual: Number(form.monto_actual) || Number(form.monto_inicial),
      moneda: (form.moneda ?? 'ARS') as Moneda,
      indice_sobre:
        form.moneda === 'USD' && form.indice_sobre ? (form.indice_sobre as Moneda) : null,
      indice_actualizacion: form.indice_actualizacion as TipoIndice,
      indice_primario:
        form.indice_actualizacion === 'Combinado' ? (form.indice_primario as TipoIndice) : null,
      indice_secundario:
        form.indice_actualizacion === 'Combinado' ? (form.indice_secundario as TipoIndice) : null,
      frecuencia_actualizacion_meses: Number(form.frecuencia_actualizacion_meses) || 1,
      duracion_meses: Number(form.duracion_meses) || 1,
      porcentaje_fijo:
        form.indice_actualizacion === 'Porcentaje fijo' ? Number(form.porcentaje_fijo) : null,
      proxima_actualizacion: form.proxima_actualizacion || null,
      estado: (form.estado ?? 'activo') as EstadoContrato,
      monto_deposito: Number(form.monto_deposito) || 0,
      estado_deposito: (form.estado_deposito ?? 'retenido') as EstadoDeposito,
      fecha_devolucion_deposito:
        form.estado_deposito === 'devuelto'
          ? form.fecha_devolucion_deposito || todayISO()
          : null,
      motivo_finalizacion: form.estado !== 'activo' ? form.motivo_finalizacion || null : null,
      notas: form.notas || null
    }
    let contratoId = editing?.id
    if (editing) {
      const { error } = await supabase.from('contratos').update(payload).eq('id', editing.id)
      if (error) {
        setSaving(false)
        return void toast.error(error.message)
      }
    } else {
      const { data, error } = await supabase
        .from('contratos')
        .insert(payload)
        .select('id')
        .single()
      if (error || !data) {
        setSaving(false)
        return void toast.error(error?.message ?? 'No se pudo crear el contrato')
      }
      contratoId = data.id
    }

    // Subir los archivos adjuntos nuevos
    if (contratoId && archivosNuevos.length > 0) {
      for (const f of archivosNuevos) {
        const { error } = await subirArchivo(contratoId, f)
        if (error) toast.error(`No se pudo subir "${f.name}": ${error}`)
      }
    }

    setSaving(false)
    toast.success(editing ? 'Contrato actualizado' : 'Contrato creado')
    setModalOpen(false)
    void load()
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    const { error } = await supabase.from('contratos').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Contrato eliminado')
    setDelTarget(null)
    void load()
  }

  const idx = form.indice_actualizacion

  return (
    <div className="p-6">
      <PageHeader
        title="Contratos"
        subtitle={`${rows.length} contrato${rows.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={onFileSelected}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={extracting || !isSupabaseConfigured}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border text-zinc-300 hover:text-white hover:bg-white/5 disabled:opacity-50"
              title="Subí un PDF o foto de un contrato firmado y la IA extrae los datos"
            >
              {extracting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {extracting ? 'Leyendo…' : 'Cargar contrato existente'}
            </button>
            <button
              onClick={() => setGenerarOpen(true)}
              disabled={!isSupabaseConfigured}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border text-zinc-300 hover:text-white hover:bg-white/5 disabled:opacity-50"
            >
              <Sparkles size={16} /> Generar con IA
            </button>
            <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={16} /> Nuevo contrato
            </button>
          </div>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          className="input w-full pl-9"
          placeholder="Buscar por propiedad, inquilino o índice…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Propiedad</th>
              <th className="px-4 py-3 font-medium">Inquilino</th>
              <th className="px-4 py-3 font-medium">Período</th>
              <th className="px-4 py-3 font-medium text-right">Monto</th>
              <th className="px-4 py-3 font-medium">Índice</th>
              <th className="px-4 py-3 font-medium">Próx. ajuste</th>
              <th className="px-4 py-3 font-medium">Estado</th>
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
                  {rows.length === 0 ? 'Todavía no hay contratos cargados.' : 'Sin resultados.'}
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const dLeft = daysUntil(c.proxima_actualizacion)
                const proxSoon = dLeft !== null && dLeft <= 30
                return (
                  <tr key={c.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white font-medium">
                      {propMap[c.propiedad_id]?.direccion ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      <span className="inline-flex items-center gap-1.5">
                        {inqMap[c.inquilino_id] ?? '—'}
                        {(() => {
                          const inq = inquilinos.find((i) => i.id === c.inquilino_id)
                          return inq?.telefono ? (
                            <TelefonoWhatsApp numero={inq.telefono} iconOnly size={14} />
                          ) : null
                        })()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {formatDate(c.fecha_inicio)} → {formatDate(c.fecha_fin)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ContratoMontos
                        inicial={c.monto_inicial}
                        actual={c.monto_actual}
                        moneda={c.moneda}
                        pendiente={pendientesSet.has(c.id)}
                      />
                    </td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">
                      {c.indice_actualizacion === 'Combinado'
                        ? `${c.indice_primario ?? '?'} + ${c.indice_secundario ?? '?'}`
                        : c.indice_actualizacion}
                      {c.indice_actualizacion === 'Porcentaje fijo' && c.porcentaje_fijo
                        ? ` ${c.porcentaje_fijo}%`
                        : ''}
                      <div className="text-zinc-600">cada {c.frecuencia_actualizacion_meses} m</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.proxima_actualizacion ? (
                        <span
                          className={`inline-flex items-center gap-1 ${proxSoon ? 'text-amber-400' : 'text-zinc-400'}`}
                        >
                          {proxSoon && <CalendarClock size={12} />}
                          {formatDate(c.proxima_actualizacion)}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs border capitalize ${ESTADO_BADGE[c.estado]}`}
                      >
                        {c.estado}
                      </span>
                      {c.estado !== 'activo' &&
                        c.estado_deposito === 'retenido' &&
                        c.monto_deposito > 0 && (
                          <div
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-400"
                            title="El depósito sigue retenido"
                          >
                            <AlertTriangle size={10} /> depósito a devolver
                          </div>
                        )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/5"
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDelTarget(c)}
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

      <Modal
        open={modalOpen}
        title={editing ? 'Editar contrato' : extraido ? 'Revisar contrato cargado' : 'Nuevo contrato'}
        onClose={closeModal}
        wide
        footer={
          <>
            <button
              onClick={closeModal}
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
          {extraccionAvisos.length > 0 && (
            <div className="rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs space-y-1.5">
              <p className="text-warn font-semibold flex items-center gap-1.5">
                <AlertTriangle size={14} /> Revisar manualmente ({extraccionAvisos.length})
              </p>
              <ul className="list-disc pl-5 text-ink-2 space-y-1">
                {extraccionAvisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {extraido && (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs space-y-2">
              <p className="text-sky-300 font-medium flex items-center gap-1.5">
                <Sparkles size={13} /> Datos extraídos por IA — revisá y corregí antes de guardar
              </p>
              <div className="text-zinc-400 space-y-0.5">
                {extraido.nombre_inquilino && (
                  <div>
                    Inquilino: <span className="text-zinc-200">{extraido.nombre_inquilino}</span>
                    {extraido.dni_inquilino ? ` (DNI ${extraido.dni_inquilino})` : ''}
                    {(extraido.email_inquilino || extraido.telefono_inquilino) && (
                      <span className="text-zinc-500">
                        {' — '}
                        {[extraido.email_inquilino, extraido.telefono_inquilino]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                )}
                {extraido.nombre_dueno && (
                  <div>
                    Dueño: <span className="text-zinc-200">{extraido.nombre_dueno}</span>
                    {(extraido.email_dueno || extraido.telefono_dueno) && (
                      <span className="text-zinc-500">
                        {' — '}
                        {[extraido.email_dueno, extraido.telefono_dueno]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    )}
                  </div>
                )}
                {extraido.direccion_propiedad && (
                  <div>
                    Propiedad:{' '}
                    <span className="text-zinc-200">{extraido.direccion_propiedad}</span>
                  </div>
                )}
              </div>
              {(!form.inquilino_id || !form.dueno_id || !form.propiedad_id) && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {!form.inquilino_id && extraido.nombre_inquilino && (
                    <button
                      onClick={createInquilino}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-zinc-300 hover:text-white hover:bg-white/5"
                    >
                      <UserPlus size={12} /> Crear inquilino «{extraido.nombre_inquilino}»
                    </button>
                  )}
                  {!form.dueno_id && extraido.nombre_dueno && (
                    <button
                      onClick={createDueno}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-zinc-300 hover:text-white hover:bg-white/5"
                    >
                      <UserPlus size={12} /> Crear dueño «{extraido.nombre_dueno}»
                    </button>
                  )}
                  {!form.propiedad_id && extraido.direccion_propiedad && (
                    <button
                      onClick={createPropiedad}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-border text-zinc-300 hover:text-white hover:bg-white/5"
                    >
                      <Home size={12} /> Crear propiedad «{extraido.direccion_propiedad}»
                    </button>
                  )}
                </div>
              )}
              {(() => {
                const linkedInq = inquilinos.find((i) => i.id === form.inquilino_id)
                const linkedDue = duenos.find((d) => d.id === form.dueno_id)
                const sug: JSX.Element[] = []
                const chip = (
                  key: string,
                  label: string,
                  onClick: () => void
                ): JSX.Element => (
                  <button
                    key={key}
                    onClick={onClick}
                    className="flex items-center gap-1 px-2 py-1 rounded-md border border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
                  >
                    <Plus size={12} /> {label}
                  </button>
                )
                if (linkedInq && extraido.email_inquilino && !linkedInq.email)
                  sug.push(
                    chip('inq-email', `Agregar email a ${linkedInq.nombre}`, () =>
                      agregarDatoFicha('inquilinos', linkedInq.id, 'email', extraido.email_inquilino!)
                    )
                  )
                if (linkedInq && extraido.telefono_inquilino && !linkedInq.telefono)
                  sug.push(
                    chip('inq-tel', `Agregar teléfono a ${linkedInq.nombre}`, () =>
                      agregarDatoFicha(
                        'inquilinos',
                        linkedInq.id,
                        'telefono',
                        extraido.telefono_inquilino!
                      )
                    )
                  )
                if (linkedDue && extraido.email_dueno && !linkedDue.email)
                  sug.push(
                    chip('due-email', `Agregar email a ${linkedDue.nombre}`, () =>
                      agregarDatoFicha('duenos', linkedDue.id, 'email', extraido.email_dueno!)
                    )
                  )
                if (linkedDue && extraido.telefono_dueno && !linkedDue.telefono)
                  sug.push(
                    chip('due-tel', `Agregar teléfono a ${linkedDue.nombre}`, () =>
                      agregarDatoFicha('duenos', linkedDue.id, 'telefono', extraido.telefono_dueno!)
                    )
                  )
                if (sug.length === 0) return null
                return (
                  <div className="pt-2 mt-1 border-t border-sky-500/10 space-y-1.5">
                    <p className="text-[11px] text-amber-300">
                      Datos de contacto en el contrato que no están en la ficha:
                    </p>
                    <div className="flex flex-wrap gap-2">{sug}</div>
                  </div>
                )
              })()}
            </div>
          )}
          {/* Partes */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Propiedad" required>
              <Select
                value={form.propiedad_id ?? ''}
                onChange={(e) => patch({ propiedad_id: e.target.value })}
              >
                <option value="">— Elegir —</option>
                {propiedades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.direccion}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Inquilino" required>
              <Select
                value={form.inquilino_id ?? ''}
                onChange={(e) => patch({ inquilino_id: e.target.value })}
              >
                <option value="">— Elegir —</option>
                {inquilinos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Dueño (se autocompleta desde la propiedad)">
            <Select
              value={form.dueno_id ?? ''}
              onChange={(e) => patch({ dueno_id: e.target.value || null })}
            >
              <option value="">— Sin asignar —</option>
              {duenos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </Select>
          </Field>

          {/* Fechas y duración */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Inicio" required>
              <TextInput
                type="date"
                value={form.fecha_inicio ?? ''}
                onChange={(e) => patch({ fecha_inicio: e.target.value })}
              />
            </Field>
            <Field label="Duración (meses)">
              <TextInput
                type="number"
                min={1}
                value={form.duracion_meses ?? 36}
                onChange={(e) => patch({ duracion_meses: Number(e.target.value) })}
              />
            </Field>
            <Field label="Fin (calculado)">
              <TextInput
                type="date"
                value={form.fecha_fin ?? ''}
                onChange={(e) => patch({ fecha_fin: e.target.value })}
              />
            </Field>
          </div>

          {/* Moneda y montos */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Moneda">
              <Select
                value={form.moneda ?? 'ARS'}
                onChange={(e) => patch({ moneda: e.target.value as Moneda })}
              >
                <option value="ARS">Pesos (ARS)</option>
                <option value="USD">Dólares (USD)</option>
              </Select>
            </Field>
            <Field label={`Monto inicial${form.moneda === 'USD' ? ' (USD)' : ''}`} required>
              <TextInput
                type="number"
                min={0}
                value={form.monto_inicial ?? 0}
                onChange={(e) => patch({ monto_inicial: Number(e.target.value) })}
              />
            </Field>
            <Field label={`Monto actual${form.moneda === 'USD' ? ' (USD)' : ''}`}>
              <TextInput
                type="number"
                min={0}
                value={form.monto_actual ?? 0}
                onChange={(e) => patch({ monto_actual: Number(e.target.value) })}
              />
            </Field>
          </div>
          {form.moneda === 'USD' && (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5 text-xs text-sky-300 space-y-2">
              <p>
                Contrato en dólares: al registrar cada pago se guarda el equivalente en pesos
                según la cotización (blue) del día del pago.
              </p>
              <div className="flex items-center gap-2 text-zinc-300">
                <span className="text-zinc-400">El índice se aplica sobre:</span>
                <Select
                  className="w-auto"
                  value={form.indice_sobre ?? 'USD'}
                  onChange={(e) => patch({ indice_sobre: e.target.value as Moneda })}
                >
                  <option value="USD">el monto en dólares</option>
                  <option value="ARS">el equivalente en pesos (mixto)</option>
                </Select>
              </div>
            </div>
          )}

          {/* Actualización */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">
              Actualización del alquiler
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Índice de actualización">
                <Select
                  value={idx ?? 'ICL'}
                  onChange={(e) => patch({ indice_actualizacion: e.target.value as TipoIndice })}
                >
                  {INDICES.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Frecuencia (meses)">
                <TextInput
                  type="number"
                  min={1}
                  value={form.frecuencia_actualizacion_meses ?? 3}
                  onChange={(e) =>
                    patch({ frecuencia_actualizacion_meses: Number(e.target.value) })
                  }
                />
              </Field>
            </div>

            {idx === 'Combinado' && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Primer índice" required>
                  <Select
                    value={form.indice_primario ?? ''}
                    onChange={(e) => patch({ indice_primario: e.target.value as TipoIndice })}
                  >
                    <option value="">— Elegir —</option>
                    {INDICES.filter((i) => i !== 'Combinado' && i !== 'Manual' && i !== 'Porcentaje fijo').map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Segundo índice (promedio)" required>
                  <Select
                    value={form.indice_secundario ?? ''}
                    onChange={(e) => patch({ indice_secundario: e.target.value as TipoIndice })}
                  >
                    <option value="">— Elegir —</option>
                    {INDICES.filter((i) => i !== 'Combinado' && i !== 'Manual' && i !== 'Porcentaje fijo').map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}

            {idx === 'Porcentaje fijo' && (
              <div className="mt-3">
                <Field label="Porcentaje fijo por período (%)" required>
                  <TextInput
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.porcentaje_fijo ?? ''}
                    onChange={(e) => patch({ porcentaje_fijo: Number(e.target.value) })}
                  />
                </Field>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Próxima actualización (calculada)">
                <TextInput
                  type="date"
                  value={form.proxima_actualizacion ?? ''}
                  onChange={(e) => patch({ proxima_actualizacion: e.target.value || null })}
                />
              </Field>
              <Field label="Estado">
                <Select
                  value={form.estado ?? 'activo'}
                  onChange={(e) => patch({ estado: e.target.value as EstadoContrato })}
                >
                  <option value="activo">Activo</option>
                  <option value="vencido">Vencido</option>
                  <option value="rescindido">Rescindido</option>
                </Select>
              </Field>
            </div>
            {form.estado !== 'activo' && (
              <div className="mt-3">
                <Field label="Motivo de finalización (opcional)">
                  <TextInput
                    placeholder="Ej: mudanza, no renovación, falta de pago, venta…"
                    value={form.motivo_finalizacion ?? ''}
                    onChange={(e) => patch({ motivo_finalizacion: e.target.value || null })}
                  />
                </Field>
              </div>
            )}
            {idx === 'Manual' && (
              <p className="text-[11px] text-zinc-600 mt-2">
                Con índice manual, el nuevo monto se carga a mano en cada actualización.
              </p>
            )}
          </div>

          {/* Garantía / Depósito */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <ShieldCheck size={13} /> Garantía / Depósito
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Monto del depósito">
                <TextInput
                  type="number"
                  min={0}
                  value={form.monto_deposito ?? 0}
                  onChange={(e) => patch({ monto_deposito: Number(e.target.value) })}
                />
              </Field>
              <Field label="Estado del depósito">
                <Select
                  value={form.estado_deposito ?? 'retenido'}
                  onChange={(e) => patch({ estado_deposito: e.target.value as EstadoDeposito })}
                >
                  <option value="retenido">Retenido</option>
                  <option value="devuelto">Devuelto</option>
                </Select>
              </Field>
              {form.estado_deposito === 'devuelto' && (
                <Field label="Fecha de devolución">
                  <TextInput
                    type="date"
                    value={form.fecha_devolucion_deposito ?? ''}
                    onChange={(e) =>
                      patch({ fecha_devolucion_deposito: e.target.value || null })
                    }
                  />
                </Field>
              )}
            </div>
            {(form.estado === 'vencido' || form.estado === 'rescindido') &&
              form.estado_deposito === 'retenido' &&
              Number(form.monto_deposito) > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 text-xs text-amber-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  Este contrato está {form.estado} y el depósito sigue retenido. Acordate de
                  resolver la devolución de la garantía.
                </div>
              )}
          </div>

          <Field label="Notas">
            <TextArea
              value={form.notas ?? ''}
              onChange={(e) => patch({ notas: e.target.value })}
            />
          </Field>

          {/* Archivos del contrato (PDF, foto, escaneo) */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Paperclip size={13} /> Archivos del contrato
            </p>
            <div className="space-y-1">
              {archivosExistentes.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewArchivo(a)}
                    className="flex items-center gap-2 text-sm text-sky-300 hover:text-sky-200 min-w-0"
                  >
                    <FileText size={14} className="shrink-0" />
                    <span className="truncate">{a.nombre}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => borrarExistente(a)}
                    className="p-1 rounded text-zinc-500 hover:text-red-400 shrink-0"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {archivosNuevos.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-zinc-300 min-w-0">
                    <FileText size={14} className="shrink-0" />
                    <span className="truncate">{f.name}</span>
                    <span className="text-[10px] text-emerald-400 shrink-0">nuevo</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setArchivosNuevos((prev) => prev.filter((_, j) => j !== i))}
                    className="p-1 rounded text-zinc-500 hover:text-red-400 shrink-0"
                    title="Quitar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {archivosExistentes.length === 0 && archivosNuevos.length === 0 && (
                <p className="text-xs text-zinc-600">Sin archivos adjuntos.</p>
              )}
            </div>
            <input
              ref={archivoInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={onArchivoInput}
            />
            <button
              type="button"
              onClick={() => archivoInputRef.current?.click()}
              className="mt-2 flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border text-zinc-300 hover:text-white hover:bg-white/5"
            >
              <Upload size={14} /> Adjuntar archivo
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delTarget}
        message={`¿Eliminar el contrato de "${delTarget ? propMap[delTarget.propiedad_id]?.direccion ?? 'la propiedad' : ''}"? Se borrarán también sus pagos y actualizaciones asociadas.`}
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />

      <GenerarContratoModal
        open={generarOpen}
        onClose={() => setGenerarOpen(false)}
        propiedades={propiedades}
        inquilinos={inquilinos}
        duenos={duenos}
      />

      <ArchivoPreviewModal
        open={!!previewArchivo}
        archivo={previewArchivo}
        onClose={() => setPreviewArchivo(null)}
      />
    </div>
  )
}
