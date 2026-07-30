// Muestra un número de teléfono con un ícono de WhatsApp al lado. Al hacer
// click abre wa.me/<número>?text=<mensaje> en WhatsApp (Web o escritorio),
// sin necesidad de ninguna API paga ni cuenta Business.
//
// Uso general (ficha, sin mensaje):
//   <TelefonoWhatsApp numero={inquilino.telefono} />
// Con contexto (mensaje predefinido, editable por el usuario en WhatsApp):
//   <TelefonoWhatsApp numero={tel} mensaje={msgPago(nombre, mes, direccion)} />
// Solo el ícono (cuando el número ya se muestra en otra columna o no aplica):
//   <TelefonoWhatsApp numero={tel} mensaje={...} iconOnly />
import { formatDate } from '@/lib/format'

// ── Ícono oficial de WhatsApp (glyph de simple-icons, 24×24) ─────────────
function WhatsAppGlyph({ size = 15 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.335-1.652a12.062 12.062 0 005.71 1.447h.005c6.585 0 11.945-5.335 11.949-11.893a11.821 11.821 0 00-3.484-8.413z" />
    </svg>
  )
}

// ── Normalización del número a formato internacional AR ──────────────────
// Quita espacios, guiones, paréntesis, puntos; antepone 54 si no tiene código.
export function normalizarTelefono(numero?: string | null): string | null {
  const digits = (numero ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('54')) return digits
  const sinCero = digits.replace(/^0+/, '') // formato local suele llevar 0 inicial
  return `54${sinCero}`
}

export function waLink(numero?: string | null, mensaje?: string): string | null {
  const n = normalizarTelefono(numero)
  if (!n) return null
  const base = `https://wa.me/${n}`
  return mensaje ? `${base}?text=${encodeURIComponent(mensaje)}` : base
}

// ── Helpers de mensaje por contexto ──────────────────────────────────────
function mesAnio(mesISO: string): string {
  const [y, m] = mesISO.slice(0, 10).split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date)
}
export function msgPago(nombre: string, mesISO: string, direccion: string): string {
  return `Hola ${nombre}, te escribimos por el pago correspondiente a ${mesAnio(mesISO)} de ${direccion}.`
}
export function msgActualizacion(nombre: string, direccion: string, fechaISO: string): string {
  return `Hola ${nombre}, te informamos que corresponde la actualización del alquiler de ${direccion} a partir del ${formatDate(fechaISO)}.`
}

function abrir(url: string): void {
  const api = window.lgprop?.openExternal
  if (api) api(url).catch(() => window.open(url, '_blank'))
  else window.open(url, '_blank')
}

interface Props {
  numero?: string | null
  /** Mensaje predefinido (editable por el usuario en WhatsApp). Sin esto abre el chat vacío. */
  mensaje?: string
  /** Solo el ícono, sin el texto del número. */
  iconOnly?: boolean
  /** Tamaño del ícono en px. */
  size?: number
  /** Qué mostrar cuando no hay número (solo si !iconOnly). */
  placeholder?: string
  className?: string
}

export default function TelefonoWhatsApp({
  numero,
  mensaje,
  iconOnly = false,
  size = 15,
  placeholder = '—',
  className = ''
}: Props): JSX.Element | null {
  const link = waLink(numero, mensaje)

  const boton = link && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        abrir(link)
      }}
      title="Enviar WhatsApp"
      aria-label="Enviar WhatsApp"
      className="inline-flex items-center justify-center rounded-md p-1 text-[#25D366] hover:bg-[#25D366]/10 transition-colors shrink-0"
    >
      <WhatsAppGlyph size={size} />
    </button>
  )

  if (iconOnly) return boton || null

  if (!numero) return <span className={`text-ink-3 ${className}`}>{placeholder}</span>

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span>{numero}</span>
      {boton}
    </span>
  )
}
