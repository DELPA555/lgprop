// Conversión de números a letras en español (es-AR) para importes de recibos.
// Devuelve el cardinal con apócope masculino ("un", "veintiún") porque siempre
// antecede a un sustantivo masculino (pesos/dólares) o a "mil"/"millón".

const UNIDADES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve']
const DIEZ_A_QUINCE = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince']
const DIECI = ['dieciséis', 'diecisiete', 'dieciocho', 'diecinueve']
const VEINTI = [
  'veinte',
  'veintiún',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve'
]
const DECENAS = [
  '',
  '',
  'veinte',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa'
]
const CENTENAS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos'
]

// 1..99
function decenas(n: number): string {
  if (n < 10) return UNIDADES[n]
  if (n <= 15) return DIEZ_A_QUINCE[n - 10]
  if (n < 20) return DIECI[n - 16]
  if (n < 30) return VEINTI[n - 20]
  const d = Math.floor(n / 10)
  const u = n % 10
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} y ${UNIDADES[u]}`
}

// 0..999
function centenas(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const cabeza = c ? CENTENAS[c] : ''
  const cola = resto ? decenas(resto) : ''
  return [cabeza, cola].filter(Boolean).join(' ')
}

// Entero >= 0 a cardinal (apócope masculino).
export function numeroALetras(n: number): string {
  const entero = Math.floor(Math.abs(n))
  if (entero === 0) return 'cero'
  const millones = Math.floor(entero / 1_000_000)
  const miles = Math.floor((entero % 1_000_000) / 1000)
  const resto = entero % 1000
  const partes: string[] = []
  if (millones) partes.push(millones === 1 ? 'un millón' : `${numeroALetras(millones)} millones`)
  if (miles) partes.push(miles === 1 ? 'mil' : `${numeroALetras(miles)} mil`)
  if (resto) partes.push(centenas(resto))
  return partes.join(' ')
}

// Símbolo de moneda para los importes en números.
export function simboloMoneda(moneda: 'ARS' | 'USD'): string {
  return moneda === 'USD' ? 'US$' : '$'
}

// Importe en números agrupado con puntos de miles, sin decimales si son 0.
export function importeNumero(monto: number, moneda: 'ARS' | 'USD'): string {
  const abs = Math.abs(monto)
  const entero = Math.floor(abs)
  const centavos = Math.round((abs - entero) * 100)
  const grouped = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const dec = centavos ? `,${String(centavos).padStart(2, '0')}` : ''
  return `${simboloMoneda(moneda)}${grouped}${dec}`
}

// Importe en letras en mayúsculas: "PESOS OCHOCIENTOS MIL" / "DÓLARES ... CON 50/100".
export function importeEnLetras(monto: number, moneda: 'ARS' | 'USD'): string {
  const abs = Math.abs(monto)
  const entero = Math.floor(abs)
  const centavos = Math.round((abs - entero) * 100)
  const palabra = moneda === 'USD' ? 'dólares' : 'pesos'
  let s = `${palabra} ${numeroALetras(entero)}`
  if (centavos > 0) s += ` con ${centavos}/100`
  return s.toUpperCase()
}
