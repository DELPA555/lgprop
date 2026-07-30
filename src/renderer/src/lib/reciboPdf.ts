// Recibo de pago (para el inquilino) generado con pdf-lib en el renderer.
// Comprobante interno de LG Prop — no es un comprobante fiscal AFIP.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type ReciboData = {
  numero: string
  fecha: string // "30/07/2026"
  inquilino: string
  propiedad: string
  periodoLabel: string // "Julio 2026"
  concepto: string
  moneda: 'ARS' | 'USD'
  monto: number
}

function money(n: number, moneda: 'ARS' | 'USD'): string {
  const [int, dec] = (Math.round(n * 100) / 100).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const simbolo = moneda === 'USD' ? 'US$' : '$'
  return `${simbolo} ${grouped},${dec}`
}
function san(s: string): string {
  return (s || '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
}

export async function generarReciboPDF(d: ReciboData, filename = 'recibo.pdf'): Promise<void> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Media hoja A4 apaisada para que parezca un recibo/comprobante
  const pageW = 595.28
  const pageH = 420
  const margin = 48
  const rightX = pageW - margin
  const page = pdf.addPage([pageW, pageH])
  let y = pageH - margin

  const text = (s: string, x: number, size = 10, f = font, color = rgb(0.1, 0.1, 0.1)): void => {
    page.drawText(san(s), { x, y, size, font: f, color })
  }
  const right = (s: string, xRight: number, size = 10, f = font): void => {
    const w = f.widthOfTextAtSize(san(s), size)
    text(s, xRight - w, size, f)
  }

  // Marco
  page.drawRectangle({
    x: margin - 14,
    y: margin - 14,
    width: pageW - 2 * (margin - 14),
    height: pageH - 2 * (margin - 14),
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 1
  })

  // Encabezado
  text('LG Prop', margin, 13, bold, rgb(0.02, 0.55, 0.4))
  text('Administración de alquileres', margin + 82, 9, font, rgb(0.5, 0.5, 0.5))
  right('RECIBO', rightX, 20, bold)
  y -= 16
  right(`N° ${d.numero}`, rightX, 9, font)
  y -= 26

  right(`Fecha: ${d.fecha}`, rightX, 10)
  y -= 22

  text(`Recibí de: ${d.inquilino}`, margin, 11, bold)
  y -= 20
  text(`Propiedad: ${d.propiedad}`, margin, 10)
  y -= 16
  text(`Concepto: ${d.concepto}`, margin, 10)
  y -= 16
  text(`Período: ${d.periodoLabel}`, margin, 10)
  y -= 34

  // Importe destacado
  page.drawRectangle({
    x: margin - 6,
    y: y - 8,
    width: rightX - margin + 12,
    height: 36,
    color: rgb(0.94, 0.98, 0.96)
  })
  text('TOTAL RECIBIDO', margin, 11, bold, rgb(0.02, 0.45, 0.32))
  right(money(d.monto, d.moneda), rightX - 4, 16, bold)
  y -= 54

  text('Firma y aclaración: ______________________________', margin, 9, font, rgb(0.45, 0.45, 0.45))
  y -= 22
  text(
    'Comprobante interno de administración. No válido como factura/recibo fiscal (AFIP).',
    margin,
    7.5,
    font,
    rgb(0.6, 0.6, 0.6)
  )

  const bytes = await pdf.save()
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
