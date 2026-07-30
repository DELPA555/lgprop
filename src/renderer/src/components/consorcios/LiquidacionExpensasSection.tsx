import { useEffect, useMemo, useState } from 'react'
import { Calculator, FileDown, Loader2, Trash2, ReceiptText } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type {
  Consorcio,
  UnidadFuncional,
  PropietarioConsorcio,
  GastoEdificio,
  LiquidacionExpensas,
  ExpensaPorUnidad,
  EstadoPago
} from '@/types/database'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EstadoChip from '@/components/ui/EstadoChip'
import TelefonoWhatsApp, { msgPago } from '@/components/ui/TelefonoWhatsApp'
import { Field, TextInput } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { formatARS } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { generarExpensaPDF } from '@/lib/expensasPdf'

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
]
const currentYM = (): string => todayISO().slice(0, 7)
const mesLabel = (ym: string): string => {
  const [y, m] = ym.split('-')
  return `${MESES[Number(m) - 1] ?? m} ${y}`
}

const ESTADOS: { id: EstadoPago; label: string; cls: string }[] = [
  { id: 'pendiente', label: 'Pendiente', cls: 'bg-warn/15 text-warn' },
  { id: 'pagado', label: 'Pagado', cls: 'bg-ok/15 text-ok' },
  { id: 'atrasado', label: 'Atrasado', cls: 'bg-bad/15 text-bad' }
]

