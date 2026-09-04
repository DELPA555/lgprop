// Recibo de Reserva (locación o venta) en PDF institucional replicando el
// formato en papel de LG Propiedades. Sin espacio de firma manuscrita.
// El núcleo `buildReciboReservaPDF` es puro (devuelve bytes) para poder
// renderizarlo también fuera del navegador; `descargarReciboReservaPDF`
// agrega la descarga en el renderer.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { importeEnLetras, importeNumero, numeroALetras } from './numeroLetras'

export type TipoOperacionRecibo = 'locacion' | 'venta'

export type ReciboReservaPDFData = {
  tipo: TipoOperacionRecibo
  ciudad: string
  fecha: string // ISO 'YYYY-MM-DD' (fecha de emisión)
  numero?: string | null
  direccion: string
  reservanteNombre: string
  reservanteDni?: string | null
  reservanteDomicilio?: string | null
  moneda: 'ARS' | 'USD'
  monto: number
  // Locación:
  plazoMeses?: number | null
  canonTotal?: number | null
  // Venta:
  montoOperacion?: number | null
  // Cláusula de arrepentimiento (texto final, ya con importes resueltos).
  // Párrafos separados por línea en blanco; **negrita** inline.
  clausula: string
  registro: string // ej "4171"
}

const NAVY = rgb(0.106, 0.149, 0.235)
const BODY = rgb(0.16, 0.18, 0.22)
const GRAY = rgb(0.42, 0.45, 0.5)
const LINE = rgb(0.8, 0.82, 0.85)

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre'
]

function san(s: string): string {
  return (s || '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/ /g, ' ')
}

function fechaLarga(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map((x) => parseInt(x, 10))
  const dd = d || 1
  return `${dd} ${dd === 1 ? 'día' : 'días'} del mes de ${MESES[(m || 1) - 1]} de ${y}`
}
function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ── Motor de texto enriquecido (negrita inline + justificado) ───────────────
type Frag = { t: string; b: boolean }
type Word = Frag[]

function parseBold(s: string): Frag[] {
  const out: Frag[] = []
  const parts = san(s).split('**')
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== '') out.push({ t: parts[i], b: i % 2 === 1 })
  }
  return out
}

function toWords(frags: Frag[]): Word[] {
  const words: Word[] = []
  let cur: Word = []
  for (const seg of frags) {
    for (const ch of seg.t.split(/(\s+)/)) {
      if (ch === '') continue
      if (/^\s+$/.test(ch)) {
        if (cur.length) {
          words.push(cur)
          cur = []
        }
      } else {
        cur.push({ t: ch, b: seg.b })
      }
    }
  }
  if (cur.length) words.push(cur)
  return words
}

