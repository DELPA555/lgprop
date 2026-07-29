import { useEffect, useMemo, useState } from 'react'
import { FileDown, Loader2, Building2, Check, Clock } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { Contrato, Propiedad, Dueno, Liquidacion, EstadoLiquidacion } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import { useToast } from '@/components/ui/Toast'
import { formatARS, formatDate } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { generarLiquidacionPDF, type LiquidacionLinea } from '@/lib/liquidacionPdf'
import ExportarContableButton from '@/components/ExportarContableButton'

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
const periodoLabel = (ym: string): string => {
  const [y, m] = ym.split('-')
  return `${MESES[Number(m) - 1] ?? m} ${y}`
}

type Prop = { direccion: string; bruto: number; comision: number; neto: number }
type Grupo = {
  duenoId: string | null
  duenoNombre: string
  alias: string | null
  cbu: string | null
  bruto: number
  comision: number
  neto: number
  props: Map<string, Prop>
}

export default function Liquidaciones(): JSX.Element {
  const toast = useToast()
  const [ym, setYm] = useState(currentYM())
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [propiedades, setPropiedades] = useState<Propiedad[]>([])
  const [duenos, setDuenos] = useState<Dueno[]>([])
  const [pagos, setPagos] = useState<
    { contrato_id: string; monto: number; monto_comision: number; monto_neto: number }[]
  >([])
  const [liqs, setLiqs] = useState<Liquidacion[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const periodo = `${ym}-01`

  const loadBase = async (): Promise<void> => {
    if (!isSupabaseConfigured) return
    const [c, p, d] = await Promise.all([
      supabase.from('contratos').select('*'),
      supabase.from('propiedades').select('*'),
      supabase.from('duenos').select('*')
    ])
    setContratos(c.data ?? [])
    setPropiedades(p.data ?? [])
    setDuenos(d.data ?? [])
  }

  const loadMes = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [pg, lq] = await Promise.all([
      supabase
        .from('pagos')
        .select('contrato_id, monto, monto_comision, monto_neto')
        .eq('mes_correspondiente', periodo)
        .eq('estado', 'pagado'),
      supabase.from('liquidaciones').select('*').eq('periodo', periodo)
    ])
    setPagos(pg.data ?? [])
    setLiqs(lq.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void loadBase()
  }, [])
  useEffect(() => {
    void loadMes()
  }, [periodo])

  const contratoMap = useMemo(() => {
    const m: Record<string, Contrato> = {}
    for (const c of contratos) m[c.id] = c
    return m
  }, [contratos])
  const propMap = useMemo(() => {
    const m: Record<string, Propiedad> = {}
    for (const p of propiedades) m[p.id] = p
    return m
  }, [propiedades])
  const duenoMap = useMemo(() => {
    const m: Record<string, Dueno> = {}
    for (const d of duenos) m[d.id] = d
    return m
  }, [duenos])
  const liqMap = useMemo(() => {
    const m: Record<string, Liquidacion> = {}
    for (const l of liqs) m[l.dueno_id] = l
    return m
  }, [liqs])

  // Agrupar los pagos cobrados del mes por dueño (y por propiedad dentro del dueño)
  const grupos = useMemo(() => {
    const g = new Map<string, Grupo>()
    for (const p of pagos) {
      const c = contratoMap[p.contrato_id]
      if (!c) continue
      const prop = propMap[c.propiedad_id]
      const duenoId = prop?.dueno_id ?? c.dueno_id ?? null
      const dueno = duenoId ? duenoMap[duenoId] : undefined
      const key = duenoId ?? 'none'
      let grp = g.get(key)
      if (!grp) {
        grp = {
          duenoId,
          duenoNombre: dueno?.nombre ?? '(Sin dueño asignado)',
          alias: dueno?.alias_cbu ?? null,
          cbu: dueno?.cbu ?? null,
          bruto: 0,
          comision: 0,
          neto: 0,
          props: new Map()
        }
        g.set(key, grp)
      }
      grp.bruto += p.monto
      grp.comision += p.monto_comision
      grp.neto += p.monto_neto
      const dir = prop?.direccion ?? 'Propiedad'
      const pk = c.propiedad_id
      const pr = grp.props.get(pk) ?? { direccion: dir, bruto: 0, comision: 0, neto: 0 }
      pr.bruto += p.monto
      pr.comision += p.monto_comision
      pr.neto += p.monto_neto
      grp.props.set(pk, pr)
    }
    return Array.from(g.values()).sort((a, b) => a.duenoNombre.localeCompare(b.duenoNombre))
  }, [pagos, contratoMap, propMap, duenoMap])

  const totales = useMemo(() => {
    return grupos.reduce(
      (s, g) => ({
        bruto: s.bruto + g.bruto,
        comision: s.comision + g.comision,
        neto: s.neto + g.neto
      }),
      { bruto: 0, comision: 0, neto: 0 }
    )
  }, [grupos])

  const generar = async (g: Grupo): Promise<void> => {
    if (!g.duenoId) return void toast.error('Ese grupo no tiene dueño asignado')
    setBusy(g.duenoId)
    try {
      // 1) Registrar/actualizar la liquidación (mantiene el estado si ya existía)
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase.from('liquidaciones').upsert(
        {
          dueno_id: g.duenoId,
          periodo,
          monto_bruto: Math.round(g.bruto * 100) / 100,
          monto_comision: Math.round(g.comision * 100) / 100,
          monto_neto: Math.round(g.neto * 100) / 100,
          cant_propiedades: g.props.size,
          generada_por: userData?.user?.id ?? null
        },
        { onConflict: 'dueno_id,periodo' }
      )
      if (error) return void toast.error(error.message)

      // 2) Generar el PDF
      const lineas: LiquidacionLinea[] = Array.from(g.props.values()).map((p) => ({
        direccion: p.direccion,
        bruto: p.bruto,
        comision: p.comision,
        neto: p.neto
      }))
      await generarLiquidacionPDF(
        {
          duenoNombre: g.duenoNombre,
          periodoLabel: periodoLabel(ym),
          fecha: formatDate(todayISO()),
          alias: g.alias,
          cbu: g.cbu,
          lineas,
          totalBruto: g.bruto,
          totalComision: g.comision,
          totalNeto: g.neto
        },
        `liquidacion-${g.duenoNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${ym}.pdf`
      )
      toast.success('Liquidación generada')
      await loadMes()
    } finally {
      setBusy(null)
    }
  }

  const setEstado = async (l: Liquidacion, estado: EstadoLiquidacion): Promise<void> => {
    setLiqs((prev) =>
      prev.map((x) =>
        x.id === l.id
          ? { ...x, estado, enviada_at: estado === 'enviada' ? todayISO() : null }
          : x
      )
    )
    const { error } = await supabase
      .from('liquidaciones')
      .update({ estado, enviada_at: estado === 'enviada' ? new Date().toISOString() : null })
      .eq('id', l.id)
    if (error) {
      toast.error(error.message)
      void loadMes()
    }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Liquidaciones"
        subtitle="Comisión retenida y neto a transferir por dueño"
        actions={<ExportarContableButton defaultYM={ym} />}
      />

      {!isSupabaseConfigured && <ConfigNotice />}

      {/* Resumen del mes */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <div className="card p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Bruto cobrado</p>
          <p className="text-2xl font-bold text-white mt-1 tabular-nums">
            {formatARS(totales.bruto)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Comisión retenida</p>
          <p className="text-2xl font-bold text-amber-400 mt-1 tabular-nums">
            {formatARS(totales.comision)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Neto a transferir</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
            {formatARS(totales.neto)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Dueños</p>
          <p className="text-2xl font-bold text-white mt-1 tabular-nums">{grupos.length}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="month"
          value={ym}
          onChange={(e) => setYm(e.target.value || currentYM())}
          className="input"
        />
        <p className="text-xs text-zinc-500">
          Se liquidan los pagos con estado <span className="text-emerald-400">cobrado</span> del
          período.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Dueño</th>
              <th className="px-4 py-3 font-medium text-center">Propiedades</th>
              <th className="px-4 py-3 font-medium text-right">Bruto</th>
              <th className="px-4 py-3 font-medium text-right">Comisión</th>
              <th className="px-4 py-3 font-medium text-right">Neto</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-600">
                  Cargando…
                </td>
              </tr>
            ) : grupos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-600">
                  No hay pagos cobrados en este período. Registrá pagos como “pagado” para
                  liquidar.
                </td>
              </tr>
            ) : (
              grupos.map((g) => {
                const liq = g.duenoId ? liqMap[g.duenoId] : undefined
                const enviada = liq?.estado === 'enviada'
                return (
                  <tr key={g.duenoId ?? 'none'} className="border-b border-border/60 hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-white font-medium">{g.duenoNombre}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 text-zinc-300">
                        <Building2 size={13} className="text-zinc-500" />
                        {g.props.size}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-200 tabular-nums">
                      {formatARS(g.bruto)}
                    </td>
                    <td className="px-4 py-3 text-right text-amber-400 tabular-nums">
                      {formatARS(g.comision)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-medium tabular-nums">
                      {formatARS(g.neto)}
                    </td>
                    <td className="px-4 py-3">
                      {!liq ? (
                        <span className="text-[11px] text-zinc-600">sin generar</span>
                      ) : (
                        <button
                          onClick={() => setEstado(liq, enviada ? 'pendiente' : 'enviada')}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                            enviada
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}
                          title="Cambiar estado"
                        >
                          {enviada ? <Check size={12} /> : <Clock size={12} />}
                          {enviada ? 'Enviada' : 'Pendiente'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <button
                          onClick={() => generar(g)}
                          disabled={!g.duenoId || busy === g.duenoId}
                          className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {busy === g.duenoId ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <FileDown size={13} />
                          )}
                          {liq ? 'Regenerar PDF' : 'Generar liquidación'}
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
    </div>
  )
}