export default function LiquidacionExpensasSection({
  consorcio
}: {
  consorcio: Consorcio
}): JSX.Element {
  const toast = useToast()
  const { member } = useAuth()
  const consorcioId = consorcio.id
  const [ym, setYm] = useState(currentYM())
  const [unidades, setUnidades] = useState<UnidadFuncional[]>([])
  const [propietarios, setPropietarios] = useState<PropietarioConsorcio[]>([])
  const [gastos, setGastos] = useState<GastoEdificio[]>([])
  const [liquidacion, setLiquidacion] = useState<LiquidacionExpensas | null>(null)
  const [expensas, setExpensas] = useState<ExpensaPorUnidad[]>([])
  const [loading, setLoading] = useState(true)
  const [genOpen, setGenOpen] = useState(false)
  const [fondo, setFondo] = useState<number>(0)
  const [generando, setGenerando] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const mesISO = `${ym}-01`

  const propMap = useMemo(() => {
    const m: Record<string, PropietarioConsorcio> = {}
    for (const p of propietarios) m[p.id] = p
    return m
  }, [propietarios])
  const unidadMap = useMemo(() => {
    const m: Record<string, UnidadFuncional> = {}
    for (const u of unidades) m[u.id] = u
    return m
  }, [unidades])

  const totalGastosMes = useMemo(
    () => gastos.reduce((t, g) => t + (Number(g.monto) || 0), 0),
    [gastos]
  )
  const totalPct = useMemo(
    () => unidades.reduce((t, u) => t + (Number(u.porcentaje_fiscal) || 0), 0),
    [unidades]
  )
  const resumen = useMemo(() => {
    const total = expensas.reduce((t, e) => t + (Number(e.monto_a_pagar) || 0), 0)
    const cobrado = expensas
      .filter((e) => e.estado === 'pagado')
      .reduce((t, e) => t + (Number(e.monto_a_pagar) || 0), 0)
    return { total, cobrado, pendiente: total - cobrado }
  }, [expensas])

  const loadBase = async (): Promise<void> => {
    const [{ data: uni }, { data: props }] = await Promise.all([
      supabase.from('unidades_funcionales').select('*').eq('consorcio_id', consorcioId).order('identificador'),
      supabase.from('propietarios_consorcio').select('*')
    ])
    setUnidades(uni ?? [])
    setPropietarios(props ?? [])
  }
  const loadMes = async (): Promise<void> => {
    setLoading(true)
    const [{ data: gs }, { data: liq }] = await Promise.all([
      supabase
        .from('gastos_edificio')
        .select('*')
        .eq('consorcio_id', consorcioId)
        .eq('mes_correspondiente', mesISO),
      supabase
        .from('liquidaciones_expensas')
        .select('*')
        .eq('consorcio_id', consorcioId)
        .eq('mes', mesISO)
        .maybeSingle()
    ])
    setGastos(gs ?? [])
    setLiquidacion(liq ?? null)
    if (liq) {
      const { data: exp } = await supabase
        .from('expensas_por_unidad')
        .select('*')
        .eq('liquidacion_id', liq.id)
        .order('identificador')
      setExpensas(exp ?? [])
    } else {
      setExpensas([])
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadBase()
  }, [consorcioId])
  useEffect(() => {
    void loadMes()
  }, [consorcioId, mesISO])

  const abrirGenerar = (): void => {
    if (unidades.length === 0) return void toast.error('Cargá primero las unidades funcionales del edificio')
    setFondo(0)
    setGenOpen(true)
  }

  const generar = async (): Promise<void> => {
    const base = totalGastosMes + (Number(fondo) || 0)
    if (base <= 0) return void toast.error('No hay gastos ni fondo para repartir en este mes')
    const round = Math.round(totalPct * 1000) / 1000
    if (round !== 100) {
      toast.info(`Ojo: los % fiscales suman ${round}% (no 100%). Se reparte según cada %.`)
    }
    setGenerando(true)
    try {
      const { data: liq, error } = await supabase
        .from('liquidaciones_expensas')
        .insert({
          consorcio_id: consorcioId,
          mes: mesISO,
          total_gastos: totalGastosMes,
          monto_fondo_reserva_del_mes: Number(fondo) || 0,
          base_a_repartir: base,
          generada_por: member?.id ?? null
        })
        .select('*')
        .single()
      if (error || !liq) {
        setGenerando(false)
        return void toast.error(error?.message ?? 'No se pudo generar la liquidación')
      }
      const filas = unidades.map((u) => {
        const pct = Number(u.porcentaje_fiscal) || 0
        return {
          liquidacion_id: liq.id,
          unidad_id: u.id,
          identificador: u.identificador,
          porcentaje_aplicado: pct,
          monto_a_pagar: Math.round(base * pct) / 100,
          estado: 'pendiente' as EstadoPago
        }
      })
      const { error: e2 } = await supabase.from('expensas_por_unidad').insert(filas)
      if (e2) {
        setGenerando(false)
        return void toast.error(e2.message)
      }
      // Aporte al fondo de reserva
      if (Number(fondo) > 0) {
        await supabase.from('fondo_reserva').insert({
          consorcio_id: consorcioId,
          fecha: todayISO(),
          mes: mesISO,
          concepto: `Fondo de reserva ${mesLabel(ym)}`,
          monto: Number(fondo),
          liquidacion_id: liq.id
        })
      }
      setGenerando(false)
      setGenOpen(false)
      toast.success('Liquidación generada')
      void loadMes()
    } catch (e) {
      setGenerando(false)
      toast.error((e as Error).message)
    }
  }

  const eliminarLiquidacion = async (): Promise<void> => {
    if (!liquidacion) return
    setDeleting(true)
    // Borra expensas (cascade) + el aporte de fondo asociado, luego la liquidación
    await supabase.from('fondo_reserva').delete().eq('liquidacion_id', liquidacion.id)
    const { error } = await supabase.from('liquidaciones_expensas').delete().eq('id', liquidacion.id)
    setDeleting(false)
    setDelOpen(false)
    if (error) return void toast.error(error.message)
    toast.success('Liquidación eliminada')
    void loadMes()
  }

  const setEstado = async (e: ExpensaPorUnidad, estado: EstadoPago): Promise<void> => {
    const fecha_pago = estado === 'pagado' ? (e.fecha_pago ?? todayISO()) : null
    setExpensas((prev) => prev.map((x) => (x.id === e.id ? { ...x, estado, fecha_pago } : x)))
    const { error } = await supabase
      .from('expensas_por_unidad')
      .update({ estado, fecha_pago })
      .eq('id', e.id)
    if (error) {
      toast.error(error.message)
      void loadMes()
    }
  }

  const descargarPDF = async (e: ExpensaPorUnidad): Promise<void> => {
    if (!liquidacion) return
    const uni = e.unidad_id ? unidadMap[e.unidad_id] : null
    const prop = uni?.propietario_id ? propMap[uni.propietario_id] : null
    const base = (e.identificador || uni?.identificador || 'unidad')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    try {
      await generarExpensaPDF(
        {
          consorcioNombre: consorcio.nombre,
          direccion: consorcio.direccion,
          mesLabel: mesLabel(ym),
          fecha: new Intl.DateTimeFormat('es-AR').format(new Date()),
          unidad: e.identificador || uni?.identificador || '—',
          propietario: prop?.nombre ?? null,
          gastos: gastos.map((g) => ({ concepto: g.concepto, categoria: g.categoria, monto: g.monto })),
          totalGastos: liquidacion.total_gastos,
          fondoReserva: liquidacion.monto_fondo_reserva_del_mes,
          base: liquidacion.base_a_repartir,
          porcentaje: Number(e.porcentaje_aplicado) || 0,
          montoAPagar: Number(e.monto_a_pagar) || 0
        },
        `expensa-${base}-${ym}.pdf`
      )
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 mt-6">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <ReceiptText size={16} className="text-ink-3" /> Liquidación de expensas
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value || currentYM())}
            className="input"
          />
          {!liquidacion && (
            <button
              onClick={abrirGenerar}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Calculator size={15} /> Generar liquidación del mes
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-ink-3 text-sm">Cargando…</div>
      ) : !liquidacion ? (
        <div className="card p-8 text-center text-ink-3 text-sm">
          No hay liquidación generada para {mesLabel(ym)}.
          <div className="text-xs mt-1">
            Gastos cargados este mes: <span className="text-ink-2">{formatARS(totalGastosMes)}</span>.
            Usá “Generar liquidación del mes”.
          </div>
        </div>
      ) : (
        <>
          {/* Resumen de la liquidación */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
            <div className="card p-4">
              <p className="text-xs text-ink-3 uppercase tracking-wider">Gastos</p>
              <p className="num text-2xl font-bold text-ink mt-1">
                {formatARS(liquidacion.total_gastos)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-ink-3 uppercase tracking-wider">Fondo de reserva</p>
              <p className="num text-2xl font-bold text-info mt-1">
                {formatARS(liquidacion.monto_fondo_reserva_del_mes)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-ink-3 uppercase tracking-wider">Base repartida</p>
              <p className="num text-2xl font-bold text-ink mt-1">
                {formatARS(liquidacion.base_a_repartir)}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-ink-3 uppercase tracking-wider">Cobrado / pendiente</p>
              <p className="num text-lg font-bold text-ok mt-1">{formatARS(resumen.cobrado)}</p>
              <p className="num text-xs text-warn">{formatARS(resumen.pendiente)} pendiente</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
                  <th className="px-4 py-3 font-medium">Unidad</th>
                  <th className="px-4 py-3 font-medium">Propietario</th>
                  <th className="px-4 py-3 font-medium text-right">%</th>
                  <th className="px-4 py-3 font-medium text-right">A pagar</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium text-right">Resumen</th>
                </tr>
              </thead>
              <tbody>
                {expensas.map((e) => {
                  const uni = e.unidad_id ? unidadMap[e.unidad_id] : null
                  const prop = uni?.propietario_id ? propMap[uni.propietario_id] : null
                  return (
                    <tr key={e.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-white font-medium">
                        {e.identificador || uni?.identificador || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-ink-2">
                        <span className="inline-flex items-center gap-1.5">
                          {prop?.nombre ?? '—'}
                          {prop?.telefono && (
                            <TelefonoWhatsApp
                              numero={prop.telefono}
                              iconOnly
                              size={14}
                              mensaje={
                                e.estado !== 'pagado' && prop?.nombre
                                  ? msgPago(prop.nombre, mesISO, consorcio.nombre)
                                  : undefined
                              }
                            />
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right num text-ink-3">
                        {Number(e.porcentaje_aplicado) || 0}%
                      </td>
                      <td className="px-4 py-2.5 text-right num text-ink">
                        {formatARS(e.monto_a_pagar)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          {ESTADOS.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => setEstado(e, s.id)}
                              className={`px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                                e.estado === s.id ? s.cls : 'text-ink-3 hover:text-ink-2'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end">
                          <button
                            onClick={() => descargarPDF(e)}
                            className="inline-flex items-center gap-1 text-xs text-info hover:text-info/80"
                            title="Descargar resumen PDF para el propietario"
                          >
                            <FileDown size={14} /> PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-2">
            {(() => {
              const chip = <EstadoChip tone="muted">{expensas.length} unidades</EstadoChip>
              return chip
            })()}
            <button
              onClick={() => setDelOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-ink-3 hover:text-bad"
            >
              <Trash2 size={13} /> Eliminar liquidación (para regenerar)
            </button>
          </div>
        </>
      )}

      {/* Modal generar */}
      <Modal
        open={genOpen}
        title={`Generar liquidación · ${mesLabel(ym)}`}
        onClose={() => setGenOpen(false)}
        footer={
          <>
            <button
              onClick={() => setGenOpen(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button onClick={generar} disabled={generando} className="btn-primary text-sm flex items-center gap-2">
              {generando ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
              Generar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-ink-2">
            Se reparte entre las <span className="text-ink">{unidades.length} unidades</span> según su
            % fiscal.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3">
              <p className="text-xs text-ink-3 uppercase tracking-wider">Gastos del mes</p>
              <p className="num text-xl font-bold text-ink mt-1">{formatARS(totalGastosMes)}</p>
            </div>
            <Field label="Fondo de reserva del mes">
              <TextInput
                type="number"
                min={0}
                value={fondo}
                onChange={(e) => setFondo(Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="card p-3 bg-accent/5 border-accent/25">
            <p className="text-xs text-ink-3 uppercase tracking-wider">Base a repartir</p>
            <p className="num text-2xl font-bold text-accent mt-1">
              {formatARS(totalGastosMes + (Number(fondo) || 0))}
            </p>
          </div>
          {Math.round(totalPct * 1000) / 1000 !== 100 && (
            <p className="text-xs text-warn">
              Atención: los % fiscales de las unidades suman {Math.round(totalPct * 1000) / 1000}% (no
              100%). Revisá las unidades para que la liquidación cierre exacta.
            </p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={delOpen}
        title="Eliminar liquidación"
        confirmLabel="Sí, eliminar"
        message={`¿Eliminar la liquidación de ${mesLabel(ym)}? Se borran las expensas por unidad y el aporte al fondo de reserva de ese mes. Podés volver a generarla.`}
        onConfirm={eliminarLiquidacion}
        onClose={() => setDelOpen(false)}
        loading={deleting}
      />
    </>
  )
}