export async function buildReciboReservaPDF(d: ReciboReservaPDFData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const pageW = 595.28
  const pageH = 841.89
  const margin = 56
  const rightX = pageW - margin
  const maxW = rightX - margin
  const cx = pageW / 2

  let page: PDFPage = pdf.addPage([pageW, pageH])
  let y = pageH

  const put = (s: string, x: number, yy: number, size: number, f: PDFFont, color = BODY): void => {
    page.drawText(san(s), { x, y: yy, size, font: f, color })
  }
  const wAt = (s: string, size: number, f: PDFFont): number =>
    f.widthOfTextAtSize(san(s), size)
  const centerAt = (
    s: string,
    yy: number,
    size: number,
    f: PDFFont,
    color: ReturnType<typeof rgb>,
    tracking = 0
  ): void => {
    const chars = [...san(s)]
    const total = wAt(s, size, f) + tracking * Math.max(0, chars.length - 1)
    let x = cx - total / 2
    for (const ch of chars) {
      put(ch, x, yy, size, f, color)
      x += wAt(ch, size, f) + tracking
    }
  }

  const ensure = (space: number): void => {
    if (y - space < margin + 30) {
      page = pdf.addPage([pageW, pageH])
      y = pageH - margin
    }
  }

  // Párrafo justificado con negritas inline. Devuelve nada; avanza y.
  const drawParagraph = (
    md: string,
    size: number,
    lineH: number,
    opts: { justify?: boolean; color?: ReturnType<typeof rgb>; bold?: boolean } = {}
  ): void => {
    const color = opts.color ?? BODY
    const baseFont = opts.bold ? bold : font
    const words = toWords(parseBold(md))
    const spaceW = wAt(' ', size, baseFont)
    const wordWidth = (w: Word): number =>
      w.reduce((s, f) => s + wAt(f.t, size, f.b ? bold : baseFont), 0)

    // Layout greedy
    const lines: { line: Word[]; width: number }[] = []
    let cur: Word[] = []
    let curW = 0
    for (const w of words) {
      const ww = wordWidth(w)
      const add = cur.length ? spaceW + ww : ww
      if (cur.length && curW + add > maxW) {
        lines.push({ line: cur, width: curW })
        cur = [w]
        curW = ww
      } else {
        cur.push(w)
        curW += add
      }
    }
    if (cur.length) lines.push({ line: cur, width: curW })

    for (let li = 0; li < lines.length; li++) {
      ensure(lineH)
      const { line, width } = lines[li]
      const isLast = li === lines.length - 1
      const gaps = line.length - 1
      const extra = opts.justify && !isLast && gaps > 0 ? (maxW - width) / gaps : 0
      let x = margin
      for (const w of line) {
        for (const f of w) {
          const ff = f.b ? bold : baseFont
          put(f.t, x, y, size, ff, color)
          x += wAt(f.t, size, ff)
        }
        x += spaceW + extra
      }
      y -= lineH
    }
  }

  // ── Encabezado: caja navy con isotipo de casa + LG PROPIEDADES ────────────
  const boxW = 146
  const boxH = 130
  const boxTop = pageH - 38
  const boxX = cx - boxW / 2
  page.drawRectangle({
    x: boxX,
    y: boxTop - boxH,
    width: boxW,
    height: boxH,
    color: NAVY
  })
  // Casa (líneas blancas)
  const white = rgb(1, 1, 1)
  const roofPeak = { x: cx, y: boxTop - 18 }
  const eaveL = { x: cx - 38, y: boxTop - 46 }
  const eaveR = { x: cx + 38, y: boxTop - 46 }
  const wallL = cx - 30
  const wallR = cx + 30
  const wallTop = boxTop - 46
  const wallBot = boxTop - 86
  const roof = [
    [roofPeak, eaveL],
    [roofPeak, eaveR],
    [{ x: wallL, y: wallTop }, { x: wallL, y: wallBot }],
    [{ x: wallR, y: wallTop }, { x: wallR, y: wallBot }],
    [{ x: wallL, y: wallBot }, { x: wallR, y: wallBot }]
  ]
  for (const [a, b] of roof) {
    page.drawLine({ start: a, end: b, thickness: 3, color: white })
  }
  // "LG" dentro de la casa
  centerAt('LG', boxTop - 75, 26, bold, white)
  // Divisor + PROPIEDADES + REG
  page.drawLine({
    start: { x: cx - 46, y: boxTop - 96 },
    end: { x: cx + 46, y: boxTop - 96 },
    thickness: 0.8,
    color: rgb(0.55, 0.6, 0.7)
  })
  centerAt('PROPIEDADES', boxTop - 110, 10.5, bold, white, 1.6)
  centerAt(`REG. ${d.registro}`, boxTop - 122, 7, font, rgb(0.7, 0.74, 0.82), 1)

  y = boxTop - boxH - 26

  // ── Título + subtítulo (dirección) ────────────────────────────────────────
  const titulo =
    d.tipo === 'locacion' ? 'RECIBO DE RESERVA DE LOCACIÓN' : 'RECIBO DE RESERVA DE VENTA'
  centerAt(titulo, y, 20, bold, NAVY)
  y -= 20
  centerAt(d.direccion, y, 10.5, font, GRAY)
  y -= 26

  // ── Tabla de importe ──────────────────────────────────────────────────────
  const rowH = 34
  const tableTop = y
  const tableBot = tableTop - rowH * 2
  const colX = margin + maxW * 0.56
  // Fondo suave de la columna derecha
  page.drawRectangle({
    x: colX,
    y: tableBot,
    width: rightX - colX,
    height: rowH * 2,
    color: rgb(0.965, 0.97, 0.98)
  })
  // Bordes
  page.drawRectangle({
    x: margin,
    y: tableBot,
    width: maxW,
    height: rowH * 2,
    borderColor: LINE,
    borderWidth: 1
  })
  page.drawLine({
    start: { x: margin, y: tableTop - rowH },
    end: { x: rightX, y: tableTop - rowH },
    thickness: 1,
    color: LINE
  })
  page.drawLine({
    start: { x: colX, y: tableBot },
    end: { x: colX, y: tableTop },
    thickness: 1,
    color: LINE
  })
  // Contenido de celdas
  const r1c = tableTop - rowH / 2
  const r2c = tableTop - rowH - rowH / 2
  put('IMPORTE RECIBIDO', margin + 16, r1c - 3.5, 9.5, bold, rgb(0.2, 0.23, 0.28))
  put(
    importeEnLetras(d.monto, d.moneda),
    margin + 16,
    r2c - 3,
    9,
    font,
    GRAY
  )
  const montoNum = importeNumero(d.monto, d.moneda).replace(/^(\D+)/, '$1 ') // "$ 800.000"
  const montoW = wAt(montoNum, 17, bold)
  put(montoNum, colX + (rightX - colX) / 2 - montoW / 2, r1c - 6, 17, bold, NAVY)
  const conceptoTxt = d.tipo === 'locacion' ? 'Reserva de locación' : 'Reserva de venta'
  const conW = wAt(conceptoTxt, 10, font)
  put(conceptoTxt, colX + (rightX - colX) / 2 - conW / 2, r2c - 3.5, 10, font, GRAY)

  y = tableBot - 26

  // ── Cuerpo ────────────────────────────────────────────────────────────────
  const conceptoUpper = d.tipo === 'locacion' ? 'RESERVA DE LOCACIÓN' : 'RESERVA DE VENTA'
  const montoBold = `${importeEnLetras(d.monto, d.moneda)} (${importeNumero(d.monto, d.moneda)})`
  const dniTxt = d.reservanteDni ? `, DNI **${d.reservanteDni}**` : ''
  const domTxt = d.reservanteDomicilio
    ? `, con domicilio declarado en **${d.reservanteDomicilio}**`
    : ''
  const p1 =
    `En la ciudad de **${d.ciudad}**, a los **${fechaLarga(d.fecha)}**, se deja constancia de haber ` +
    `recibido de **${d.reservanteNombre.toUpperCase()}**${dniTxt}${domTxt}, la suma de **${montoBold}**, ` +
    `en concepto de **${conceptoUpper}** del inmueble sito en **${d.direccion}**.`
  drawParagraph(p1, 10.5, 14, { justify: true })
  y -= 5

  let p2: string
  if (d.tipo === 'locacion') {
    const plazoTxt =
      d.plazoMeses && d.plazoMeses > 0
        ? ` por el plazo de **${numeroALetras(d.plazoMeses).toUpperCase()} (${d.plazoMeses}) ${
            d.plazoMeses === 1 ? 'MES' : 'MESES'
          }**`
        : ''
    const canonTxt =
      d.canonTotal && d.canonTotal > 0
        ? `, con un canon locativo total de **${importeEnLetras(d.canonTotal, d.moneda)} (${importeNumero(
            d.canonTotal,
            d.moneda
          )})**`
        : ''
    p2 =
      `La reserva corresponde a una locación${plazoTxt}${canonTxt}, pagadero por adelantado. ` +
      `En caso de concretarse la operación, la suma entregada mediante el presente será imputada ` +
      `íntegramente al pago del canon locativo correspondiente al período contratado.`
  } else {
    const opTxt =
      d.montoOperacion && d.montoOperacion > 0
        ? ` por un monto total pactado de **${importeEnLetras(d.montoOperacion, d.moneda)} (${importeNumero(
            d.montoOperacion,
            d.moneda
          )})**`
        : ''
    p2 =
      `La reserva corresponde a una operación de compraventa${opTxt}. En caso de concretarse la ` +
      `operación, la suma entregada mediante el presente será imputada a cuenta del precio total ` +
      `de la operación.`
  }
  drawParagraph(p2, 10.5, 14, { justify: true })
  y -= 12

  // ── Cláusula de arrepentimiento ───────────────────────────────────────────
  ensure(40)
  drawParagraph('CLÁUSULA DE ARREPENTIMIENTO Y DESTINO DE LA RESERVA', 11, 15, { bold: true })
  y -= 4
  const parrafos = d.clausula.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  for (const par of parrafos) {
    drawParagraph(par.replace(/\s*\n\s*/g, ' '), 10.5, 14, { justify: true })
    y -= 6
  }

  // ── Pie de página (en todas las páginas) ──────────────────────────────────
  const pages = pdf.getPages()
  const opLabel = d.tipo === 'locacion' ? 'locación' : 'venta'
  for (const pg of pages) {
    pg.drawLine({
      start: { x: margin, y: 58 },
      end: { x: rightX, y: 58 },
      thickness: 0.6,
      color: LINE
    })
    pg.drawText(san(`LG PROPIEDADES - REG. ${d.registro} | Recibo de reserva de ${opLabel}`), {
      x: margin,
      y: 46,
      size: 8,
      font,
      color: GRAY
    })
    const rightFooter = san(`${d.ciudad} - ${fechaCorta(d.fecha)}`)
    pg.drawText(rightFooter, {
      x: rightX - wAt(rightFooter, 8, font),
      y: 46,
      size: 8,
      font,
      color: GRAY
    })
  }

  return await pdf.save()
}

export async function descargarReciboReservaPDF(
  d: ReciboReservaPDFData,
  filename = 'recibo-reserva.pdf'
): Promise<Blob> {
  const bytes = await buildReciboReservaPDF(d)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return blob
}
