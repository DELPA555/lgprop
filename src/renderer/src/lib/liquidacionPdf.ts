// Genera el PDF de una liquidación a dueño con pdf-lib (corre en el renderer).
// Formato tipo comprobante: encabezado, datos, tabla de propiedades y totales.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export type LiquidacionLinea = {
  direccion: string
  bruto: number
  comision: number
  neto: number
}

export type LiquidacionData = {
  duenoNombre: string
  periodoLabel: string // ej "Julio 2026"
  fecha: string // ej "29/07/2026"
  alias?: string | null
  cbu?: string | null
  lineas: LiquidacionLinea[]
  totalBruto: number
  totalComision: number
  totalNeto: number
}

// Formateo de pesos ASCII puro (evita chars que la fuente WinAnsi no codifica).
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

export async function generarLiquidacionPDF(
  d: LiquidacionData,
  filename = 'liquidacion.pdf'
): Promise<void> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const pageW = 595.28
  const pageH = 841.89
  const margin = 56
  const rightX = pageW - margin
  // Bordes derechos de cada columna de montos
  const colBruto = pageW - margin - 200
  const colComision = pageW - margin - 100
  const colNeto = rightX

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
  text('Administración de alquileres', margin + 70, 9, font, rgb(0.5, 0.5, 0.5))
  y -= 30
  text('LIQUIDACIÓN A DUEÑO', margin, 18, bold)
  y -= 28

  // Datos
  text(`Dueño: ${d.duenoNombre}`, margin, 11, bold)
  y -= 16
  text(`Período: ${d.periodoLabel}`, margin, 10)
  right(`Emitida: ${d.fecha}`, rightX, 10)
  y -= 26

  // Cabecera de la tabla
  text('Propiedad', margin, 9, bold, rgb(0.4, 0.4, 0.4))
  right('Bruto', colBruto, 9, bold)
  right('Comisión', colComision, 9, bold)
  right('Neto', colNeto, 9, bold)
  y -= 4
  line()
  y -= 16

  // Filas
  for (const l of d.lineas) {
    ensure(30)
    // Recortar dirección si es muy larga
    let dir = l.direccion
    while (font.widthOfTextAtSize(san(dir), 10) > colBruto - margin - 60 && dir.length > 4) {
      dir = dir.slice(0, -2)
    }
    if (dir !== l.direccion) dir = dir + '…'
    text(dir, margin, 10)
    right(money(l.bruto), colBruto, 10)
    right(money(l.comision), colComision, 10)
    right(money(l.neto), colNeto, 10)
    y -= 18
  }

  // Totales
  y -= 2
  line()
  y -= 18
  text('TOTALES', margin, 10, bold)
  right(money(d.totalBruto), colBruto, 10, bold)
  right(money(d.totalComision), colComision, 10, bold)
  right(money(d.totalNeto), colNeto, 10, bold)
  y -= 34

  // Neto a transferir destacado
  ensure(80)
  page.drawRectangle({
    x: margin,
    y: y - 6,
    width: rightX - margin,
    height: 30,
    color: rgb(0.94, 0.98, 0.96)
  })
  text('NETO A TRANSFERIR', margin + 10, 11, bold, rgb(0.02, 0.45, 0.32))
  right(money(d.totalNeto), rightX - 10, 13, bold)
  y -= 44

  if (d.alias || d.cbu) {
    text('Datos para la transferencia:', margin, 9, bold, rgb(0.4, 0.4, 0.4))
    y -= 14
    if (d.alias) {
      text(`Alias: ${d.alias}`, margin, 10)
      y -= 14
    }
    if (d.cbu) {
      text(`CBU: ${d.cbu}`, margin, 10)
      y -= 14
    }
  }
  y -= 6
  text(
    `Comisión por administración retenida. Documento generado el ${d.fecha}.`,
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
