import { useEffect, useMemo, useState } from 'react'
import { Calculator, Check, X, Loader2, ArrowRight, History, MailCheck, Send } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type {
  ActualizacionContrato,
  Contrato,
  IndiceValor,
  Propiedad,
  Inquilino
} from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import { useToast } from '@/components/ui/Toast'
import { formatARS, formatDate } from '@/lib/format'
import TelefonoWhatsApp, { msgActualizacion } from '@/components/ui/TelefonoWhatsApp'
import { addMonthsISO, todayISO } from '@/lib/dates'
import { calcularActualizacion } from '@/lib/actualizaciones'
import { edgeErrorMessage } from '@/lib/edgeError'
import EstadoChip from '@/components/ui/EstadoChip'

export default function Actualizaciones(): JSX.Element {
  const toast = useToast()
  const [acts, setActs] = useState<ActualizacionContrato[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [valores, setValores] = useState<IndiceValor[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [inquilinos, setInquilinos] = useState<Inquilino[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [solicitando, setSolicitando] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, string>>({})

  const contratoMap = useMemo(() => {
    const m: Record<string, Contrato> = {}
    for (const c of contratos) m[c.id] = c
    return m
  }, [contratos])
  const propMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of propiedades) m[p.id] = p.direccion
    return m
  }, [propiedades])
  const inqMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const i of inquilinos) m[i.id] = i.nombre
    return m
  }, [inquilinos])

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [a, c, v, p, i] = await Promise.all([
      supabase.from('actualizaciones_contrato').select('*').order('fecha_calculo', { ascending: false }),
      supabase.from('contratos').select('*'),
      supabase.from('indices_valores').select('*'),
      supabase.from('propiedades').select('*'),
      supabase.from('inquilinos').select('*')
    ])
    if (a.error) toast.error(a.error.message)
    setActs(a.data ?? [])
    setContratos(c.data ?? [])
    setValores(v.data ?? [])
    setPropiedades(p.data ?? [])
    setInquilinos(i.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const pendientes = useMemo(() => acts.filter((a) => !a.confirmado_por_usuario), [acts])
  const historial = useMemo(
    () => acts.filter((a) => a.confirmado_por_usuario).slice(0, 15),
    [acts]
  )

  const contratoLabel = (contratoId: string): string => {
    const c = contratoMap[contratoId]
    if (!c) return 'Contrato'
    return `${propMap[c.propiedad_id] ?? 'Propiedad'} · ${inqMap[c.inquilino_id] ?? ''}`
  }

  // ── Generar actualizaciones pendientes de los contratos que ya vencieron ──
  const generar = async (): Promise<void> => {
    setGenerating(true)
    try {
      const hoy = todayISO()
      const yaPendiente = new Set(pendientes.map((a) => a.contrato_id))
      // Última actualización confirmada por contrato (para la fecha "anterior")
      const ultimaConfirmada: Record<string, string> = {}
      for (const a of acts) {
        if (!a.confirmado_por_usuario) continue
        if (!ultimaConfirmada[a.contrato_id] || a.fecha_calculo > ultimaConfirmada[a.contrato_id]) {
          ultimaConfirmada[a.contrato_id] = a.fecha_calculo
        }
      }

      const nuevas: Partial<ActualizacionContrato>[] = []
      const saltados: string[] = []

      for (const c of contratos) {
        if (c.estado !== 'activo') continue
        if (!c.proxima_actualizacion || c.proxima_actualizacion > hoy) continue
        if (yaPendiente.has(c.id)) continue

        const fechaNueva = c.proxima_actualizacion
        const fechaAnterior = ultimaConfirmada[c.id] ?? c.fecha_inicio
        const calc = calcularActualizacion(c, fechaAnterior, fechaNueva, valores)
        if (!calc.ok) {
          saltados.push(`${propMap[c.propiedad_id] ?? 'Contrato'}: ${calc.motivo}`)
          continue
        }
        nuevas.push({
          contrato_id: c.id,
          fecha_calculo: fechaNueva,
          monto_anterior: c.monto_actual,
          monto_nuevo: calc.montoNuevo,
          indice_usado: calc.indiceUsado,
          coeficiente: calc.coeficiente,
          confirmado_por_usuario: false
        })
      }

      if (nuevas.length > 0) {
        const { error } = await supabase.from('actualizaciones_contrato').insert(nuevas)
        if (error) {
          toast.error(error.message)
          return
        }
      }
      await load()
      if (nuevas.length === 0 && saltados.length === 0) {
        toast.info('No hay contratos con actualización pendiente.')
      } else {
        toast.success(`${nuevas.length} actualización(es) generada(s)`)
        if (saltados.length) toast.info(`Sin datos para: ${saltados.slice(0, 3).join(' · ')}`)
      }
    } finally {
      setGenerating(false)
    }
  }

  const montoEditado = (a: ActualizacionContrato): number =>
    Number(edits[a.id] ?? a.monto_nuevo)

  // ── Pedir aprobación al dueño por email (link firmado) ──
  const solicitarAprobacion = async (a: ActualizacionContrato): Promise<void> => {
    setSolicitando(a.id)
    try {
      const { data, error } = await supabase.functions.invoke('solicitar-aprobacion-aumento', {
        body: { actualizacion_id: a.id }
      })
      if (error) return void toast.error(await edgeErrorMessage(error, 'No se pudo enviar la solicitud'))
      if (!data?.ok) return void toast.error(data?.error ?? 'No se pudo enviar la solicitud')
      toast.success(`Solicitud enviada al dueño (${data.email})`)
      await load()
    } finally {
      setSolicitando(null)
    }
  }

  // ── Confirmar: aplica el nuevo monto al contrato y avanza la próxima fecha ──
  const confirmar = async (a: ActualizacionContrato): Promise<void> => {
    const c = contratoMap[a.contrato_id]
    if (!c) return
    // Si se pidió aprobación, respetar la decisión del dueño
    if (a.aprobacion_estado === 'pendiente')
      return void toast.error('Esperando la aprobación del dueño. Todavía no respondió.')
    if (a.aprobacion_estado === 'rechazado')
      return void toast.error('El dueño rechazó este aumento. No se puede aplicar.')
    const montoFinal = montoEditado(a)
    if (!montoFinal || montoFinal <= 0) return void toast.error('El nuevo monto debe ser mayor a 0')

    setBusyId(a.id)
    try {
      const nextProx = (() => {
        const n = addMonthsISO(a.fecha_calculo, c.frecuencia_actualizacion_meses || 1)
        if (c.fecha_fin && n > c.fecha_fin) return null
        return n
      })()

      // 1) Aplicar al contrato
      const upd = await supabase
        .from('contratos')
        .update({ monto_actual: montoFinal, proxima_actualizacion: nextProx })
        .eq('id', c.id)
      if (upd.error) {
        toast.error(upd.error.message)
        return
      }

      // 2) Marcar la actualización como confirmada
      const { data: u } = await supabase.auth.getUser()
      const mark = await supabase
        .from('actualizaciones_contrato')
        .update({
          confirmado_por_usuario: true,
          confirmado_at: new Date().toISOString(),
          confirmado_por: u?.user?.id ?? null,
          monto_nuevo: montoFinal
        })
        .eq('id', a.id)
      if (mark.error) {
        toast.error(`Monto aplicado, pero no se pudo marcar: ${mark.error.message}`)
      } else {
        toast.success('Actualización aplicada al contrato')
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const descartar = async (a: ActualizacionContrato): Promise<void> => {
    setBusyId(a.id)
    try {
      const { error } = await supabase.from('actualizaciones_contrato').delete().eq('id', a.id)
      if (error) return void toast.error(error.message)
      toast.success('Actualización descartada')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Actualizaciones"
        subtitle="Cálculo y confirmación de aumentos de alquiler"
        actions={
          <button
            onClick={generar}
            disabled={generating}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
            Calcular pendientes
          </button>
        }
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="card p-4 mb-5 text-xs text-zinc-500">
        Las actualizaciones <b className="text-zinc-300">nunca se aplican solas</b>. El sistema
        calcula el nuevo monto según el índice de cada contrato y lo deja acá para que lo revises y
        confirmes. Podés ajustar el monto antes de aplicar (necesario en contratos con índice
        manual).
      </div>

      {/* Pendientes */}
      <h3 className="text-sm font-semibold text-white mb-3">
        Pendientes de confirmar {pendientes.length > 0 && `(${pendientes.length})`}
      </h3>

      {loading ? (
        <div className="card p-8 text-center text-zinc-600 text-sm">Cargando…</div>
      ) : pendientes.length === 0 ? (
        <div className="card p-8 text-center text-zinc-500 text-sm">
          No hay actualizaciones pendientes. Usá <b className="text-zinc-300">Calcular pendientes</b>{' '}
          para revisar los contratos vencidos.
        </div>
      ) : (
        <div className="space-y-3">
          {pendientes.map((a) => {
            const c = contratoMap[a.contrato_id]
            const pct =
              a.monto_anterior > 0
                ? ((montoEditado(a) - a.monto_anterior) / a.monto_anterior) * 100
                : 0
            const esManual = a.indice_usado === 'Manual'
            return (
              <div key={a.id} className="card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm text-white font-medium truncate">
                        {contratoLabel(a.contrato_id)}
                      </p>
                      {(() => {
                        const inq = c ? inquilinos.find((i) => i.id === c.inquilino_id) : null
                        if (!inq?.telefono) return null
                        const dir = c ? (propMap[c.propiedad_id] ?? 'la propiedad') : 'la propiedad'
                        return (
                          <TelefonoWhatsApp
                            numero={inq.telefono}
                            mensaje={msgActualizacion(inq.nombre, dir, a.fecha_calculo)}
                            iconOnly
                            size={14}
                          />
                        )
                      })()}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {a.indice_usado}
                      {a.coeficiente != null && ` · coef. ${a.coeficiente.toFixed(4)}`} · vence{' '}
                      {formatDate(a.fecha_calculo)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => confirmar(a)}
                      disabled={
                        busyId === a.id ||
                        a.aprobacion_estado === 'pendiente' ||
                        a.aprobacion_estado === 'rechazado'
                      }
                      title={
                        a.aprobacion_estado === 'pendiente'
                          ? 'Esperando la aprobación del dueño'
                          : a.aprobacion_estado === 'rechazado'
                            ? 'El dueño rechazó este aumento'
                            : 'Aplicar el aumento al contrato'
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {busyId === a.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Check size={13} />
                      )}
                      Confirmar
                    </button>
                    <button
                      onClick={() => descartar(a)}
                      disabled={busyId === a.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-300 border border-border hover:text-white disabled:opacity-50"
                    >
                      <X size={13} /> Descartar
                    </button>
                  </div>
                </div>

                {/* Aprobación del dueño (paso opcional) */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {a.aprobacion_estado === 'aprobado' ? (
                    <EstadoChip tone="ok">Aprobado por el dueño</EstadoChip>
                  ) : a.aprobacion_estado === 'rechazado' ? (
                    <>
                      <EstadoChip tone="bad">Rechazado por el dueño</EstadoChip>
                      <button
                        onClick={() => solicitarAprobacion(a)}
                        disabled={solicitando === a.id}
                        className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-info disabled:opacity-50"
                      >
                        {solicitando === a.id ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Send size={11} />
                        )}
                        Volver a pedir
                      </button>
                    </>
                  ) : a.aprobacion_estado === 'pendiente' ? (
                    <>
                      <EstadoChip tone="warn">Esperando aprobación del dueño</EstadoChip>
                      <button
                        onClick={() => solicitarAprobacion(a)}
                        disabled={solicitando === a.id}
                        className="flex items-center gap-1 text-[11px] text-ink-3 hover:text-info disabled:opacity-50"
                      >
                        {solicitando === a.id ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Send size={11} />
                        )}
                        Reenviar email
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => solicitarAprobacion(a)}
                      disabled={solicitando === a.id}
                      className="flex items-center gap-1.5 text-[11px] text-info hover:text-info/80 disabled:opacity-50"
                      title="Enviar un email al dueño para que apruebe o rechace este aumento"
                    >
                      {solicitando === a.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <MailCheck size={12} />
                      )}
                      Pedir aprobación al dueño
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Monto actual</p>
                    <p className="text-sm text-zinc-300 tabular-nums">{formatARS(a.monto_anterior)}</p>
                  </div>
                  <ArrowRight size={16} className="text-zinc-600" />
                  <div>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-wider">
                      Nuevo monto {esManual && '(cargalo)'}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        className="input w-36 py-1"
                        value={edits[a.id] ?? String(a.monto_nuevo)}
                        onChange={(e) => setEdits((m) => ({ ...m, [a.id]: e.target.value }))}
                      />
                      <span
                        className={`text-xs font-semibold ${pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                      >
                        {pct >= 0 ? '+' : ''}
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {c && (
                    <div className="ml-auto text-right">
                      <p className="text-[10px] text-zinc-600 uppercase tracking-wider">
                        Próximo ajuste tras aplicar
                      </p>
                      <p className="text-xs text-zinc-400">
                        {(() => {
                          const n = addMonthsISO(a.fecha_calculo, c.frecuencia_actualizacion_meses || 1)
                          return c.fecha_fin && n > c.fecha_fin ? 'Fin del contrato' : formatDate(n)
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-white mt-8 mb-3 flex items-center gap-2">
            <History size={15} className="text-zinc-500" /> Aplicadas recientemente
          </h3>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
                  <th className="px-4 py-3 font-medium">Contrato</th>
                  <th className="px-4 py-3 font-medium">Índice</th>
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium text-right">Anterior → Nuevo</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((a) => (
                  <tr key={a.id} className="border-b border-border/60">
                    <td className="px-4 py-2.5 text-zinc-300">{contratoLabel(a.contrato_id)}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{a.indice_usado}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">
                      {formatDate(a.confirmado_at ?? a.fecha_calculo)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-300 tabular-nums text-xs">
                      {formatARS(a.monto_anterior)} → {formatARS(a.monto_nuevo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
