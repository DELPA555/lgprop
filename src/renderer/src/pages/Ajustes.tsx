import { useEffect, useState } from 'react'
import { Save, Loader2, BellRing, DollarSign, Database, Download, RefreshCw, Building, CalendarDays, ReceiptText, Megaphone } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import {
  CLAUSULA_LOCACION_DEFAULT,
  CLAUSULA_VENTA_DEFAULT,
  CIUDAD_DEFAULT,
  REGISTRO_DEFAULT,
  CLAVE_CLAUSULA_LOCACION,
  CLAVE_CLAUSULA_VENTA,
  CLAVE_CIUDAD,
  CLAVE_REGISTRO
} from '@/lib/recibosReservaDefaults'

const CLAVE_DIAS = 'avisos_dias_anticipacion_contrato'
const CLAVE_COTIZ = 'cotizacion_pagos_tipo'
const CLAVE_CORTE = 'consorcios_corte_liquidacion_dia'
const CLAVE_RECLAMO = 'consorcios_reclamo_dias_alerta'
const CLAVE_EVENTOS = 'avisos_eventos_dias_anticipacion'
const CLAVE_FICHA_TEL = 'ficha_contacto_telefono'
const CLAVE_FICHA_EMAIL = 'ficha_contacto_email'
const CLAVE_FICHA_WEB = 'ficha_contacto_web'
const PRESETS = [30, 60, 90]
const TIPOS_COTIZ = [
  { id: 'blue', label: 'Blue' },
  { id: 'mep', label: 'MEP / Bolsa' },
  { id: 'oficial', label: 'Oficial' }
]

