// Genera el PDF/resumen de expensas de UNA unidad funcional (para enviarle al
// propietario). Usa pdf-lib en el renderer, mismo estilo que la liquidación a dueño.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type ExpensaGastoLinea = {
  concepto: string
  categoria?: string | null
  monto: number
}

export type ExpensaPdfData = {
  consorcioNombre: string
  direccion?: string | null
  mesLabel: string // "Julio 2026"
  fecha: string // "30/07/2026"
  unidad: string
  propietario?: string | null
  gastos: ExpensaGastoLinea[]
  totalGastos: number
  fondoReserva: number
  base: number
  porcentaje: number
  montoAPagar: number
}

function money(n: number): string {
  const [int, dec] = (Math.round(n * 100) / 100).toFixed(2).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `$ ${grouped},${dec}`
}
function san(s: string): string {
  return (s || '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
}

export async function generarExpensaPDF(
  d: ExpensaPdfData,
  filename = 'expensa.pdf'
): Promise<void> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const pageW = 595.28
  const pageH = 841.89
  const margin = 56
  const rightX = pageW - margin
  const colCat = pageW - margin - 150
  const colMonto = rightX

  let page = pdf.addPage([pageW, pageH])
  let y = pageH - margin

  const text = (
    s: string,
    x: number,
    size = 10,
    f = font,
    color = rgb(0.1, 0.1, 0.1)
  ): void => {
    page.drawText(san(s), { x, y, size, font: f, color })
  }
  const right = (s: string, xRight: number, size = 10, f = font): void => {
    const w = f.widthOfTextAtSize(san(s), size)
    text(s, xRight - w, size, f)
  }
  const line = (): void => {
    page.drawLine({
      start: { x: margin, y: y + 6 },
      end: { x: rightX, y: y + 6 },
      thickness: 0.6,
      color: rgb(0.8, 0.8, 0.8)
    })
  }
  const ensure = (space: number): void => {
    if (y - space < margin) {
      page = pdf.addPage([pageW, pageH])
      y = pageH - margin
    }
  }

  // Encabezado
  text('LG Prop', margin, 11, bold, rgb(0.02, 0.55, 0.4))
  text('Administración de consorcios', margin + 70, 9, font, rgb(0.5, 0.5, 0.5))
  y -= 30
  text('LIQUIDACIÓN DE EXPENSAS', margin, 18, bold)
  y -= 26

  text(`Consorcio: ${d.consorcioNombre}`, margin, 11, bold)
  y -= 15
  if (d.direccion) {
    text(d.direccion, margin, 9, font, rgb(0.5, 0.5, 0.5))
    y -= 15
  }
  text(`Unidad: ${d.unidad}`, margin, 10)
  if (d.propietario) right(`Propietario: ${d.propietario}`, rightX, 10)
  y -= 15
  text(`Período: ${d.mesLabel}`, margin, 10)
  right(`Emitida: ${d.fecha}`, rightX, 10)
  y -= 26

  // Detalle de gastos del edificio
  text('Detalle de gastos del edificio', margin, 10, bold, rgb(0.4, 0.4, 0.4))
  y -= 6
  line()
  y -= 16
  text('Concepto', margin, 9, bold, rgb(0.4, 0.4, 0.4))
  text('Categoría', colCat, 9, bold, rgb(0.4, 0.4, 0.4))
  right('Monto', colMonto, 9, bold)
  y -= 16

  for (const g of d.gastos) {
    ensure(30)
    let c = g.concepto
    while (font.widthOfTextAtSize(san(c), 10) > colCat - margin - 10 && c.length > 4) {
      c = c.slice(0, -2)
    }
    if (c !== g.concepto) c = c + '…'
    text(c, margin, 10)
    text(g.categoria ?? '-', colCat, 9, font, rgb(0.45, 0.45, 0.45))
    right(money(g.monto), colMonto, 10)
    y -= 16
  }

  y -= 2
  line()
  y -= 16
  text('Total de gastos', margin, 10, bold)
  right(money(d.totalGastos), colMonto, 10, bold)
  y -= 16
  if (d.fondoReserva > 0) {
    text('Fondo de reserva del mes', margin, 10)
    right(money(d.fondoReserva), colMonto, 10)
    y -= 16
  }
  text('Base a repartir', margin, 10, bold)
  right(money(d.base), colMonto, 10, bold)
  y -= 30

  // Lo que le toca a esta unidad, destacado
  ensure(80)
  page.drawRectangle({
    x: margin,
    y: y - 6,
    width: rightX - margin,
    height: 30,
    color: rgb(0.94, 0.98, 0.96)
  })
  text(`Su parte (${d.porcentaje}%)`, margin + 10, 11, bold, rgb(0.02, 0.45, 0.32))
  right(money(d.montoAPagar), rightX - 10, 13, bold)
  y -= 44

  text(
    `Expensa correspondiente a ${d.mesLabel}. Documento generado el ${d.fecha}.`,
    margin,
    8,
    font,
    rgb(0.55, 0.55, 0.55)
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
