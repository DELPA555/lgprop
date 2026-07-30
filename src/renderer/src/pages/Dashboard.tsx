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
  ArrowRight
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import PageHeader from '@/components/PageHeader'
import EstadoChip, { ChipTone } from '@/components/ui/EstadoChip'
import { formatARS, formatUSD, formatMoneda, formatDate } from '@/lib/format'
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

interface Metrics {
  vencimientos: number
  actualizaciones: number
  pagosAtrasados: number
  propiedadesTotal: number
  contratosActivos: number
  cobradoMes: number
  porCobrarMes: number
  comisionMes: number
  comisionAnio: number
  comisionMesUSD: number
  comisionAnioUSD: number
  pagosMes: PagoRow[]
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
      const count = async (build: () => any): Promise<number> => {
        try {
          const { count } = await build()
          return count ?? 0
        } catch {
          return 0
        }
      }
      const monthStartISO = `${todayISO().slice(0, 7)}-01`
      const yearStart = `${new Date().getFullYear()}-01-01`

      const [
        vencimientos,
        actualizaciones,
        pagosAtrasados,
        propiedadesTotal,
        contratosActivos
      ] = await Promise.all([
        count(() =>
          supabase
            .from('contratos')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'activo')
            .gte('fecha_fin', todayISO())
            .lte('fecha_fin', addDaysISO(60))
        ),
        count(() =>
          supabase
            .from('contratos')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'activo')
            .not('proxima_actualizacion', 'is', null)
            .gte('proxima_actualizacion', todayISO())
            .lte('proxima_actualizacion', addDaysISO(30))
        ),
        count(() =>
          supabase.from('pagos').select('*', { count: 'exact', head: true }).eq('estado', 'atrasado')
        ),
        count(() => supabase.from('propiedades').select('*', { count: 'exact', head: true })),
        count(() =>
          supabase
            .from('contratos')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'activo')
        )
      ])

      // ── Datos base para etiquetas y moneda ──
      const [{ data: ctrs }, { data: props }, { data: inqs }] = await Promise.all([
        supabase.from('contratos').select('id, moneda, propiedad_id, inquilino_id'),
        supabase.from('propiedades').select('id, direccion'),
        supabase.from('inquilinos').select('id, nombre')
      ])
      const monedaMap: Record<string, Moneda> = {}
      const propDeContrato: Record<string, string> = {}
      const inqDeContrato: Record<string, string> = {}
      for (const c of ctrs ?? []) {
        monedaMap[c.id] = c.moneda
        propDeContrato[c.id] = c.propiedad_id
        inqDeContrato[c.id] = c.inquilino_id
      }
      const dirMap: Record<string, string> = {}
      for (const p of props ?? []) dirMap[p.id] = p.direccion
      const nomMap: Record<string, string> = {}
      for (const i of inqs ?? []) nomMap[i.id] = i.nombre
      const etiquetaDe = (contratoId: string): string => {
        const dir = dirMap[propDeContrato[contratoId]] ?? 'Propiedad'
        const nom = nomMap[inqDeContrato[contratoId]] ?? ''
        return nom ? `${dir} · ${nom}` : dir
      }

      // ── Pagos del mes en curso (para tabla + cobrado/por cobrar) ──
      let cobradoMes = 0
      let porCobrarMes = 0
      let pagosMes: PagoRow[] = []
      try {
        const { data: pagos } = await supabase
          .from('pagos')
          .select('id, contrato_id, monto, monto_ars, monto_neto, estado, fecha_pago')
          .eq('mes_correspondiente', monthStartISO)
        for (const p of pagos ?? []) {
          const pesos = p.monto_ars ?? p.monto
          if (p.estado === 'pagado') cobradoMes += pesos
          else porCobrarMes += pesos
        }
        const orden: Record<EstadoPago, number> = { atrasado: 0, pendiente: 1, pagado: 2 }
        pagosMes = (pagos ?? [])
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

      // ── Comisiones cobradas (ARS / USD) ──
      let comisionMes = 0
      let comisionAnio = 0
      let comisionMesUSD = 0
      let comisionAnioUSD = 0
      try {
        const { data: comPagos } = await supabase
          .from('pagos')
          .select('monto_comision, mes_correspondiente, contrato_id')
          .eq('estado', 'pagado')
          .gte('mes_correspondiente', yearStart)
        for (const p of comPagos ?? []) {
          const esUSD = monedaMap[p.contrato_id] === 'USD'
          const v = p.monto_comision ?? 0
          const delMes = p.mes_correspondiente === monthStartISO
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

      if (!alive) return
      setMetrics({
        vencimientos,
        actualizaciones,
        pagosAtrasados,
        propiedadesTotal,
        contratosActivos,
        cobradoMes,
        porCobrarMes,
        comisionMes,
        comisionAnio,
        comisionMesUSD,
        comisionAnioUSD,
        pagosMes
      })
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

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

  const tiles = [
    { label: 'Propiedades', value: metrics?.propiedadesTotal ?? 0, Icon: Building2, hint: 'En cartera' },
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
      <PageHeader title="Dashboard" subtitle="Resumen operativo de la administración" />

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
            <p className="text-[11px] text-ink-3 mt-5">
              Comisión retenida de los pagos cobrados · USD a la cotización del día
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
