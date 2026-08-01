import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  AlertTriangle,
  Calculator,
  DatabaseZap,
  Home,
  Building2,
  FileText,
  Wallet,
  ArrowRight,
  CalendarDays
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import PageHeader from '@/components/PageHeader'
import EstadoChip, { ChipTone } from '@/components/ui/EstadoChip'
import { formatARS, formatUSD, formatMoneda, formatDate } from '@/lib/format'
import { useAuth } from '@/context/AuthContext'
import type { Moneda, EstadoPago } from '@/types/database'

interface PagoRow {
  id: string
  contrato_id: string
  monto: number
  monto_ars: number | null
  monto_neto: number
  estado: EstadoPago
  fecha_pago: string | null
  moneda: Moneda
  etiqueta: string
}

interface AgendaItem {
  id: string
  kind: 'evento' | 'visita'
  titulo: string
  fecha_hora: string
  tipo?: string
  extra?: string
}

const EVENTO_TIPO_LABEL: Record<string, string> = {
  tasacion: 'Tasación',
  posible_ingreso: 'Posible ingreso',
  reunion: 'Reunión',
  visita: 'Visita',
  otro: 'Otro'
}
const fmtAgendaFecha = (iso: string): string => {
  const hoy = new Date().toISOString().slice(0, 10)
  const man = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const dia = iso.slice(0, 10)
  const prefijo = dia === hoy ? 'Hoy' : dia === man ? 'Mañana' : ''
  const h = new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires'
  })
  return prefijo ? `${prefijo} ${h}` : `${new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })} ${h}`
}

interface Metrics {
  vencimientos: number
  actualizaciones: number
  pagosAtrasados: number
  propiedadesTotal: number
  propiedadesAdmin: number
  contratosActivos: number
  cobradoMes: number
  porCobrarMes: number
  comisionMes: number
  comisionAnio: number
  comisionMesUSD: number
  comisionAnioUSD: number
  // Rentabilidad neta (solo admin): comisión ARS-equivalente − gastos propios
  rentabilidadMes: number
  rentabilidadAnio: number
  gastosPropiosAnio: number
  pagosMes: PagoRow[]
  agenda: AgendaItem[]
}

function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
const todayISO = (): string => new Date().toISOString().slice(0, 10)

const ESTADO_CHIP: Record<EstadoPago, { tone: ChipTone; label: string }> = {
  pagado: { tone: 'ok', label: 'Pagado' },
  pendiente: { tone: 'warn', label: 'Pendiente' },
  atrasado: { tone: 'bad', label: 'Atrasado' }
}

