import { useEffect, useMemo, useState } from 'react'
import {
  FileDown,
  Loader2,
  Plus,
  ReceiptText,
  Link2,
  Trash2,
  RefreshCw,
  Mail,
  MessageCircle
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type {
  ReciboReserva,
  TipoOperacionRecibo,
  EstadoReciboReserva,
  Propiedad,
  Inquilino,
  Contrato,
  Moneda
} from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatDate, formatMoneda } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { importeEnLetras } from '@/lib/numeroLetras'
import { buildReciboReservaPDF, type ReciboReservaPDFData } from '@/lib/reciboReservaPdf'
import {
  subirReciboPdf,
  urlFirmadaRecibo,
  borrarReciboPdf,
  pdfDataFromRecibo,
  nombreArchivo,
  enviarReciboEmail
} from '@/lib/recibosReserva'
import { waLink } from '@/components/ui/TelefonoWhatsApp'
import {
  CLAUSULA_LOCACION_DEFAULT,
  CLAUSULA_VENTA_DEFAULT,
  CIUDAD_DEFAULT,
  REGISTRO_DEFAULT,
  CLAVE_CLAUSULA_LOCACION,
  CLAVE_CLAUSULA_VENTA,
  CLAVE_CIUDAD,
  CLAVE_REGISTRO,
  resolverClausula
} from '@/lib/recibosReservaDefaults'

const TIPO_LABEL: Record<TipoOperacionRecibo, string> = {
  locacion: 'Locación',
  venta: 'Venta'
}
const ESTADO_LABEL: Record<EstadoReciboReserva, string> = {
  vigente: 'Vigente',
  convertido: 'Convertido en contrato',
  devuelto: 'Devuelto',
  perdido: 'Perdido'
}
const ESTADO_BADGE: Record<EstadoReciboReserva, string> = {
  vigente: 'bg-accent/12 text-accent border-accent/25',
  convertido: 'bg-ok/10 text-ok border-ok/25',
  devuelto: 'bg-warn/10 text-warn border-warn/25',
  perdido: 'bg-bad/10 text-bad border-bad/25'
}

function descargarBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type FormState = {
  tipo: TipoOperacionRecibo
  propModo: 'sistema' | 'manual'
  propiedadId: string
  direccion: string
  resModo: 'sistema' | 'manual'
  inquilinoId: string
  crearInquilino: boolean
  resNombre: string
  resDni: string
  resDomicilio: string
  resEmail: string
  resTelefono: string
  moneda: Moneda
  monto: string
  plazoMeses: string
  canonTotal: string
  montoOperacion: string
  ciudad: string
  fecha: string
  clausula: string
}

const emptyForm = (ciudad: string): FormState => ({
  tipo: 'locacion',
  propModo: 'sistema',
  propiedadId: '',
  direccion: '',
  resModo: 'sistema',
  inquilinoId: '',
  crearInquilino: false,
  resNombre: '',
  resDni: '',
  resDomicilio: '',
  resEmail: '',
  resTelefono: '',
  moneda: 'ARS',
  monto: '',
  plazoMeses: '',
  canonTotal: '',
  montoOperacion: '',
  ciudad,
  fecha: todayISO(),
  clausula: ''
})

