import { useEffect, useState } from 'react'
import {
  CalendarClock,
  TrendingUp,
  AlertTriangle,
  Receipt,
  DatabaseZap,
  HandCoins
} from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import PageHeader from '@/components/PageHeader'
import { formatARS, formatUSD } from '@/lib/format'

interface Metrics {
  vencimientos: number
  actualizaciones: number
  pagosAtrasados: number
  expensasPendientes: number
  comisionMes: number
  comisionAnio: number
  comisionMesUSD: number
  comisionAnioUSD: number
}

function addDaysISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
const todayISO = (): string => new Date().toISOString().slice(0, 10)

const KPI_DEFS = [
  {
    key: 'vencimientos' as const,
    label: 'Vencen en 60 días',
    hint: 'Contratos por finalizar',
    Icon: CalendarClock,
    color: 'text-amber-400'
  },
  {
    key: 'actualizaciones' as const,
    label: 'Actualizaciones pendientes',
    hint: 'Ajustes de monto por aplicar',
    Icon: TrendingUp,
    color: 'text-blue-400'
  },
  {
    key: 'pagosAtrasados' as const,
    label: 'Pagos atrasados',
    hint: 'Alquileres en mora',
    Icon: AlertTriangle,
    color: 'text-red-400'
  },
  {
    key: 'expensasPendientes' as const,
    label: 'Expensas pendientes',
    hint: 'Sin conciliar',
    Icon: Receipt,
    color: 'text-purple-400'
  }
]

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
      const [vencimientos, actualizaciones, pagosAtrasados, expensasPendientes] = await Promise.all([
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
          supabase
            .from('pagos')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'atrasado')
        ),
        count(() =>
          supabase
            .from('pagos')
            .select('*', { count: 'exact', head: true })
            .eq('expensas_pagadas', false)
        )
      ])
      // Comisiones cobradas (suma de monto_comision de pagos cobrados)
      const yearStart = `${new Date().getFullYear()}-01-01`
      const monthStartISO = `${todayISO().slice(0, 7)}-01`
      let comisionMes = 0
      let comisionAnio = 0
      let comisionMesUSD = 0
      let comisionAnioUSD = 0
      try {
        // Moneda por contrato para separar comisiones ARS / USD
        const { data: ctrs } = await supabase.from('contratos').select('id, moneda')
        const monedaMap: Record<string, string> = {}
        for (const c of ctrs ?? []) monedaMap[c.id] = c.moneda
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
        expensasPendientes,
        comisionMes,
        comisionAnio,
        comisionMesUSD,
        comisionAnioUSD
      })
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="p-6">
      <PageHeader
        title="Dashboard"
        subtitle="Resumen operativo de la administración"
      />

      {!isSupabaseConfigured && (
        <div className="card p-4 mb-5 flex items-start gap-3 border-amber-500/30">
          <DatabaseZap className="text-amber-400 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="text-sm text-amber-300 font-medium">Supabase no configurado</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Copiá <code className="text-zinc-300">.env.example</code> a{' '}
              <code className="text-zinc-300">.env</code> y completá{' '}
              <code className="text-zinc-300">VITE_SUPABASE_URL</code> y{' '}
              <code className="text-zinc-300">VITE_SUPABASE_ANON_KEY</code>. Después reiniciá{' '}
              <code className="text-zinc-300">npm run dev</code>.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {KPI_DEFS.map(({ key, label, hint, Icon, color }) => (
          <div key={key} className="card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
              <Icon className={color} size={18} />
            </div>
            <div className="text-3xl font-bold text-white mt-3 tabular-nums">
              {loading ? '—' : (metrics?.[key] ?? 0)}
            </div>
            <div className="text-[11px] text-zinc-600 mt-1">{hint}</div>
          </div>
        ))}
      </div>

      {/* Comisiones cobradas */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">
              Comisiones cobradas · este mes
            </span>
            <HandCoins className="text-emerald-400" size={18} />
          </div>
          <div className="text-3xl font-bold text-white mt-3 tabular-nums">
            {loading ? '—' : formatARS(metrics?.comisionMes ?? 0)}
          </div>
          {(metrics?.comisionMesUSD ?? 0) > 0 && (
            <div className="text-sm font-semibold text-sky-400 tabular-nums">
              + {formatUSD(metrics?.comisionMesUSD ?? 0)}
            </div>
          )}
          <div className="text-[11px] text-zinc-600 mt-1">Comisión retenida de pagos cobrados</div>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">
              Comisiones cobradas · este año
            </span>
            <HandCoins className="text-emerald-400" size={18} />
          </div>
          <div className="text-3xl font-bold text-white mt-3 tabular-nums">
            {loading ? '—' : formatARS(metrics?.comisionAnio ?? 0)}
          </div>
          {(metrics?.comisionAnioUSD ?? 0) > 0 && (
            <div className="text-sm font-semibold text-sky-400 tabular-nums">
              + {formatUSD(metrics?.comisionAnioUSD ?? 0)}
            </div>
          )}
          <div className="text-[11px] text-zinc-600 mt-1">Acumulado del año en curso</div>
        </div>
      </div>
    </div>
  )
}
