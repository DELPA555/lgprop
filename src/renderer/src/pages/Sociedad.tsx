import { useEffect, useMemo, useState } from 'react'
import {
  Handshake,
  Plus,
  Trash2,
  Wallet,
  FileText,
  Lock,
  AlertTriangle,
  ArrowRight,
  CheckCircle2
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type {
  Socio,
  GastoSociedad,
  HonorarioOperacion,
  LiquidacionSocios,
  CategoriaGastoSociedad
} from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import EstadoChip from '@/components/ui/EstadoChip'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/context/AuthContext'
import { formatARS, formatMoneda, formatDate } from '@/lib/format'
import {
  calcularBalanceSocios,
  CATEGORIAS_GASTO_SOCIEDAD,
  categoriaGastoLabel,
  type BalanceSocios,
  type SocioCalcRow
} from '@/lib/sociedad'

const pad = (n: number): string => String(n).padStart(2, '0')
const currentYM = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}
const monthStart = (ym: string): string => `${ym}-01`
const monthEnd = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${pad(new Date(y, m, 0).getDate())}`
}
const periodoLabel = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number)
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

type HonorarioRow = HonorarioOperacion & {
  contratos?: { propiedades?: { direccion?: string } | null; inquilinos?: { nombre?: string } | null } | null
}
type GastoForm = Partial<GastoSociedad>

export default function Sociedad(): JSX.Element {
  const toast = useToast()
  const { member, socio } = useAuth()
  const [ym, setYm] = useState(currentYM())
  const [socios, setSocios] = useState<Socio[]>([])
  const [gastos, setGastos] = useState<GastoSociedad[]>([])
  const [comisionTotal, setComisionTotal] = useState(0)
  const [honorarios, setHonorarios] = useState<HonorarioRow[]>([])
  const [cotizacion, setCotizacion] = useState(1)
  const [liquidacion, setLiquidacion] = useState<LiquidacionSocios | null>(null)
  const [historial, setHistorial] = useState<LiquidacionSocios[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [gastoModal, setGastoModal] = useState(false)
  const [gastoForm, setGastoForm] = useState<GastoForm>({})
  const [savingGasto, setSavingGasto] = useState(false)
  const [delGasto, setDelGasto] = useState<GastoSociedad | null>(null)
  const [cerrarConfirm, setCerrarConfirm] = useState(false)

  const periodo = monthStart(ym)
  const socioMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of socios) m[s.id] = s.nombre
    return m
  }, [socios])

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [
      { data: soc },
      { data: gas },
      { data: pagos },
      { data: hon },
      { data: cot },
      { data: liq },
      { data: hist },
      { data: usrs }
    ] = await Promise.all([
      supabase.from('socios').select('*').order('created_at'),
      supabase
        .from('gastos_sociedad')
        .select('*')
        .gte('fecha', monthStart(ym))
        .lte('fecha', monthEnd(ym))
        .order('fecha', { ascending: false }),
      supabase
        .from('pagos')
        .select('monto_comision, cotizacion_usada')
        .eq('mes_correspondiente', periodo)
        .eq('estado', 'pagado'),
      supabase
        .from('honorarios_operacion')
        .select('*, contratos(propiedades(direccion), inquilinos(nombre))')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('cotizaciones_dolar')
        .select('tipo, venta, fecha')
        .order('fecha', { ascending: false })
        .limit(10),
      supabase.from('liquidaciones_socios').select('*').eq('periodo', periodo).maybeSingle(),
      supabase
        .from('liquidaciones_socios')
        .select('*')
        .order('periodo', { ascending: false })
        .limit(24),
      supabase.from('usuarios_equipo').select('id, nombre')
    ])

    setSocios(soc ?? [])
    setGastos(gas ?? [])
    // Comisiones cobradas del período, en pesos (USD → ARS con la cotización usada en el pago)
    let com = 0
    for (const p of pagos ?? [])
      com += p.cotizacion_usada ? p.monto_comision * p.cotizacion_usada : p.monto_comision
    setComisionTotal(com)
    setHonorarios((hon as HonorarioRow[]) ?? [])
    // Cotización de referencia (blue) para convertir honorarios en USD
    const blue = (cot ?? []).find((c) => c.tipo === 'blue') ?? (cot ?? [])[0]
    setCotizacion(blue?.venta ?? 1)
    setLiquidacion(liq ?? null)
    setHistorial(hist ?? [])
    const um: Record<string, string> = {}
    for (const u of usrs ?? []) um[u.id] = u.nombre
    setUsuarios(um)
    setLoading(false)
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ym])

  const honorariosCobradosARS = useMemo(() => {
    const s = monthStart(ym)
    const e = monthEnd(ym)
    let total = 0
    for (const h of honorarios) {
      if (h.estado !== 'cobrado' || !h.fecha_cobro) continue
      if (h.fecha_cobro < s || h.fecha_cobro > e) continue
      total += h.moneda === 'USD' ? h.monto * cotizacion : h.monto
    }
    return total
  }, [honorarios, ym, cotizacion])

  const gastoPorSocio = useMemo(() => {
    const m: Record<string, number> = {}
    for (const g of gastos) m[g.socio_id] = (m[g.socio_id] ?? 0) + g.monto
    return m
  }, [gastos])

  // Balance en vivo del período
  const balLive = useMemo<BalanceSocios>(() => {
    const activos = socios.filter((s) => s.activo)
    return calcularBalanceSocios(
      comisionTotal,
      honorariosCobradosARS,
      activos.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        pct: s.porcentaje_participacion,
        gasto: gastoPorSocio[s.id] ?? 0
      }))
    )
  }, [socios, comisionTotal, honorariosCobradosARS, gastoPorSocio])

  // Si el período ya está persistido, se muestra el snapshot guardado (congelado)
  const view = useMemo<BalanceSocios>(() => {
    if (!liquidacion) return balLive
    return {
      comision: liquidacion.comision_total,
      honorarios: liquidacion.honorarios_total,
      ingresos: liquidacion.ingresos_total,
      gastos: liquidacion.gastos_total,
      neto: liquidacion.ingresos_total - liquidacion.gastos_total,
      socios: (liquidacion.detalle_json as unknown as SocioCalcRow[]) ?? [],
      deudorId: liquidacion.deudor_socio_id,
      acreedorId: liquidacion.acreedor_socio_id,
      monto: liquidacion.monto_deuda
    }
  }, [liquidacion, balLive])

  const estadoPago = liquidacion?.estado_pago ?? 'pendiente'
  const cerrado = liquidacion?.periodo_cerrado ?? false
  const hayDeuda = view.monto > 0
  const deudaAbierta = cerrado && hayDeuda && estadoPago !== 'pagado'

  const buildSnapshot = (): Partial<LiquidacionSocios> => ({
    periodo,
    comision_total: balLive.comision,
    honorarios_total: balLive.honorarios,
    ingresos_total: balLive.ingresos,
    gastos_total: balLive.gastos,
    detalle_json: balLive.socios as unknown as Record<string, unknown>,
    deudor_socio_id: balLive.deudorId,
    acreedor_socio_id: balLive.acreedorId,
    monto_deuda: balLive.monto
  })

  const persist = async (
    fields: Partial<LiquidacionSocios>,
    { refreshSnapshot = false } = {}
  ): Promise<void> => {
    setBusy(true)
    const includeSnap = !liquidacion || !liquidacion.periodo_cerrado || refreshSnapshot
    const base = includeSnap ? buildSnapshot() : {}
    const { error } = liquidacion
      ? await supabase
          .from('liquidaciones_socios')
          .update({ ...base, ...fields })
          .eq('id', liquidacion.id)
      : await supabase.from('liquidaciones_socios').insert({ ...buildSnapshot(), ...fields })
    setBusy(false)
    if (error) return void toast.error(error.message)
    await load()
  }

  const marcarPago = async (pagado: boolean): Promise<void> => {
    await persist({
      estado_pago: pagado ? 'pagado' : 'pendiente',
      pago_confirmado_por: pagado ? member?.id ?? null : null,
      pago_confirmado_at: pagado ? new Date().toISOString() : null
    })
    toast.success(pagado ? 'Balance marcado como pagado' : 'Balance marcado como pendiente')
  }

  const cerrarPeriodo = async (): Promise<void> => {
    setCerrarConfirm(false)
    await persist({
      periodo_cerrado: true,
      cerrado_por: member?.id ?? null,
      cerrado_at: new Date().toISOString()
    })
    toast.success('Período cerrado')
  }
  const reabrirPeriodo = async (): Promise<void> => {
    await persist({ periodo_cerrado: false, cerrado_por: null, cerrado_at: null }, { refreshSnapshot: true })
    toast.success('Período reabierto')
  }

  // ── Gastos ──
  const openNuevoGasto = (): void => {
    setGastoForm({
      socio_id: socio?.id ?? socios[0]?.id,
      fecha: new Date().toISOString().slice(0, 10),
      categoria: 'otro'
    })
    setGastoModal(true)
  }
  const guardarGasto = async (): Promise<void> => {
    if (!gastoForm.socio_id) return toast.error('Elegí el socio que pagó')
    if (!gastoForm.concepto?.trim()) return toast.error('Poné un concepto')
    const monto = Number(gastoForm.monto)
    if (!Number.isFinite(monto) || monto <= 0) return toast.error('El monto debe ser mayor a cero')
    setSavingGasto(true)
    const { error } = await supabase.from('gastos_sociedad').insert({
      socio_id: gastoForm.socio_id,
      concepto: gastoForm.concepto.trim(),
      monto,
      fecha: gastoForm.fecha || new Date().toISOString().slice(0, 10),
      categoria: (gastoForm.categoria ?? 'otro') as CategoriaGastoSociedad,
      notas: gastoForm.notas?.trim() || null
    })
    setSavingGasto(false)
    if (error) return void toast.error(error.message)
    toast.success('Gasto cargado')
    setGastoModal(false)
    void load()
  }
  const eliminarGasto = async (): Promise<void> => {
    if (!delGasto) return
    const { error } = await supabase.from('gastos_sociedad').delete().eq('id', delGasto.id)
    if (error) return void toast.error(error.message)
    toast.success('Gasto eliminado')
    setDelGasto(null)
    void load()
  }

  // ── Honorarios ──
  const toggleHonorario = async (h: HonorarioRow): Promise<void> => {
    const cobrado = h.estado !== 'cobrado'
    const { error } = await supabase
      .from('honorarios_operacion')
      .update({
        estado: cobrado ? 'cobrado' : 'pendiente',
        fecha_cobro: cobrado ? new Date().toISOString().slice(0, 10) : null
      })
      .eq('id', h.id)
    if (error) return void toast.error(error.message)
    void load()
  }

  const honLabel = (h: HonorarioRow): string => {
    const dir = h.contratos?.propiedades?.direccion
    const inq = h.contratos?.inquilinos?.nombre
    return dir ? (inq ? `${dir} · ${inq}` : dir) : 'Contrato'
  }
  const pendientes = honorarios.filter((h) => h.estado === 'pendiente')
  const cobradosPeriodo = honorarios.filter(
    (h) =>
      h.estado === 'cobrado' &&
      h.fecha_cobro &&
      h.fecha_cobro >= monthStart(ym) &&
      h.fecha_cobro <= monthEnd(ym)
  )

  const deudor = view.deudorId ? socioMap[view.deudorId] : null
  const acreedor = view.acreedorId ? socioMap[view.acreedorId] : null

  if (!isSupabaseConfigured) {
    return (
      <div className="p-6">
        <ConfigNotice />
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Sociedad"
        subtitle="Reparto de ingresos y gastos entre los socios del negocio"
        actions={
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value || currentYM())}
            className="input"
          />
        }
      />

      {socios.filter((s) => s.activo).length < 2 && (
        <div className="card p-4 mb-4 flex items-start gap-3 border border-warn/25 bg-warn/5">
          <AlertTriangle size={18} className="text-warn shrink-0 mt-0.5" />
          <p className="text-sm text-ink-2">
            Cargá al menos dos socios activos (en <span className="text-ink">Equipo → Socios</span>)
            para calcular el balance.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Resumen del período */}
        <div className="xl:col-span-2 card p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            Resumen de {periodoLabel(ym)}
            {liquidacion && (
              <span className="text-[11px] text-ink-3 font-normal ml-2">· snapshot guardado</span>
            )}
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-2">Comisión de administración cobrada</span>
              <span className="num text-ink">{formatARS(view.comision)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Honorarios por operaciones nuevas cobrados</span>
              <span className="num text-ink">{formatARS(view.honorarios)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span className="text-ink">Total ingresos del período</span>
              <span className="num text-accent">{formatARS(view.ingresos)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-2">Gastos del negocio (total)</span>
              <span className="num text-bad">− {formatARS(view.gastos)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2">
              <span className="text-ink-2">Utilidad neta</span>
              <span className="num text-ink">{formatARS(view.neto)}</span>
            </div>
          </div>

          {/* Reparto por socio */}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-ink-3 uppercase tracking-wider border-b border-border">
                  <th className="py-2 font-medium">Socio</th>
                  <th className="py-2 font-medium text-right">%</th>
                  <th className="py-2 font-medium text-right">Le corresponde</th>
                  <th className="py-2 font-medium text-right">Gastó</th>
                  <th className="py-2 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {view.socios.map((s) => (
                  <tr key={s.id} className="border-b border-border/50">
                    <td className="py-2 text-ink">{s.nombre}</td>
                    <td className="py-2 text-right text-ink-2 num">{s.pct}%</td>
                    <td className="py-2 text-right num text-ink-2">{formatARS(s.corresponde)}</td>
                    <td className="py-2 text-right num text-ink-2">{formatARS(s.gasto)}</td>
                    <td
                      className={`py-2 text-right num font-medium ${
                        s.balance >= 0 ? 'text-ink' : 'text-bad'
                      }`}
                    >
                      {formatARS(s.balance)}
                    </td>
                  </tr>
                ))}
                {view.socios.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-ink-3">
                      Sin socios para calcular.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Balance final */}
        <div className="card p-5 flex flex-col">
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Handshake size={16} className="text-accent" /> Balance entre socios
          </h2>

          {hayDeuda && deudor && acreedor ? (
            <>
              <div className="rounded-lg border border-border p-4 text-center">
                <p className="text-[11px] text-ink-3 uppercase tracking-wider">A saldar</p>
                <p className="num text-2xl font-bold text-ink mt-1">{formatARS(view.monto)}</p>
                <p className="text-sm text-ink-2 mt-2">
                  <span className="text-bad font-medium">{deudor}</span> le debe a{' '}
                  <span className="text-ok font-medium">{acreedor}</span>
                </p>
                <div className="mt-3">
                  <EstadoChip tone={estadoPago === 'pagado' ? 'ok' : 'warn'}>
                    {estadoPago === 'pagado' ? 'Pagado' : 'Pendiente'}
                  </EstadoChip>
                </div>
                {estadoPago === 'pagado' && liquidacion?.pago_confirmado_at && (
                  <p className="text-[11px] text-ink-3 mt-2">
                    {deudor} le pagó a {acreedor} ·{' '}
                    {formatDate(liquidacion.pago_confirmado_at)}
                    {liquidacion.pago_confirmado_por &&
                      ` · confirmó ${usuarios[liquidacion.pago_confirmado_por] ?? '—'}`}
                  </p>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {estadoPago === 'pagado' ? (
                  <button
                    onClick={() => marcarPago(false)}
                    disabled={busy}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-border text-ink-2 hover:text-ink"
                  >
                    Marcar como pendiente
                  </button>
                ) : (
                  <button
                    onClick={() => marcarPago(true)}
                    disabled={busy}
                    className="w-full btn-primary text-sm flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={15} /> {deudor} le pagó a {acreedor}
                  </button>
                )}

                {!cerrado ? (
                  <button
                    onClick={() =>
                      estadoPago === 'pagado' ? cerrarPeriodo() : setCerrarConfirm(true)
                    }
                    disabled={busy}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-border text-ink-2 hover:text-ink flex items-center justify-center gap-2"
                  >
                    <Lock size={14} /> Cerrar período
                  </button>
                ) : (
                  <button
                    onClick={reabrirPeriodo}
                    disabled={busy}
                    className="w-full text-sm px-3 py-2 rounded-lg border border-border text-ink-3 hover:text-ink"
                  >
                    Reabrir período
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-border p-4 text-center flex-1 flex flex-col items-center justify-center">
              <CheckCircle2 size={24} className="text-ok mb-2" />
              <p className="text-sm text-ink-2">
                {view.ingresos === 0 && view.gastos === 0
                  ? 'Sin movimientos en el período.'
                  : 'Los socios están a mano este período.'}
              </p>
              {!cerrado && (view.ingresos > 0 || view.gastos > 0) && (
                <button
                  onClick={() => cerrarPeriodo()}
                  disabled={busy}
                  className="mt-3 text-sm px-3 py-2 rounded-lg border border-border text-ink-2 hover:text-ink flex items-center gap-2"
                >
                  <Lock size={14} /> Cerrar período
                </button>
              )}
              {cerrado && <p className="text-[11px] text-ink-3 mt-2">Período cerrado.</p>}
            </div>
          )}

          {deudaAbierta && (
            <div className="mt-3 rounded-lg border border-warn/30 bg-warn/5 p-3 flex items-start gap-2">
              <AlertTriangle size={15} className="text-warn shrink-0 mt-0.5" />
              <p className="text-[12px] text-warn">
                Período cerrado con una <b>deuda pendiente</b> de {formatARS(view.monto)} ({deudor} →{' '}
                {acreedor}). No la pierdas de vista.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Gastos del período */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Wallet size={15} className="text-ink-3" /> Gastos del negocio · {periodoLabel(ym)}
          </h2>
          <button
            onClick={openNuevoGasto}
            className="btn-primary text-sm flex items-center gap-2"
            disabled={socios.length === 0}
          >
            <Plus size={15} /> Nuevo gasto
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Socio</th>
                <th className="px-4 py-2.5 font-medium">Concepto</th>
                <th className="px-4 py-2.5 font-medium">Categoría</th>
                <th className="px-4 py-2.5 font-medium text-right">Monto</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-3">
                    Cargando…
                  </td>
                </tr>
              ) : gastos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ink-3">
                    Sin gastos cargados en este período.
                  </td>
                </tr>
              ) : (
                gastos.map((g) => (
                  <tr key={g.id} className="border-b border-border/60">
                    <td className="px-4 py-2.5 text-ink-3 text-xs whitespace-nowrap">
                      {formatDate(g.fecha)}
                    </td>
                    <td className="px-4 py-2.5 text-ink">{socioMap[g.socio_id] ?? '—'}</td>
                    <td className="px-4 py-2.5 text-ink-2">{g.concepto}</td>
                    <td className="px-4 py-2.5 text-ink-3">{categoriaGastoLabel(g.categoria)}</td>
                    <td className="px-4 py-2.5 text-right num text-ink">{formatARS(g.monto)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setDelGasto(g)}
                        disabled={cerrado}
                        className="p-1.5 rounded-md text-ink-3 hover:text-bad hover:bg-white/5 disabled:opacity-30"
                        title={cerrado ? 'Período cerrado' : 'Eliminar'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Honorarios por operación */}
      <div className="card mt-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <FileText size={15} className="text-ink-3" /> Honorarios por operación
          </h2>
          <p className="text-[11px] text-ink-3 mt-0.5">
            1 mes de alquiler al concretar cada contrato nuevo. Marcá cuándo se cobró efectivamente.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
                <th className="px-4 py-2.5 font-medium">Contrato</th>
                <th className="px-4 py-2.5 font-medium text-right">Honorario</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">Cobrado</th>
                <th className="px-4 py-2.5 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.length === 0 && cobradosPeriodo.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                    Sin honorarios pendientes ni cobrados en este período.
                  </td>
                </tr>
              ) : (
                [...pendientes, ...cobradosPeriodo].map((h) => (
                  <tr key={h.id} className="border-b border-border/60">
                    <td className="px-4 py-2.5 text-ink">{honLabel(h)}</td>
                    <td className="px-4 py-2.5 text-right num text-ink-2">
                      {formatMoneda(h.monto, h.moneda)}
                    </td>
                    <td className="px-4 py-2.5">
                      <EstadoChip tone={h.estado === 'cobrado' ? 'ok' : 'warn'}>
                        {h.estado === 'cobrado' ? 'Cobrado' : 'Pendiente'}
                      </EstadoChip>
                    </td>
                    <td className="px-4 py-2.5 text-ink-3 text-xs">
                      {h.fecha_cobro ? formatDate(h.fecha_cobro) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => toggleHonorario(h)}
                        className="text-xs px-2.5 py-1 rounded-md border border-border text-ink-2 hover:text-ink"
                      >
                        {h.estado === 'cobrado' ? 'Marcar pendiente' : 'Marcar cobrado'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial de períodos */}
      <div className="card mt-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-ink">Historial de períodos liquidados</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
                <th className="px-4 py-2.5 font-medium">Período</th>
                <th className="px-4 py-2.5 font-medium">Deuda</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium text-center">Cerrado</th>
                <th className="px-4 py-2.5 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {historial.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-3">
                    Todavía no cerraste ningún período.
                  </td>
                </tr>
              ) : (
                historial.map((l) => {
                  const abierta = l.periodo_cerrado && l.monto_deuda > 0 && l.estado_pago !== 'pagado'
                  return (
                    <tr key={l.id} className="border-b border-border/60">
                      <td className="px-4 py-2.5 text-ink">
                        {periodoLabel(l.periodo.slice(0, 7))}
                      </td>
                      <td className="px-4 py-2.5 text-ink-2 num">
                        {l.monto_deuda > 0 ? (
                          <>
                            {formatARS(l.monto_deuda)}{' '}
                            <span className="text-[11px] text-ink-3">
                              ({l.deudor_socio_id ? socioMap[l.deudor_socio_id] ?? '—' : '—'}
                              <ArrowRight size={10} className="inline mx-0.5" />
                              {l.acreedor_socio_id ? socioMap[l.acreedor_socio_id] ?? '—' : '—'})
                            </span>
                          </>
                        ) : (
                          'A mano'
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {l.monto_deuda > 0 && (
                          <EstadoChip tone={l.estado_pago === 'pagado' ? 'ok' : 'warn'}>
                            {l.estado_pago === 'pagado' ? 'Pagado' : 'Pendiente'}
                          </EstadoChip>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {l.periodo_cerrado ? (
                          <span className="text-ink-2">Sí</span>
                        ) : (
                          <span className="text-ink-3">No</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {abierta && (
                          <span className="text-[11px] text-warn flex items-center gap-1 justify-end">
                            <AlertTriangle size={12} /> deuda abierta
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal nuevo gasto */}
      <Modal
        open={gastoModal}
        title="Nuevo gasto del negocio"
        onClose={() => setGastoModal(false)}
        footer={
          <>
            <button
              onClick={() => setGastoModal(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button onClick={guardarGasto} disabled={savingGasto} className="btn-primary text-sm">
              {savingGasto ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Socio que lo pagó" required>
            <Select
              value={gastoForm.socio_id ?? ''}
              onChange={(e) => setGastoForm((f) => ({ ...f, socio_id: e.target.value }))}
            >
              <option value="">— Elegir —</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                  {socio?.id === s.id ? ' (vos)' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Concepto" required>
            <TextInput
              autoFocus
              value={gastoForm.concepto ?? ''}
              onChange={(e) => setGastoForm((f) => ({ ...f, concepto: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto" required>
              <TextInput
                type="number"
                min={0}
                value={gastoForm.monto ?? ''}
                onChange={(e) => setGastoForm((f) => ({ ...f, monto: Number(e.target.value) }))}
              />
            </Field>
            <Field label="Fecha" required>
              <TextInput
                type="date"
                value={gastoForm.fecha ?? ''}
                onChange={(e) => setGastoForm((f) => ({ ...f, fecha: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Categoría">
            <Select
              value={gastoForm.categoria ?? 'otro'}
              onChange={(e) =>
                setGastoForm((f) => ({ ...f, categoria: e.target.value as CategoriaGastoSociedad }))
              }
            >
              {CATEGORIAS_GASTO_SOCIEDAD.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notas">
            <TextArea
              value={gastoForm.notas ?? ''}
              onChange={(e) => setGastoForm((f) => ({ ...f, notas: e.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!delGasto}
        message={`¿Eliminar el gasto "${delGasto?.concepto}" de ${formatARS(delGasto?.monto ?? 0)}?`}
        onConfirm={eliminarGasto}
        onClose={() => setDelGasto(null)}
      />

      <ConfirmDialog
        open={cerrarConfirm}
        title="Cerrar período con deuda"
        confirmLabel="Cerrar igual"
        message={`Vas a cerrar ${periodoLabel(ym)} con una deuda pendiente de ${formatARS(view.monto)} (${deudor} → ${acreedor}). Va a quedar marcada como deuda abierta. ¿Cerrar igual?`}
        onConfirm={cerrarPeriodo}
        onClose={() => setCerrarConfirm(false)}
      />
    </div>
  )
}