export default function Ajustes(): JSX.Element {
  const toast = useToast()
  const [dias, setDias] = useState<number>(60)
  const [cotizTipo, setCotizTipo] = useState('blue')
  const [cotizList, setCotizList] = useState<
    { tipo: string; venta: number | null; fecha: string }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingCotiz, setSavingCotiz] = useState(false)
  const [corteDia, setCorteDia] = useState<number>(10)
  const [reclamoDias, setReclamoDias] = useState<number>(15)
  const [eventosDias, setEventosDias] = useState<number>(1)
  const [savingEventos, setSavingEventos] = useState(false)
  const [savingConsorcio, setSavingConsorcio] = useState(false)
  const [backups, setBackups] = useState<{ name: string; size: number | null }[]>([])
  const [genBackup, setGenBackup] = useState(false)
  const [recLoc, setRecLoc] = useState(CLAUSULA_LOCACION_DEFAULT)
  const [recVenta, setRecVenta] = useState(CLAUSULA_VENTA_DEFAULT)
  const [recCiudad, setRecCiudad] = useState(CIUDAD_DEFAULT)
  const [recRegistro, setRecRegistro] = useState(REGISTRO_DEFAULT)
  const [savingRecibo, setSavingRecibo] = useState(false)
  const [fichaTel, setFichaTel] = useState('')
  const [fichaEmail, setFichaEmail] = useState('')
  const [fichaWeb, setFichaWeb] = useState('')
  const [savingFicha, setSavingFicha] = useState(false)

  const loadBackups = async (): Promise<void> => {
    const { data } = await supabase.storage
      .from('backups')
      .list('', { limit: 20, sortBy: { column: 'name', order: 'desc' } })
    setBackups(
      (data ?? [])
        .filter((f) => f.name.endsWith('.json'))
        .map((f) => ({ name: f.name, size: (f.metadata?.size as number) ?? null }))
    )
  }

  const descargarBackup = async (name: string): Promise<void> => {
    const { data } = await supabase.storage.from('backups').createSignedUrl(name, 60, {
      download: name
    })
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    else toast.error('No se pudo generar el enlace de descarga')
  }

  const generarBackup = async (): Promise<void> => {
    setGenBackup(true)
    const { data, error } = await supabase.functions.invoke('backup-db', { body: {} })
    setGenBackup(false)
    if (error) return void toast.error(error.message)
    if (!data?.ok) return void toast.error('El backup terminó con errores')
    toast.success(`Backup generado (${data.tablas} tablas, ${data.filas} filas)`)
    void loadBackups()
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from('configuracion')
        .select('clave, valor')
        .in('clave', [
          CLAVE_DIAS,
          CLAVE_COTIZ,
          CLAVE_CORTE,
          CLAVE_RECLAMO,
          CLAVE_EVENTOS,
          CLAVE_CLAUSULA_LOCACION,
          CLAVE_CLAUSULA_VENTA,
          CLAVE_CIUDAD,
          CLAVE_REGISTRO,
          CLAVE_FICHA_TEL,
          CLAVE_FICHA_EMAIL,
          CLAVE_FICHA_WEB
        ])
      for (const row of data ?? []) {
        if (row.clave === CLAVE_DIAS && row.valor) setDias(parseInt(row.valor, 10) || 60)
        if (row.clave === CLAVE_COTIZ && row.valor) setCotizTipo(row.valor)
        if (row.clave === CLAVE_CORTE && row.valor) setCorteDia(parseInt(row.valor, 10) || 10)
        if (row.clave === CLAVE_RECLAMO && row.valor) setReclamoDias(parseInt(row.valor, 10) || 15)
        if (row.clave === CLAVE_EVENTOS && row.valor != null) {
          const n = parseInt(row.valor, 10)
          if (Number.isFinite(n) && n >= 0) setEventosDias(n)
        }
        if (row.clave === CLAVE_CLAUSULA_LOCACION && row.valor) setRecLoc(row.valor)
        if (row.clave === CLAVE_CLAUSULA_VENTA && row.valor) setRecVenta(row.valor)
        if (row.clave === CLAVE_CIUDAD && row.valor) setRecCiudad(row.valor)
        if (row.clave === CLAVE_REGISTRO && row.valor) setRecRegistro(row.valor)
        if (row.clave === CLAVE_FICHA_TEL && row.valor != null) setFichaTel(row.valor)
        if (row.clave === CLAVE_FICHA_EMAIL && row.valor != null) setFichaEmail(row.valor)
        if (row.clave === CLAVE_FICHA_WEB && row.valor != null) setFichaWeb(row.valor)
      }
      // Últimas cotizaciones (una por tipo) para mostrar de referencia
      const { data: cot } = await supabase
        .from('cotizaciones_dolar')
        .select('tipo, venta, fecha')
        .order('fecha', { ascending: false })
        .limit(30)
      const latest: Record<string, { tipo: string; venta: number | null; fecha: string }> = {}
      for (const c of cot ?? []) if (!latest[c.tipo]) latest[c.tipo] = c
      setCotizList(Object.values(latest))
      await loadBackups()
      setLoading(false)
    })()
  }, [])

  const saveConsorcio = async (): Promise<void> => {
    if (corteDia < 1 || corteDia > 28) return toast.error('El día de corte debe estar entre 1 y 28')
    if (reclamoDias < 1) return toast.error('Los días de reclamo deben ser mayores a 0')
    setSavingConsorcio(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('configuracion').upsert(
      [
        { clave: CLAVE_CORTE, valor: String(corteDia), updated_at: now },
        { clave: CLAVE_RECLAMO, valor: String(reclamoDias), updated_at: now }
      ],
      { onConflict: 'clave' }
    )
    setSavingConsorcio(false)
    if (error) return void toast.error(error.message)
    toast.success('Configuración de consorcios guardada')
  }

  const saveEventos = async (): Promise<void> => {
    if (eventosDias < 0 || eventosDias > 30)
      return toast.error('Ingresá un número de días entre 0 y 30')
    setSavingEventos(true)
    const { error } = await supabase
      .from('configuracion')
      .upsert(
        { clave: CLAVE_EVENTOS, valor: String(eventosDias), updated_at: new Date().toISOString() },
        { onConflict: 'clave' }
      )
    setSavingEventos(false)
    if (error) return void toast.error(error.message)
    toast.success('Recordatorios de agenda configurados')
  }

  const saveCotiz = async (): Promise<void> => {
    setSavingCotiz(true)
    const { error } = await supabase
      .from('configuracion')
      .upsert(
        { clave: CLAVE_COTIZ, valor: cotizTipo, updated_at: new Date().toISOString() },
        { onConflict: 'clave' }
      )
    setSavingCotiz(false)
    if (error) return void toast.error(error.message)
    toast.success('Cotización configurada')
  }

  const saveRecibo = async (): Promise<void> => {
    if (!recLoc.trim() || !recVenta.trim())
      return toast.error('Las cláusulas no pueden quedar vacías')
    if (!recCiudad.trim()) return toast.error('Ingresá la ciudad')
    setSavingRecibo(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('configuracion').upsert(
      [
        { clave: CLAVE_CLAUSULA_LOCACION, valor: recLoc, updated_at: now },
        { clave: CLAVE_CLAUSULA_VENTA, valor: recVenta, updated_at: now },
        { clave: CLAVE_CIUDAD, valor: recCiudad.trim(), updated_at: now },
        { clave: CLAVE_REGISTRO, valor: recRegistro.trim(), updated_at: now }
      ],
      { onConflict: 'clave' }
    )
    setSavingRecibo(false)
    if (error) return void toast.error(error.message)
    toast.success('Textos de recibos de reserva guardados')
  }

  const saveFicha = async (): Promise<void> => {
    setSavingFicha(true)
    const now = new Date().toISOString()
    const { error } = await supabase.from('configuracion').upsert(
      [
        { clave: CLAVE_FICHA_TEL, valor: fichaTel.trim(), updated_at: now },
        { clave: CLAVE_FICHA_EMAIL, valor: fichaEmail.trim(), updated_at: now },
        { clave: CLAVE_FICHA_WEB, valor: fichaWeb.trim(), updated_at: now }
      ],
      { onConflict: 'clave' }
    )
    setSavingFicha(false)
    if (error) return void toast.error(error.message)
    toast.success('Datos de contacto de la ficha guardados')
  }

  const save = async (): Promise<void> => {
    if (!dias || dias < 1) return toast.error('Ingresá un número de días válido')
    setSaving(true)
    const { error } = await supabase
      .from('configuracion')
      .upsert(
        { clave: CLAVE_DIAS, valor: String(dias), updated_at: new Date().toISOString() },
        { onConflict: 'clave' }
      )
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success('Configuración guardada')
  }

  return (
    <div className="p-6">
      <PageHeader title="Ajustes" subtitle="Configuración general del sistema" />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="card p-5 max-w-xl">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <BellRing size={16} className="text-zinc-400" /> Avisos de vencimiento
        </h2>
        <p className="text-sm text-zinc-400 mt-1.5">
          ¿Con cuántos días de anticipación querés recibir el aviso de vencimiento de{' '}
          <span className="text-zinc-200">contratos</span> y{' '}
          <span className="text-zinc-200">seguros/ART</span>?
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 mt-4">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setDias(p)}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    dias === p
                      ? 'bg-accent text-[#04110f] font-medium border-accent'
                      : 'border-border text-ink-2 hover:text-ink hover:bg-white/5'
                  }`}
                >
                  {p} días
                </button>
              ))}
              <span className="text-zinc-600 text-xs">o</span>
              <div className="w-40">
                <Field label="Personalizado (días)">
                  <TextInput
                    type="number"
                    min={1}
                    max={365}
                    value={dias}
                    onChange={(e) => setDias(Number(e.target.value))}
                  />
                </Field>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Guardar
              </button>
              <span className="text-xs text-zinc-600">
                Aplica en el motor de avisos diario (contratos y seguros por vencer).
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="card p-5 max-w-xl mt-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <CalendarDays size={16} className="text-zinc-400" /> Recordatorios de agenda
        </h2>
        <p className="text-sm text-zinc-400 mt-1.5">
          ¿Con cuánta anticipación querés recibir el recordatorio (dashboard + email) de los{' '}
          <span className="text-zinc-200">eventos de la agenda</span>?
        </p>
        {!loading && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { n: 0, label: 'Solo el día' },
                { n: 1, label: 'Hoy y mañana' },
                { n: 2, label: 'Hasta 2 días' },
                { n: 3, label: 'Hasta 3 días' }
              ].map((p) => (
                <button
                  key={p.n}
                  onClick={() => setEventosDias(p.n)}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    eventosDias === p.n
                      ? 'bg-accent text-[#04110f] font-medium border-accent'
                      : 'border-border text-ink-2 hover:text-ink hover:bg-white/5'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <span className="text-zinc-600 text-xs">o</span>
              <div className="w-36">
                <Field label="Personalizado (días)">
                  <TextInput
                    type="number"
                    min={0}
                    max={30}
                    value={eventosDias}
                    onChange={(e) => setEventosDias(Number(e.target.value))}
                  />
                </Field>
              </div>
            </div>
            <button
              onClick={saveEventos}
              disabled={savingEventos}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {savingEventos ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Guardar
            </button>
          </div>
        )}
      </div>

      <div className="card p-5 max-w-xl mt-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <DollarSign size={16} className="text-zinc-400" /> Cotización del dólar (pagos en USD)
        </h2>
        <p className="text-sm text-zinc-400 mt-1.5">
          Qué cotización se usa para convertir a pesos los pagos de contratos en dólares. Las tres
          se guardan a diario igual.
        </p>
        {!loading && (
          <div className="mt-4 space-y-4">
            <div className="flex items-end gap-3">
              <div className="w-48">
                <Field label="Cotización a aplicar">
                  <Select value={cotizTipo} onChange={(e) => setCotizTipo(e.target.value)}>
                    {TIPOS_COTIZ.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <button
                onClick={saveCotiz}
                disabled={savingCotiz}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {savingCotiz ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Guardar
              </button>
            </div>
            {cotizList.length > 0 && (
              <div className="text-xs text-zinc-500">
                Últimas cotizaciones (venta):
                <div className="flex flex-wrap gap-3 mt-1">
                  {cotizList.map((c) => (
                    <span key={c.tipo} className="text-zinc-300">
                      {TIPOS_COTIZ.find((t) => t.id === c.tipo)?.label ?? c.tipo}: $
                      {c.venta}{' '}
                      <span className="text-zinc-600">({formatDate(c.fecha)})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-5 max-w-xl mt-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Building size={16} className="text-zinc-400" /> Consorcios · avisos automáticos
        </h2>
        <p className="text-sm text-zinc-400 mt-1.5">
          Cuándo el motor de avisos diario alerta por liquidaciones de expensas sin generar y por
          reclamos sin resolver.
        </p>
        {!loading && (
          <div className="mt-4 flex items-end gap-3 flex-wrap">
            <div className="w-48">
              <Field label="Día de corte de liquidación">
                <TextInput
                  type="number"
                  min={1}
                  max={28}
                  value={corteDia}
                  onChange={(e) => setCorteDia(Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="w-48">
              <Field label="Avisar reclamos sin resolver (días)">
                <TextInput
                  type="number"
                  min={1}
                  max={365}
                  value={reclamoDias}
                  onChange={(e) => setReclamoDias(Number(e.target.value))}
                />
              </Field>
            </div>
            <button
              onClick={saveConsorcio}
              disabled={savingConsorcio}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {savingConsorcio ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Guardar
            </button>
          </div>
        )}
        <p className="text-xs text-zinc-600 mt-3">
          Pasado el <span className="text-zinc-300">día de corte</span> de cada mes, si falta la
          liquidación del mes anterior de un consorcio con unidades, se avisa. Los reclamos abiertos
          hace más de esos días también.
        </p>
      </div>

      <div className="card p-5 max-w-xl mt-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <ReceiptText size={16} className="text-zinc-400" /> Recibos de reserva
        </h2>
        <p className="text-sm text-zinc-400 mt-1.5">
          Cláusula de arrepentimiento y datos institucionales que aparecen en los recibos. Usá{' '}
          <span className="text-zinc-200">**negrita**</span> para resaltar y los placeholders{' '}
          <span className="text-zinc-300">{'{DOBLE_LETRAS}'}</span>,{' '}
          <span className="text-zinc-300">{'{DOBLE}'}</span> (se completan con el doble del importe
          al generar).
        </p>
        {!loading && (
          <div className="mt-4 space-y-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-56">
                <Field label="Ciudad por defecto">
                  <TextInput value={recCiudad} onChange={(e) => setRecCiudad(e.target.value)} />
                </Field>
              </div>
              <div className="w-40">
                <Field label="N° de registro (REG.)">
                  <TextInput value={recRegistro} onChange={(e) => setRecRegistro(e.target.value)} />
                </Field>
              </div>
            </div>
            <Field label="Cláusula — Reserva de locación">
              <TextArea
                value={recLoc}
                onChange={(e) => setRecLoc(e.target.value)}
                className="min-h-[140px] text-xs leading-relaxed"
              />
            </Field>
            <Field label="Cláusula — Reserva de venta">
              <TextArea
                value={recVenta}
                onChange={(e) => setRecVenta(e.target.value)}
                className="min-h-[140px] text-xs leading-relaxed"
              />
            </Field>
            <button
              onClick={saveRecibo}
              disabled={savingRecibo}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {savingRecibo ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Guardar
            </button>
          </div>
        )}
      </div>

      <div className="card p-5 max-w-xl mt-5">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Megaphone size={16} className="text-zinc-400" /> Ficha de propiedad · contacto
        </h2>
        <p className="text-sm text-zinc-400 mt-1.5">
          Estos datos aparecen al pie de la ficha en PDF que se comparte con los clientes desde la{' '}
          <span className="text-zinc-200">Cartera</span>. Los que dejes vacíos no se muestran.
        </p>
        {!loading && (
          <div className="mt-4 space-y-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-56">
                <Field label="Teléfono">
                  <TextInput
                    value={fichaTel}
                    onChange={(e) => setFichaTel(e.target.value)}
                    placeholder="Ej: 223 555-1234"
                  />
                </Field>
              </div>
              <div className="w-64">
                <Field label="Email">
                  <TextInput
                    type="email"
                    value={fichaEmail}
                    onChange={(e) => setFichaEmail(e.target.value)}
                    placeholder="Ej: info@lgpropiedades.com"
                  />
                </Field>
              </div>
            </div>
            <Field label="Web / redes">
              <TextInput
                value={fichaWeb}
                onChange={(e) => setFichaWeb(e.target.value)}
                placeholder="Ej: www.lgpropiedades.com.ar"
              />
            </Field>
            <button
              onClick={saveFicha}
              disabled={savingFicha}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {savingFicha ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Guardar
            </button>
          </div>
        )}
      </div>

      <div className="card p-5 max-w-xl mt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Database size={16} className="text-zinc-400" /> Backups de la base
          </h2>
          <button
            onClick={generarBackup}
            disabled={genBackup}
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border text-zinc-300 hover:text-white hover:bg-white/5"
          >
            {genBackup ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Generar ahora
          </button>
        </div>
        <p className="text-sm text-zinc-400 mt-1.5">
          Se genera automáticamente cada semana (se conservan los últimos 8). Descargalo y
          guardalo en tu Google Drive para tener una copia fuera de Supabase.
        </p>
        <div className="mt-4 space-y-1">
          {backups.length === 0 ? (
            <p className="text-xs text-zinc-600">Todavía no hay backups.</p>
          ) : (
            backups.map((b) => (
              <div key={b.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-zinc-300">
                  <Database size={13} className="text-zinc-600" />
                  {b.name}
                  {b.size != null && (
                    <span className="text-[10px] text-zinc-600">
                      {(b.size / 1024).toFixed(0)} KB
                    </span>
                  )}
                </span>
                <button
                  onClick={() => descargarBackup(b.name)}
                  className="flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
                >
                  <Download size={13} /> Descargar
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