export default function Dashboard(): JSX.Element {
  const { isAdmin } = useAuth()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let alive = true
    ;(async () => {
      setLoading(true)
      const monthStartISO = `${todayISO().slice(0, 7)}-01`
      const yearStart = `${new Date().getFullYear()}-01-01`
      const hoy = todayISO()
      const en60 = addDaysISO(60)
      const en30 = addDaysISO(30)

      // ── Datos base: propiedades (con administrada), contratos, inquilinos ──
      const [{ data: props }, { data: ctrs }, { data: inqs }] = await Promise.all([
        supabase.from('propiedades').select('id, direccion, administrada'),
        supabase
          .from('contratos')
          .select('id, estado, fecha_fin, proxima_actualizacion, moneda, propiedad_id, inquilino_id'),
        supabase.from('inquilinos').select('id, nombre')
      ])

      const adminSet = new Set<string>()
      const dirMap: Record<string, string> = {}
      let propiedadesTotal = 0
      let propiedadesAdmin = 0
      for (const p of props ?? []) {
        propiedadesTotal++
        dirMap[p.id] = p.direccion
        if (p.administrada) {
          adminSet.add(p.id)
          propiedadesAdmin++
        }
      }

      const monedaMap: Record<string, Moneda> = {}
      const propDeContrato: Record<string, string> = {}
      const inqDeContrato: Record<string, string> = {}
      for (const c of ctrs ?? []) {
        monedaMap[c.id] = c.moneda
        propDeContrato[c.id] = c.propiedad_id
        inqDeContrato[c.id] = c.inquilino_id
      }
      // ¿El contrato pertenece a una propiedad administrada?
      const esAdmin = (contratoId: string): boolean => adminSet.has(propDeContrato[contratoId] ?? '')

      const nomMap: Record<string, string> = {}
      for (const i of inqs ?? []) nomMap[i.id] = i.nombre
      const etiquetaDe = (contratoId: string): string => {
        const dir = dirMap[propDeContrato[contratoId]] ?? 'Propiedad'
        const nom = nomMap[inqDeContrato[contratoId]] ?? ''
        return nom ? `${dir} · ${nom}` : dir
      }

      // ── Alertas / KPIs de contratos (solo administradas) ──
      let vencimientos = 0
      let actualizaciones = 0
      let contratosActivos = 0
      for (const c of ctrs ?? []) {
        if (!adminSet.has(c.propiedad_id)) continue
        if (c.estado !== 'activo') continue
        contratosActivos++
        if (c.fecha_fin && c.fecha_fin >= hoy && c.fecha_fin <= en60) vencimientos++
        if (
          c.proxima_actualizacion &&
          c.proxima_actualizacion >= hoy &&
          c.proxima_actualizacion <= en30
        )
          actualizaciones++
      }

      // ── Pagos atrasados (todos los meses, solo administradas) ──
      let pagosAtrasados = 0
      try {
        const { data: atr } = await supabase
          .from('pagos')
          .select('contrato_id')
          .eq('estado', 'atrasado')
        for (const p of atr ?? []) if (esAdmin(p.contrato_id)) pagosAtrasados++
      } catch {
        // sin datos
      }

      // ── Pagos del mes en curso (tabla + cobrado/por cobrar), solo administradas ──
      let cobradoMes = 0
      let porCobrarMes = 0
      let pagosMes: PagoRow[] = []
      try {
        const { data: pagos } = await supabase
          .from('pagos')
          .select('id, contrato_id, monto, monto_ars, monto_neto, estado, fecha_pago')
          .eq('mes_correspondiente', monthStartISO)
        const pagosAdmin = (pagos ?? []).filter((p) => esAdmin(p.contrato_id))
        for (const p of pagosAdmin) {
          const pesos = p.monto_ars ?? p.monto
          if (p.estado === 'pagado') cobradoMes += pesos
          else porCobrarMes += pesos
        }
        const orden: Record<EstadoPago, number> = { atrasado: 0, pendiente: 1, pagado: 2 }
        pagosMes = pagosAdmin
          .map((p) => ({
            ...p,
            moneda: monedaMap[p.contrato_id] ?? 'ARS',
            etiqueta: etiquetaDe(p.contrato_id)
          }))
          .sort((a, b) => orden[a.estado] - orden[b.estado] || a.etiqueta.localeCompare(b.etiqueta))
          .slice(0, 6)
      } catch {
        // sin datos
      }

      // ── Comisiones cobradas (ARS / USD), solo administradas ──
      let comisionMes = 0
      let comisionAnio = 0
      let comisionMesUSD = 0
      let comisionAnioUSD = 0
      // Comisión ARS-equivalente (USD convertido) para la rentabilidad
      let comAnioArs = 0
      let comMesArs = 0
      try {
        const { data: comPagos } = await supabase
          .from('pagos')
          .select('monto_comision, cotizacion_usada, mes_correspondiente, contrato_id')
          .eq('estado', 'pagado')
          .gte('mes_correspondiente', yearStart)
        for (const p of comPagos ?? []) {
          if (!esAdmin(p.contrato_id)) continue
          const esUSD = monedaMap[p.contrato_id] === 'USD'
          const v = p.monto_comision ?? 0
          const delMes = p.mes_correspondiente === monthStartISO
          const vArs = p.cotizacion_usada ? v * p.cotizacion_usada : v
          comAnioArs += vArs
          if (delMes) comMesArs += vArs
          if (esUSD) {
            comisionAnioUSD += v
            if (delMes) comisionMesUSD += v
          } else {
            comisionAnio += v
            if (delMes) comisionMes += v
          }
        }
      } catch {
        // sin datos
      }

      // Gastos propios de LG Prop (solo admin; RLS bloquea al resto) → rentabilidad
      let gastosPropiosAnio = 0
      let gastosPropiosMes = 0
      if (isAdmin) {
        try {
          const { data: gp } = await supabase
            .from('gastos_lgprop')
            .select('monto, mes_correspondiente')
            .gte('mes_correspondiente', yearStart)
          for (const g of gp ?? []) {
            const v = Number(g.monto) || 0
            gastosPropiosAnio += v
            if (g.mes_correspondiente === monthStartISO) gastosPropiosMes += v
          }
        } catch {
          // sin acceso / sin datos
        }
      }

      // ── Agenda de hoy / mañana (eventos + visitas) ──
      let agenda: AgendaItem[] = []
      try {
        const desde = `${hoy}T00:00:00.000Z`
        const hasta = `${addDaysISO(1)}T23:59:59.999Z`
        const [{ data: evs }, { data: vis }] = await Promise.all([
          supabase
            .from('eventos_agenda')
            .select('id, titulo, tipo, fecha_hora, propiedad_id, contacto_nombre')
            .eq('estado', 'pendiente')
            .gte('fecha_hora', desde)
            .lte('fecha_hora', hasta),
          supabase
            .from('visitas')
            .select('id, fecha, visitante, propiedad_id')
            .eq('estado', 'programada')
            .gte('fecha', desde)
            .lte('fecha', hasta)
        ])
        const evItems: AgendaItem[] = (evs ?? []).map((e) => ({
          id: `ev-${e.id}`,
          kind: 'evento',
          titulo: e.titulo,
          fecha_hora: e.fecha_hora,
          tipo: e.tipo,
          extra: e.propiedad_id ? dirMap[e.propiedad_id] : (e.contacto_nombre ?? undefined)
        }))
        const viItems: AgendaItem[] = (vis ?? []).map((v) => ({
          id: `vi-${v.id}`,
          kind: 'visita',
          titulo: v.propiedad_id ? (dirMap[v.propiedad_id] ?? 'Visita') : (v.visitante ?? 'Visita'),
          fecha_hora: v.fecha
        }))
        agenda = [...evItems, ...viItems]
          .sort((a, b) => new Date(a.fecha_hora).getTime() - new Date(b.fecha_hora).getTime())
          .slice(0, 6)
      } catch {
        // sin datos
      }

      if (!alive) return
      setMetrics({
        vencimientos,
        actualizaciones,
        pagosAtrasados,
        propiedadesTotal,
        propiedadesAdmin,
        contratosActivos,
        cobradoMes,
        porCobrarMes,
        comisionMes,
        comisionAnio,
        comisionMesUSD,
        comisionAnioUSD,
        rentabilidadMes: comMesArs - gastosPropiosMes,
        rentabilidadAnio: comAnioArs - gastosPropiosAnio,
        gastosPropiosAnio,
        pagosMes,
        agenda
      })
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [isAdmin])

  const alerts = useMemo(() => {
    const m = metrics
    return [
      {
        key: 'venc',
        to: '/contratos',
        Icon: CalendarClock,
        n: m?.vencimientos ?? 0,
        label: 'Contratos vencen en 60 días',
        tone: 'warn' as ChipTone
      },
      {
        key: 'atras',
        to: '/pagos',
        Icon: AlertTriangle,
        n: m?.pagosAtrasados ?? 0,
        label: 'Pagos atrasados',
        tone: 'bad' as ChipTone
      },
      {
        key: 'actu',
        to: '/actualizaciones',
        Icon: Calculator,
        n: m?.actualizaciones ?? 0,
        label: 'Actualizaciones por aplicar',
        tone: 'info' as ChipTone
      }
    ]
  }, [metrics])

  const toneText: Record<ChipTone, string> = {
    ok: 'text-ok',
    warn: 'text-warn',
    bad: 'text-bad',
    info: 'text-info',
    muted: 'text-ink-2'
  }
  const toneBg: Record<ChipTone, string> = {
    ok: 'bg-ok/10 border-ok/25',
    warn: 'bg-warn/10 border-warn/25',
    bad: 'bg-bad/10 border-bad/25',
    info: 'bg-info/10 border-info/25',
    muted: 'bg-white/[0.03] border-border'
  }

  const dash = (v: string | number): string => (loading ? '—' : String(v))

  const noAdmin = (metrics?.propiedadesTotal ?? 0) - (metrics?.propiedadesAdmin ?? 0)
  const tiles = [
    {
      label: 'Propiedades administradas',
      value: metrics?.propiedadesAdmin ?? 0,
      Icon: Building2,
      hint: noAdmin > 0 ? `${metrics?.propiedadesTotal ?? 0} cargadas en total` : 'En cartera'
    },
    { label: 'Contratos activos', value: metrics?.contratosActivos ?? 0, Icon: FileText, hint: 'Vigentes' },
    {
      label: 'Cobrado este mes',
      value: formatARS(metrics?.cobradoMes ?? 0),
      Icon: Wallet,
      hint: 'Alquileres al día',
      accent: 'text-ok'
    },
    {
      label: 'Por cobrar este mes',
      value: formatARS(metrics?.porCobrarMes ?? 0),
      Icon: Wallet,
      hint: 'Pendiente + atrasado',
      accent: 'text-warn'
    }
  ]

  return (
    <div className="p-6">
      <PageHeader
        title="Dashboard"
        subtitle={
          noAdmin > 0
            ? `Resumen de la cartera administrada · ${noAdmin} propiedad(es) no administrada(s) excluida(s)`
            : 'Resumen operativo de la administración'
        }
      />

      {!isSupabaseConfigured && (
        <div className={`card p-4 mb-5 flex items-start gap-3 ${toneBg.warn}`}>
          <DatabaseZap className="text-warn shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm text-warn font-medium">Supabase no configurado</p>
            <p className="text-xs text-ink-2 mt-0.5">
              Copiá <code className="text-ink">.env.example</code> a{' '}
              <code className="text-ink">.env</code> y completá{' '}
              <code className="text-ink">VITE_SUPABASE_URL</code> y{' '}
              <code className="text-ink">VITE_SUPABASE_ANON_KEY</code>. Después reiniciá{' '}
              <code className="text-ink">npm run dev</code>.
            </p>
          </div>
        </div>
      )}

      {/* ── Franja de alertas ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {alerts.map(({ key, to, Icon, n, label, tone }) => {
          const activo = n > 0
          const t: ChipTone = activo ? tone : 'muted'
          return (
            <Link
              key={key}
              to={to}
              className={`card p-4 flex items-center gap-4 border ${toneBg[t]} hover:brightness-110 transition`}
            >
              <div className={`shrink-0 ${toneText[t]}`}>
                <Icon size={22} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className={`num text-2xl font-bold leading-none ${toneText[t]}`}>{dash(n)}</div>
                <div className="text-xs text-ink-2 mt-1 leading-tight">{label}</div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* ── Hero de comisión + tiles ──────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        {/* Hero */}
        <div className="xl:col-span-2 relative overflow-hidden card p-6 bg-gradient-to-br from-accent-dim/25 via-card to-card border-accent/25">
          <Home
            size={190}
            strokeWidth={1}
            className="absolute -right-6 -bottom-10 text-accent/[0.07] pointer-events-none"
          />
          <div className="relative">
            <div className="flex items-center gap-2 text-accent">
              <span className="text-xs font-semibold uppercase tracking-[0.14em]">
                Comisiones cobradas
              </span>
            </div>
            <div className="grid grid-cols-2 gap-6 mt-5">
              <div>
                <div className="text-xs text-ink-2 uppercase tracking-wider">Este mes</div>
                <div className="num text-3xl font-bold text-ink mt-1.5">
                  {dash(formatARS(metrics?.comisionMes ?? 0))}
                </div>
                {(metrics?.comisionMesUSD ?? 0) > 0 && (
                  <div className="num text-sm font-semibold text-info mt-0.5">
                    + {formatUSD(metrics?.comisionMesUSD ?? 0)}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-ink-2 uppercase tracking-wider">Este año</div>
                <div className="num text-3xl font-bold text-ink mt-1.5">
                  {dash(formatARS(metrics?.comisionAnio ?? 0))}
                </div>
                {(metrics?.comisionAnioUSD ?? 0) > 0 && (
                  <div className="num text-sm font-semibold text-info mt-0.5">
                    + {formatUSD(metrics?.comisionAnioUSD ?? 0)}
                  </div>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="mt-4 pt-4 border-t border-border/70 flex items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] text-ink-2 uppercase tracking-wider">
                    Rentabilidad neta · año
                  </div>
                  <div
                    className={`num text-2xl font-bold mt-0.5 ${
                      (metrics?.rentabilidadAnio ?? 0) >= 0 ? 'text-accent' : 'text-bad'
                    }`}
                  >
                    {dash(formatARS(metrics?.rentabilidadAnio ?? 0))}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-ink-3">este mes</div>
                  <div
                    className={`num text-sm font-semibold ${
                      (metrics?.rentabilidadMes ?? 0) >= 0 ? 'text-ink-2' : 'text-bad'
                    }`}
                  >
                    {dash(formatARS(metrics?.rentabilidadMes ?? 0))}
                  </div>
                </div>
              </div>
            )}
            <p className="text-[11px] text-ink-3 mt-4">
              Comisión retenida de los pagos cobrados · USD a la cotización del día
              {isAdmin ? ' · rentabilidad = comisión − gastos propios (Contabilidad)' : ''}
            </p>
          </div>
        </div>

        {/* Tiles 2x2 */}
        <div className="grid grid-cols-2 gap-4">
          {tiles.map((t) => (
            <div key={t.label} className="card p-4 flex flex-col">
              <div className="flex items-center justify-between">
                <t.Icon className="text-ink-3" size={16} />
              </div>
              <div className={`num text-2xl font-bold mt-2 ${t.accent ?? 'text-ink'}`}>
                {dash(t.value)}
              </div>
              <div className="text-[11px] text-ink-2 mt-1 leading-tight">{t.label}</div>
              <div className="text-[10px] text-ink-3 mt-0.5">{t.hint}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Agenda de hoy / mañana ────────────────────────────────────── */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <CalendarDays size={15} className="text-ink-3" /> Agenda de hoy y mañana
          </h2>
          <Link
            to="/agenda"
            className="text-xs text-accent hover:text-accent-soft flex items-center gap-1"
          >
            Ver agenda <ArrowRight size={13} />
          </Link>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-center text-ink-3 text-sm">Cargando…</p>
        ) : (metrics?.agenda.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-center text-ink-3 text-sm">
            No hay eventos ni visitas para hoy o mañana.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {metrics?.agenda.map((it) => (
              <li key={it.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="text-[11px] text-ink-2 num w-24 shrink-0">
                  {fmtAgendaFecha(it.fecha_hora)}
                </span>
                <span className="text-sm text-ink truncate flex-1">{it.titulo}</span>
                {it.extra && (
                  <span className="text-[11px] text-ink-3 hidden sm:block truncate max-w-[40%]">
                    {it.extra}
                  </span>
                )}
                <EstadoChip tone={it.kind === 'visita' ? 'muted' : 'info'}>
                  {it.kind === 'visita' ? 'Visita' : EVENTO_TIPO_LABEL[it.tipo ?? 'otro'] ?? 'Evento'}
                </EstadoChip>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Pagos del mes ─────────────────────────────────────────────── */}
      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-ink">Pagos del mes</h2>
          <Link
            to="/pagos"
            className="text-xs text-accent hover:text-accent-soft flex items-center gap-1"
          >
            Ver todos <ArrowRight size={13} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
                <th className="px-4 py-2.5 font-medium">Contrato</th>
                <th className="px-4 py-2.5 font-medium text-right">Monto</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">Fecha pago</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-3">
                    Cargando…
                  </td>
                </tr>
              ) : (metrics?.pagosMes.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-ink-3">
                    No hay cuotas cargadas para este mes.
                  </td>
                </tr>
              ) : (
                metrics?.pagosMes.map((p) => {
                  const est = ESTADO_CHIP[p.estado]
                  return (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5 text-ink">{p.etiqueta}</td>
                      <td className="px-4 py-2.5 text-right num text-ink-2">
                        {formatMoneda(p.monto, p.moneda)}
                        {p.moneda === 'USD' && (
                          <div className="text-[10px] text-ink-3">≈ {formatARS(p.monto_ars ?? 0)}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <EstadoChip tone={est.tone}>{est.label}</EstadoChip>
                      </td>
                      <td className="px-4 py-2.5 text-ink-3 text-xs">
                        {p.fecha_pago ? formatDate(p.fecha_pago) : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
