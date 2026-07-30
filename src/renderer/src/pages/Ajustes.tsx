import { useEffect, useState } from 'react'
import { Save, Loader2, BellRing, DollarSign, Database, Download, RefreshCw } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import { Field, TextInput, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'

const CLAVE_DIAS = 'avisos_dias_anticipacion_contrato'
const CLAVE_COTIZ = 'cotizacion_pagos_tipo'
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
  const [backups, setBackups] = useState<{ name: string; size: number | null }[]>([])
  const [genBackup, setGenBackup] = useState(false)

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
        .in('clave', [CLAVE_DIAS, CLAVE_COTIZ])
      for (const row of data ?? []) {
        if (row.clave === CLAVE_DIAS && row.valor) setDias(parseInt(row.valor, 10) || 60)
        if (row.clave === CLAVE_COTIZ && row.valor) setCotizTipo(row.valor)
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
