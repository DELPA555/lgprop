export function formatARS(v: number | null | undefined): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(v ?? 0)
}

export function formatUSD(v: number | null | undefined): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(v ?? 0)
}

// Formatea según la moneda del contrato (ARS o USD)
export function formatMoneda(v: number | null | undefined, moneda: 'ARS' | 'USD'): string {
  return moneda === 'USD' ? formatUSD(v) : formatARS(v)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const [y, m, d] = iso.slice(0, 10).split('-')
    return `${d}/${m}/${y}`
  } catch {
    return iso
  }
}