export default function RecibosReserva(): JSX.Element {
  const toast = useToast()
  const [recibos, setRecibos] = useState<ReciboReserva[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Config (plantillas de cláusula + ciudad/registro), con fallback a defaults.
  const [cfg, setCfg] = useState({
    clausulaLocacion: CLAUSULA_LOCACION_DEFAULT,
    clausulaVenta: CLAUSULA_VENTA_DEFAULT,
    ciudad: CIUDAD_DEFAULT,
    registro: REGISTRO_DEFAULT
  })

  const [fTipo, setFTipo] = useState<'' | TipoOperacionRecibo>('')
  const [fEstado, setFEstado] = useState<'' | EstadoReciboReserva>('')

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm(CIUDAD_DEFAULT))
  const [clausulaTocada, setClausulaTocada] = useState(false)

  const [linkFor, setLinkFor] = useState<ReciboReserva | null>(null)
  const [delFor, setDelFor] = useState<ReciboReserva | null>(null)

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [r, p, i, c, conf] = await Promise.all([
      supabase.from('recibos_reserva').select('*').order('numero', { ascending: false }),
      supabase.from('propiedades').select('*').order('direccion'),
      supabase.from('inquilinos').select('*').order('nombre'),
      supabase.from('contratos').select('*'),
      supabase
        .from('configuracion')
        .select('clave, valor')
        .in('clave', [
          CLAVE_CLAUSULA_LOCACION,
          CLAVE_CLAUSULA_VENTA,
          CLAVE_CIUDAD,
          CLAVE_REGISTRO
        ])
    ])
    setRecibos(r.data ?? [])
    setPropiedades(p.data ?? [])
    setInquilinos(i.data ?? [])
    setContratos(c.data ?? [])
    const next = { ...cfg }
    for (const row of conf.data ?? []) {
      if (row.clave === CLAVE_CLAUSULA_LOCACION && row.valor) next.clausulaLocacion = row.valor
      if (row.clave === CLAVE_CLAUSULA_VENTA && row.valor) next.clausulaVenta = row.valor
      if (row.clave === CLAVE_CIUDAD && row.valor) next.ciudad = row.valor
      if (row.clave === CLAVE_REGISTRO && row.valor) next.registro = row.valor
    }
    setCfg(next)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inquilinoMap = useMemo(() => {
    const m: Record<string, Inquilino> = {}
    for (const i of inquilinos) m[i.id] = i
    return m
  }, [inquilinos])
  const propMap = useMemo(() => {
    const m: Record<string, Propiedad> = {}
    for (const p of propiedades) m[p.id] = p
    return m
  }, [propiedades])
  const contratoMap = useMemo(() => {
    const m: Record<string, Contrato> = {}
    for (const c of contratos) m[c.id] = c
    return m
  }, [contratos])

  const filtrados = useMemo(
    () =>
      recibos.filter(
        (r) => (!fTipo || r.tipo === fTipo) && (!fEstado || r.estado === fEstado)
      ),
    [recibos, fTipo, fEstado]
  )

  // Plantilla base según tipo.
  const plantilla = (tipo: TipoOperacionRecibo): string =>
    tipo === 'locacion' ? cfg.clausulaLocacion : cfg.clausulaVenta

  // Recalcula la cláusula resuelta si el usuario no la editó a mano.
  const refrescarClausula = (f: FormState): string => {
    const monto = parseFloat(f.monto) || 0
    return resolverClausula(plantilla(f.tipo), monto, f.moneda)
  }

  const patch = (p: Partial<FormState>): void => {
    setForm((prev) => {
      const next = { ...prev, ...p }
      // Autocompletar dirección al elegir propiedad del sistema
      if (p.propiedadId !== undefined && next.propModo === 'sistema') {
        const prop = propMap[p.propiedadId]
        if (prop) next.direccion = prop.direccion
      }
      // Autocompletar reservante al elegir inquilino del sistema
      if (p.inquilinoId !== undefined && next.resModo === 'sistema') {
        const inq = inquilinoMap[p.inquilinoId]
        if (inq) {
          next.resNombre = inq.nombre
          next.resDni = inq.dni ?? ''
          next.resEmail = inq.email ?? ''
          next.resTelefono = inq.telefono ?? ''
        }
      }
      // Reajustar cláusula si cambia lo que afecta los importes y no fue tocada
      if (
        !clausulaTocada &&
        (p.tipo !== undefined || p.monto !== undefined || p.moneda !== undefined)
      ) {
        next.clausula = refrescarClausula(next)
      }
      return next
    })
  }

  const abrirNuevo = (): void => {
    const f = emptyForm(cfg.ciudad)
    f.clausula = resolverClausula(plantilla('locacion'), 0, 'ARS')
    setForm(f)
    setClausulaTocada(false)
    setOpen(true)
  }

  const generar = async (): Promise<void> => {
    const monto = parseFloat(form.monto)
    if (!form.direccion.trim()) return void toast.error('Falta la dirección del inmueble')
    if (!form.resNombre.trim()) return void toast.error('Falta el nombre del reservante')
    if (!monto || monto <= 0) return void toast.error('El importe recibido debe ser mayor a 0')

    setBusy(true)
    try {
      const { data: userData } = await supabase.auth.getUser()

      // 1) Crear inquilino si corresponde (carga manual + tildado)
      let inquilinoId: string | null = form.resModo === 'sistema' ? form.inquilinoId || null : null
      if (form.resModo === 'manual' && form.crearInquilino) {
        const ins = await supabase
          .from('inquilinos')
          .insert({
            nombre: form.resNombre.trim(),
            dni: form.resDni.trim() || null,
            email: form.resEmail.trim() || null,
            telefono: form.resTelefono.trim() || null
          })
          .select('id')
          .single()
        if (ins.error) return void toast.error(`No se pudo crear el inquilino: ${ins.error.message}`)
        inquilinoId = ins.data.id
      }

      const montoLetras = importeEnLetras(monto, form.moneda)
      const plazo = form.tipo === 'locacion' ? parseInt(form.plazoMeses, 10) || null : null
      const canon = form.tipo === 'locacion' ? parseFloat(form.canonTotal) || null : null
      const montoOp = form.tipo === 'venta' ? parseFloat(form.montoOperacion) || null : null

      // 2) Insertar la fila del recibo (obtener id + número correlativo)
      const ins = await supabase
        .from('recibos_reserva')
        .insert({
          tipo: form.tipo,
          propiedad_id: form.propModo === 'sistema' ? form.propiedadId || null : null,
          direccion: form.direccion.trim(),
          reservante_inquilino_id: inquilinoId,
          reservante_nombre: form.resNombre.trim(),
          reservante_dni: form.resDni.trim() || null,
          reservante_domicilio: form.resDomicilio.trim() || null,
          reservante_email: form.resEmail.trim() || null,
          reservante_telefono: form.resTelefono.trim() || null,
          moneda: form.moneda,
          monto,
          monto_letras: montoLetras,
          plazo_meses: plazo,
          canon_total: canon,
          monto_operacion: montoOp,
          clausula: form.clausula,
          ciudad: form.ciudad.trim() || cfg.ciudad,
          registro: cfg.registro,
          fecha: form.fecha,
          creado_por: userData?.user?.id ?? null
        })
        .select('*')
        .single()
      if (ins.error) return void toast.error(ins.error.message)
      const recibo = ins.data as ReciboReserva

      // 3) Generar PDF
      const pdfData: ReciboReservaPDFData = pdfDataFromRecibo(recibo)
      const bytes = await buildReciboReservaPDF(pdfData)

      // 4) Subir al bucket + guardar path
      const up = await subirReciboPdf(recibo.id, recibo.numero, bytes)
      if (up.path) {
        await supabase.from('recibos_reserva').update({ pdf_path: up.path }).eq('id', recibo.id)
      } else if (up.error) {
        toast.error(`Recibo guardado, pero falló la subida del PDF: ${up.error}`)
      }

      // 5) Descargar para el usuario
      descargarBytes(bytes, nombreArchivo(recibo))

      toast.success(`Recibo N° ${String(recibo.numero).padStart(6, '0')} generado`)
      setOpen(false)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const reimprimir = async (r: ReciboReserva): Promise<void> => {
    setBusy(true)
    try {
      // Preferir el PDF guardado; si no existe, regenerarlo al vuelo.
      if (r.pdf_path) {
        const url = await urlFirmadaRecibo(r.pdf_path, nombreArchivo(r))
        if (url) {
          window.open(url, '_blank')
          return
        }
      }
      const bytes = await buildReciboReservaPDF(pdfDataFromRecibo(r))
      descargarBytes(bytes, nombreArchivo(r))
    } finally {
      setBusy(false)
    }
  }

  // Garantiza que el PDF esté en Storage (lo regenera y sube si falta).
  const asegurarPdf = async (r: ReciboReserva): Promise<string | null> => {
    if (r.pdf_path) return r.pdf_path
    const bytes = await buildReciboReservaPDF(pdfDataFromRecibo(r))
    const up = await subirReciboPdf(r.id, r.numero, bytes)
    if (!up.path) return null
    await supabase.from('recibos_reserva').update({ pdf_path: up.path }).eq('id', r.id)
    setRecibos((prev) => prev.map((x) => (x.id === r.id ? { ...x, pdf_path: up.path! } : x)))
    return up.path
  }

  const abrirExterno = (url: string): void => {
    const api = window.lgprop?.openExternal
    if (api) api(url).catch(() => window.open(url, '_blank'))
    else window.open(url, '_blank')
  }

  const enviarEmail = async (r: ReciboReserva): Promise<void> => {
    if (!r.reservante_email) return void toast.error('El reservante no tiene email cargado')
    setBusy(true)
    try {
      const path = await asegurarPdf(r)
      if (!path) return void toast.error('No se pudo preparar el PDF')
      const res = await enviarReciboEmail(r.id)
      if (res.ok) toast.success(`Recibo enviado a ${res.to}`)
      else toast.error(res.error ?? 'No se pudo enviar el email')
    } finally {
      setBusy(false)
    }
  }

  const enviarWhatsApp = async (r: ReciboReserva): Promise<void> => {
    if (!r.reservante_telefono) return void toast.error('El reservante no tiene teléfono cargado')
    setBusy(true)
    try {
      const path = await asegurarPdf(r)
      const url = path
        ? await urlFirmadaRecibo(path, nombreArchivo(r), 60 * 60 * 24 * 7)
        : null
      const msg = url
        ? `Hola ${r.reservante_nombre}, te enviamos el recibo de tu reserva. Podés descargarlo acá: ${url}`
        : `Hola ${r.reservante_nombre}, te enviamos el recibo de tu reserva.`
      const link = waLink(r.reservante_telefono, msg)
      if (!link) return void toast.error('El teléfono no es válido')
      abrirExterno(link)
    } finally {
      setBusy(false)
    }
  }

  const cambiarEstado = async (r: ReciboReserva, estado: EstadoReciboReserva): Promise<void> => {
    setRecibos((prev) => prev.map((x) => (x.id === r.id ? { ...x, estado } : x)))
    const { error } = await supabase.from('recibos_reserva').update({ estado }).eq('id', r.id)
    if (error) {
      toast.error(error.message)
      void load()
    }
  }

  const vincularContrato = async (r: ReciboReserva, contratoId: string | null): Promise<void> => {
    const patchRow = {
      contrato_id: contratoId,
      estado: (contratoId ? 'convertido' : 'vigente') as EstadoReciboReserva
    }
    setRecibos((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patchRow } : x)))
    const { error } = await supabase.from('recibos_reserva').update(patchRow).eq('id', r.id)
    if (error) {
      toast.error(error.message)
      void load()
    } else {
      toast.success(contratoId ? 'Recibo vinculado al contrato' : 'Vínculo quitado')
    }
    setLinkFor(null)
  }

  const eliminar = async (r: ReciboReserva): Promise<void> => {
    if (r.pdf_path) await borrarReciboPdf(r.pdf_path)
    const { error } = await supabase.from('recibos_reserva').delete().eq('id', r.id)
    if (error) toast.error(error.message)
    else {
      toast.success('Recibo eliminado')
      setRecibos((prev) => prev.filter((x) => x.id !== r.id))
    }
    setDelFor(null)
  }

  // Contratos candidatos para vincular (misma propiedad primero).
  const contratosParaVincular = (r: ReciboReserva): Contrato[] => {
    const list = [...contratos]
    list.sort((a, b) => {
      const am = a.propiedad_id === r.propiedad_id ? 0 : 1
      const bm = b.propiedad_id === r.propiedad_id ? 0 : 1
      if (am !== bm) return am - bm
      return b.fecha_inicio.localeCompare(a.fecha_inicio)
    })
    return list
  }

  const contratoLabel = (c: Contrato): string => {
    const prop = propMap[c.propiedad_id]
    const inq = inquilinoMap[c.inquilino_id]
    return `${prop?.direccion ?? 'Propiedad'} — ${inq?.nombre ?? 'Inquilino'} (${formatDate(
      c.fecha_inicio
    )})`
  }

  const montoPreview = parseFloat(form.monto) || 0

  return (
    <div className="p-6">
      <PageHeader
        title="Recibos de Reserva"
        subtitle="Comprobantes de reserva de locación y de venta"
        actions={
          <button onClick={abrirNuevo} className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={16} /> Nuevo recibo
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Select
          value={fTipo}
          onChange={(e) => setFTipo(e.target.value as '' | TipoOperacionRecibo)}
          className="w-auto"
        >
          <option value="">Todos los tipos</option>
          <option value="locacion">Locación</option>
          <option value="venta">Venta</option>
        </Select>
        <Select
          value={fEstado}
          onChange={(e) => setFEstado(e.target.value as '' | EstadoReciboReserva)}
          className="w-auto"
        >
          <option value="">Todos los estados</option>
          <option value="vigente">Vigente</option>
          <option value="convertido">Convertido en contrato</option>
          <option value="devuelto">Devuelto</option>
          <option value="perdido">Perdido</option>
        </Select>
        <span className="text-xs text-ink-3">
          {filtrados.length} recibo{filtrados.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">N°</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Reservante</th>
              <th className="px-4 py-3 font-medium">Inmueble</th>
              <th className="px-4 py-3 font-medium text-right">Importe</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-3">
                  Cargando…
                </td>
              </tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-3">
                  No hay recibos. Generá el primero con “Nuevo recibo”.
                </td>
              </tr>
            ) : (
              filtrados.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 num text-ink-2">
                    {String(r.numero).padStart(6, '0')}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <ReceiptText size={13} className="text-ink-3" />
                      {TIPO_LABEL[r.tipo]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-2 num">{formatDate(r.fecha)}</td>
                  <td className="px-4 py-3 text-ink">
                    {r.reservante_nombre}
                    {r.reservante_dni && (
                      <span className="text-ink-3 text-xs num"> · {r.reservante_dni}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-2 max-w-[220px] truncate" title={r.direccion}>
                    {r.direccion}
                  </td>
                  <td className="px-4 py-3 text-right num text-ink font-medium">
                    {formatMoneda(r.monto, r.moneda)}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={r.estado}
                      onChange={(e) =>
                        cambiarEstado(r, e.target.value as EstadoReciboReserva)
                      }
                      className={`text-xs rounded-full border px-2 py-0.5 bg-transparent cursor-pointer ${
                        ESTADO_BADGE[r.estado]
                      }`}
                      title="Cambiar estado"
                    >
                      {(Object.keys(ESTADO_LABEL) as EstadoReciboReserva[]).map((e) => (
                        <option key={e} value={e} className="bg-surface text-ink">
                          {ESTADO_LABEL[e]}
                        </option>
                      ))}
                    </select>
                    {r.contrato_id && contratoMap[r.contrato_id] && (
                      <div className="text-[10px] text-ink-3 mt-1 truncate max-w-[200px]">
                        → {contratoLabel(contratoMap[r.contrato_id])}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => reimprimir(r)}
                        className="p-1.5 rounded-md text-ink-3 hover:text-accent hover:bg-white/5"
                        title="Descargar / reimprimir"
                      >
                        <FileDown size={15} />
                      </button>
                      <button
                        onClick={() => enviarEmail(r)}
                        disabled={!r.reservante_email || busy}
                        className="p-1.5 rounded-md text-ink-3 hover:text-accent hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent"
                        title={
                          r.reservante_email
                            ? `Enviar por email a ${r.reservante_email}`
                            : 'Sin email cargado'
                        }
                      >
                        <Mail size={15} />
                      </button>
                      <button
                        onClick={() => enviarWhatsApp(r)}
                        disabled={!r.reservante_telefono || busy}
                        className="p-1.5 rounded-md text-[#25D366] hover:bg-[#25D366]/10 disabled:opacity-30 disabled:hover:bg-transparent"
                        title={
                          r.reservante_telefono
                            ? 'Enviar por WhatsApp (con link de descarga)'
                            : 'Sin teléfono cargado'
                        }
                      >
                        <MessageCircle size={15} />
                      </button>
                      <button
                        onClick={() => setLinkFor(r)}
                        className={`p-1.5 rounded-md hover:bg-white/5 ${
                          r.contrato_id ? 'text-ok' : 'text-ink-3 hover:text-accent'
                        }`}
                        title="Vincular a contrato"
                      >
                        <Link2 size={15} />
                      </button>
                      <button
                        onClick={() => setDelFor(r)}
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

      {/* Modal Nuevo recibo */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo recibo de reserva"
        wide
        footer={
          <>
            <button
              onClick={() => setOpen(false)}
              className="text-sm text-ink-2 hover:text-ink px-4 py-2"
            >
              Cancelar
            </button>
            <button
              onClick={generar}
              disabled={busy}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
              Generar recibo (PDF)
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Tipo de operación */}
          <div className="grid grid-cols-2 gap-2">
            {(['locacion', 'venta'] as TipoOperacionRecibo[]).map((t) => (
              <button
                key={t}
                onClick={() => patch({ tipo: t })}
                className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                  form.tipo === t
                    ? 'border-accent/50 bg-accent/10 text-accent'
                    : 'border-border text-ink-2 hover:text-ink'
                }`}
              >
                Reserva de {t === 'locacion' ? 'locación' : 'venta'}
              </button>
            ))}
          </div>

          {/* Inmueble */}
          <div className="border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="label mb-0">Inmueble</span>
              <div className="flex gap-1 text-xs">
                <button
                  onClick={() => patch({ propModo: 'sistema' })}
                  className={`px-2 py-0.5 rounded ${
                    form.propModo === 'sistema' ? 'bg-accent/15 text-accent' : 'text-ink-3'
                  }`}
                >
                  Del sistema
                </button>
                <button
                  onClick={() => patch({ propModo: 'manual', propiedadId: '' })}
                  className={`px-2 py-0.5 rounded ${
                    form.propModo === 'manual' ? 'bg-accent/15 text-accent' : 'text-ink-3'
                  }`}
                >
                  Carga manual
                </button>
              </div>
            </div>
            {form.propModo === 'sistema' && (
              <Field label="Propiedad">
                <Select
                  value={form.propiedadId}
                  onChange={(e) => patch({ propiedadId: e.target.value })}
                >
                  <option value="">Elegí una propiedad…</option>
                  {propiedades.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.direccion}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Dirección (como figura en el recibo)" required>
              <TextInput
                value={form.direccion}
                onChange={(e) => patch({ direccion: e.target.value })}
                placeholder='Av. Libertad 2956, Planta Baja, Departamento "D", Mar del Plata'
              />
            </Field>
          </div>

          {/* Reservante */}
          <div className="border border-border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="label mb-0">Reservante</span>
              <div className="flex gap-1 text-xs">
                <button
                  onClick={() => patch({ resModo: 'sistema' })}
                  className={`px-2 py-0.5 rounded ${
                    form.resModo === 'sistema' ? 'bg-accent/15 text-accent' : 'text-ink-3'
                  }`}
                >
                  Del sistema
                </button>
                <button
                  onClick={() => patch({ resModo: 'manual', inquilinoId: '' })}
                  className={`px-2 py-0.5 rounded ${
                    form.resModo === 'manual' ? 'bg-accent/15 text-accent' : 'text-ink-3'
                  }`}
                >
                  Carga manual
                </button>
              </div>
            </div>
            {form.resModo === 'sistema' && (
              <Field label="Inquilino / cliente">
                <Select
                  value={form.inquilinoId}
                  onChange={(e) => patch({ inquilinoId: e.target.value })}
                >
                  <option value="">Elegí una persona…</option>
                  {inquilinos.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                      {i.dni ? ` (${i.dni})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre completo" required>
                <TextInput
                  value={form.resNombre}
                  onChange={(e) => patch({ resNombre: e.target.value })}
                  disabled={form.resModo === 'sistema'}
                />
              </Field>
              <Field label="DNI">
                <TextInput
                  value={form.resDni}
                  onChange={(e) => patch({ resDni: e.target.value })}
                  disabled={form.resModo === 'sistema'}
                />
              </Field>
            </div>
            <Field label="Domicilio declarado">
              <TextInput
                value={form.resDomicilio}
                onChange={(e) => patch({ resDomicilio: e.target.value })}
                placeholder="Catamarca 3454, Mar del Plata, Provincia de Buenos Aires"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Email (para enviar el recibo)">
                <TextInput
                  type="email"
                  value={form.resEmail}
                  onChange={(e) => patch({ resEmail: e.target.value })}
                  placeholder="cliente@email.com"
                />
              </Field>
              <Field label="Teléfono (WhatsApp)">
                <TextInput
                  value={form.resTelefono}
                  onChange={(e) => patch({ resTelefono: e.target.value })}
                  placeholder="223 555 1234"
                />
              </Field>
            </div>
            {form.resModo === 'manual' && (
              <label className="flex items-center gap-2 text-xs text-ink-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.crearInquilino}
                  onChange={(e) => patch({ crearInquilino: e.target.checked })}
                />
                Crear esta persona como inquilino/cliente en el sistema
              </label>
            )}
          </div>

          {/* Importe */}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Moneda">
              <Select
                value={form.moneda}
                onChange={(e) => patch({ moneda: e.target.value as Moneda })}
              >
                <option value="ARS">Pesos (ARS)</option>
                <option value="USD">Dólares (USD)</option>
              </Select>
            </Field>
            <Field label="Importe recibido" required>
              <TextInput
                type="number"
                value={form.monto}
                onChange={(e) => patch({ monto: e.target.value })}
                placeholder="800000"
              />
            </Field>
            <Field label="Fecha de emisión">
              <TextInput
                type="date"
                value={form.fecha}
                onChange={(e) => patch({ fecha: e.target.value })}
              />
            </Field>
          </div>
          {montoPreview > 0 && (
            <p className="text-xs text-ink-3 -mt-2">
              En letras: <span className="text-ink-2">{importeEnLetras(montoPreview, form.moneda)}</span>
            </p>
          )}

          {/* Condiciones según tipo */}
          {form.tipo === 'locacion' ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plazo de la locación (meses)">
                <TextInput
                  type="number"
                  value={form.plazoMeses}
                  onChange={(e) => patch({ plazoMeses: e.target.value })}
                  placeholder="1"
                />
              </Field>
              <Field label="Canon locativo total">
                <TextInput
                  type="number"
                  value={form.canonTotal}
                  onChange={(e) => patch({ canonTotal: e.target.value })}
                  placeholder="800000"
                />
              </Field>
            </div>
          ) : (
            <Field label="Monto total de la operación pactada">
              <TextInput
                type="number"
                value={form.montoOperacion}
                onChange={(e) => patch({ montoOperacion: e.target.value })}
                placeholder="120000000"
              />
            </Field>
          )}

          <Field label="Ciudad">
            <TextInput value={form.ciudad} onChange={(e) => patch({ ciudad: e.target.value })} />
          </Field>

          {/* Cláusula editable */}
          <Field label="Cláusula de arrepentimiento y condiciones (editable)">
            <TextArea
              value={form.clausula}
              onChange={(e) => {
                setClausulaTocada(true)
                patch({ clausula: e.target.value })
              }}
              className="min-h-[160px] text-xs leading-relaxed"
            />
          </Field>
          <div className="flex items-center justify-between -mt-2">
            <p className="text-[11px] text-ink-3">
              Usá <span className="text-ink-2">**negrita**</span> para resaltar. Los importes se
              completan solos.
            </p>
            <button
              type="button"
              onClick={() => {
                setClausulaTocada(false)
                patch({ clausula: refrescarClausula(form) })
              }}
              className="text-[11px] text-ink-3 hover:text-accent flex items-center gap-1"
            >
              <RefreshCw size={11} /> Restaurar texto por defecto
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal vincular a contrato */}
      <Modal
        open={!!linkFor}
        onClose={() => setLinkFor(null)}
        title="Vincular recibo a un contrato"
      >
        {linkFor && (
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              Reserva N° <span className="num">{String(linkFor.numero).padStart(6, '0')}</span> ·{' '}
              {linkFor.reservante_nombre} · {linkFor.direccion}
            </p>
            <Field label="Contrato resultante">
              <Select
                defaultValue={linkFor.contrato_id ?? ''}
                onChange={(e) =>
                  vincularContrato(linkFor, e.target.value ? e.target.value : null)
                }
              >
                <option value="">— Sin vincular —</option>
                {contratosParaVincular(linkFor).map((c) => (
                  <option key={c.id} value={c.id}>
                    {contratoLabel(c)}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-xs text-ink-3">
              Al vincular, el recibo pasa a estado <span className="text-ok">Convertido en contrato</span>.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!delFor}
        title="Eliminar recibo"
        message={`¿Eliminar el recibo N° ${
          delFor ? String(delFor.numero).padStart(6, '0') : ''
        }? También se borra su PDF. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => delFor && eliminar(delFor)}
        onClose={() => setDelFor(null)}
      />
    </div>
  )
}
