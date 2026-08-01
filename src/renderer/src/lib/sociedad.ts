// Cálculo puro del balance entre socios de LG Prop (sin dependencias de red).
//
// Modelo (confirmado con el usuario):
//  - Ingresos del período a repartir = comisiones de administración cobradas
//    + honorarios por operación cobrados. Se muestran como dos fuentes distintas.
//  - Cada socio tiene derecho a su % sobre el total de ingresos.
//  - Cada socio pagó de su bolsillo algunos gastos del negocio.
//  - "Balance" de cada socio = (su % · ingresos) − lo que gastó.
//  - Como los ingresos se reparten por el mismo %, la deuda entre socios la
//    genera la ASIMETRÍA de gastos: quien pagó más de lo que le tocaba
//    proporcionalmente cobra la diferencia del otro para emparejar.
//    transferX = (su % · utilidad neta) − balanceX = gastoX − (su % · gastos)
//    transferX > 0 ⇒ le deben (acreedor);  < 0 ⇒ debe (deudor).

export interface SocioCalcInput {
  id: string
  nombre: string
  pct: number // participación en % (ej. 50)
  gasto: number // gastos del negocio que pagó en el período
}

export interface SocioCalcRow {
  id: string
  nombre: string
  pct: number
  corresponde: number // % · ingresos
  gasto: number
  balance: number // corresponde − gasto
  justo: number // % · utilidad neta
  transfer: number // justo − balance (>0 le deben, <0 debe)
}

export interface BalanceSocios {
  comision: number
  honorarios: number
  ingresos: number
  gastos: number
  neto: number
  socios: SocioCalcRow[]
  deudorId: string | null
  acreedorId: string | null
  monto: number // monto a transferir del deudor al acreedor
}

const r2 = (n: number): number => Math.round(n * 100) / 100

export function calcularBalanceSocios(
  comision: number,
  honorarios: number,
  socios: SocioCalcInput[]
): BalanceSocios {
  const ingresos = comision + honorarios
  const gastos = socios.reduce((s, x) => s + (x.gasto || 0), 0)
  const neto = ingresos - gastos
  const pctTotal = socios.reduce((s, x) => s + (x.pct || 0), 0) || 100

  const rows: SocioCalcRow[] = socios.map((x) => {
    const frac = (x.pct || 0) / pctTotal // normaliza por si no suman exactamente 100
    const corresponde = frac * ingresos
    const justo = frac * neto
    const balance = corresponde - (x.gasto || 0)
    const transfer = justo - balance // = gasto − frac·gastos
    return {
      id: x.id,
      nombre: x.nombre,
      pct: x.pct,
      corresponde: r2(corresponde),
      gasto: r2(x.gasto || 0),
      balance: r2(balance),
      justo: r2(justo),
      transfer: r2(transfer)
    }
  })

  // Settle entre 2 socios: acreedor = transfer>0 (le deben); deudor = transfer<0 (debe)
  const acreedor = rows.find((r) => r.transfer > 0.005) ?? null
  const deudor = rows.find((r) => r.transfer < -0.005) ?? null

  return {
    comision: r2(comision),
    honorarios: r2(honorarios),
    ingresos: r2(ingresos),
    gastos: r2(gastos),
    neto: r2(neto),
    socios: rows,
    deudorId: deudor?.id ?? null,
    acreedorId: acreedor?.id ?? null,
    monto: acreedor ? r2(acreedor.transfer) : 0
  }
}

export const CATEGORIAS_GASTO_SOCIEDAD: { value: string; label: string }[] = [
  { value: 'alquiler_oficina', label: 'Alquiler oficina' },
  { value: 'sueldos', label: 'Sueldos' },
  { value: 'herramientas', label: 'Herramientas' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'otro', label: 'Otro' }
]
export const categoriaGastoLabel = (v: string): string =>
  CATEGORIAS_GASTO_SOCIEDAD.find((c) => c.value === v)?.label ?? v
