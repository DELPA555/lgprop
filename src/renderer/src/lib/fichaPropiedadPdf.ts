// Ficha de propiedad (cara al cliente) en PDF institucional de LG Propiedades.
// Reutiliza el mismo encabezado/tipografía que el Recibo de Reserva. Incluye
// foto de portada + galería, características, precio, descripción y contacto de
// LG Propiedades. NUNCA incluye datos privados del dueño/garante/contrato.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib'

export type FichaFoto = { bytes: Uint8Array; tipo: string } // tipo mime (image/jpeg|png)

export type FichaContacto = {
  telefono?: string | null
  email?: string | null
  web?: string | null
}

export type FichaPropiedadPDFData = {
  registro: string
  ciudad: string
  fecha: string // ISO
  // Encabezado comercial
  tituloOferta: string // "EN ALQUILER" | "EN VENTA" | "EN ALQUILER Y VENTA"
  direccion: string // dirección exacta o zona/barrio según toggle
  tipo?: string | null // casa/depto/etc
  // Precios (ya formateados, ej "$ 850.000 / mes" y "USD 120.000")
  precios: string[]
  estadoOferta?: string | null // ej "Reservada"
  // Características
  ambientes?: number | null
  dormitorios?: number | null
  banos?: number | null
  superficieM2?: number | null
  cochera?: boolean
  descripcion?: string | null
  // Fotos (la primera es portada)
  fotos: FichaFoto[]
  contacto: FichaContacto
}

const NAVY = rgb(0.106, 0.149, 0.235)
const BODY = rgb(0.16, 0.18, 0.22)
const GRAY = rgb(0.42, 0.45, 0.5)
const LINE = rgb(0.8, 0.82, 0.85)
const SOFT = rgb(0.965, 0.97, 0.98)

function san(s: string): string {
  return (s || '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/ /g, ' ')
}
function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

async function embedImg(pdf: PDFDocument, f: FichaFoto): Promise<PDFImage | null> {
  try {
    if (f.tipo.includes('png')) return await pdf.embedPng(f.bytes)
    return await pdf.embedJpg(f.bytes)
  } catch {
    // Si el tipo declarado no coincide, probar el otro formato.
    try {
      return await pdf.embedPng(f.bytes)
    } catch {
      try {
        return await pdf.embedJpg(f.bytes)
      } catch {
        return null
      }
    }
  }
}

export async function buildFichaPropiedadPDF(d: FichaPropiedadPDFData): Promise<Uint8Array> {
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
  const wAt = (s: string, size: number, f: PDFFont): number => f.widthOfTextAtSize(san(s), size)
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
    if (y - space < margin + 40) {
      page = pdf.addPage([pageW, pageH])
      y = pageH - margin
    }
  }

  // Párrafo justificado simple (sin negritas inline; la ficha es texto plano).
  const drawParagraph = (text: string, size: number, lineH: number): void => {
    const words = san(text).split(/\s+/).filter(Boolean)
    const spaceW = wAt(' ', size, font)
    const lines: { words: string[]; width: number }[] = []
    let cur: string[] = []
    let curW = 0
    for (const w of words) {
      const ww = wAt(w, size, font)
      const add = cur.length ? spaceW + ww : ww
      if (cur.length && curW + add > maxW) {
        lines.push({ words: cur, width: curW })
        cur = [w]
        curW = ww
      } else {
        cur.push(w)
        curW += add
      }
    }
    if (cur.length) lines.push({ words: cur, width: curW })
    for (let li = 0; li < lines.length; li++) {
      ensure(lineH)
      const { words: ws, width } = lines[li]
      const isLast = li === lines.length - 1
      const gaps = ws.length - 1
      const extra = !isLast && gaps > 0 ? (maxW - width) / gaps : 0
      let x = margin
      for (const w of ws) {
        put(w, x, y, size, font, BODY)
        x += wAt(w, size, font) + spaceW + extra
      }
      y -= lineH
    }
  }

  // ── Encabezado institucional (caja navy con isotipo de casa) ──────────────
  const boxW = 120
  const boxH = 108
  const boxTop = pageH - 34
  const boxX = cx - boxW / 2
  page.drawRectangle({ x: boxX, y: boxTop - boxH, width: boxW, height: boxH, color: NAVY })
  const white = rgb(1, 1, 1)
  const roofPeak = { x: cx, y: boxTop - 15 }
  const eaveL = { x: cx - 31, y: boxTop - 38 }
  const eaveR = { x: cx + 31, y: boxTop - 38 }
  const wallL = cx - 25
  const wallR = cx + 25
  const wallTop = boxTop - 38
  const wallBot = boxTop - 71
  const roof = [
    [roofPeak, eaveL],
    [roofPeak, eaveR],
    [{ x: wallL, y: wallTop }, { x: wallL, y: wallBot }],
    [{ x: wallR, y: wallTop }, { x: wallR, y: wallBot }],
    [{ x: wallL, y: wallBot }, { x: wallR, y: wallBot }]
  ]
  for (const [a, b] of roof) page.drawLine({ start: a, end: b, thickness: 2.6, color: white })
  centerAt('LG', boxTop - 62, 22, bold, white)
  page.drawLine({
    start: { x: cx - 38, y: boxTop - 80 },
    end: { x: cx + 38, y: boxTop - 80 },
    thickness: 0.8,
    color: rgb(0.55, 0.6, 0.7)
  })
  centerAt('PROPIEDADES', boxTop - 92, 9, bold, white, 1.4)
  centerAt(`REG. ${d.registro}`, boxTop - 102, 6.5, font, rgb(0.7, 0.74, 0.82), 1)

  y = boxTop - boxH - 22

  // ── Título comercial + subtítulo (dirección/zona) ─────────────────────────
  centerAt(d.tituloOferta, y, 19, bold, NAVY)
  y -= 19
  centerAt(d.direccion, y, 11, font, GRAY)
  y -= 15
  if (d.tipo) {
    centerAt(d.tipo, y, 9.5, font, GRAY)
    y -= 14
  }
  y -= 6

  // ── Precio(s) en caja destacada ───────────────────────────────────────────
  if (d.precios.length) {
    const boxH2 = 26 + (d.precios.length - 1) * 16
    ensure(boxH2 + 10)
    page.drawRectangle({
      x: margin,
      y: y - boxH2,
      width: maxW,
      height: boxH2,
      color: SOFT,
      borderColor: LINE,
      borderWidth: 1
    })
    let py = y - 18
    for (const pr of d.precios) {
      const w = wAt(pr, 15, bold)
      put(pr, cx - w / 2, py, 15, bold, NAVY)
      py -= 16
    }
    y -= boxH2 + 12
    if (d.estadoOferta) {
      const et = `Estado: ${d.estadoOferta}`
      const w = wAt(et, 9.5, font)
      put(et, cx - w / 2, y, 9.5, font, GRAY)
      y -= 14
    }
  }

  // ── Foto de portada ───────────────────────────────────────────────────────
  const imgs: PDFImage[] = []
  for (const f of d.fotos) {
    const img = await embedImg(pdf, f)
    if (img) imgs.push(img)
  }
  if (imgs.length) {
    const portada = imgs[0]
    const availW = maxW
    const maxH = 250
    let w = availW
    let h = (portada.height / portada.width) * w
    if (h > maxH) {
      h = maxH
      w = (portada.width / portada.height) * h
    }
    ensure(h + 12)
    page.drawImage(portada, { x: cx - w / 2, y: y - h, width: w, height: h })
    y -= h + 14
  }

  // ── Características ─────────────────────────────────────────────────────────
  const chips: string[] = []
  if (d.ambientes != null) chips.push(`${d.ambientes} amb.`)
  if (d.dormitorios != null) chips.push(`${d.dormitorios} dorm.`)
  if (d.banos != null) chips.push(`${d.banos} baño${d.banos === 1 ? '' : 's'}`)
  if (d.superficieM2 != null) chips.push(`${d.superficieM2} m²`)
  if (d.cochera) chips.push('Cochera')
  if (chips.length) {
    ensure(24)
    const label = chips.join('     •     ')
    const w = wAt(label, 10.5, font)
    put(label, cx - w / 2, y, 10.5, font, rgb(0.2, 0.23, 0.28))
    y -= 20
  }

  // ── Descripción ────────────────────────────────────────────────────────────
  if (d.descripcion && d.descripcion.trim()) {
    ensure(30)
    put('DESCRIPCIÓN', margin, y, 10, bold, NAVY)
    y -= 16
    drawParagraph(d.descripcion, 10.5, 14)
    y -= 8
  }

  // ── Galería (fotos restantes) ──────────────────────────────────────────────
  if (imgs.length > 1) {
    ensure(30)
    put('GALERÍA', margin, y, 10, bold, NAVY)
    y -= 16
    const gap = 10
    const cols = 3
    const cellW = (maxW - gap * (cols - 1)) / cols
    const cellH = cellW * 0.7
    let col = 0
    let rowTop = y
    for (let i = 1; i < imgs.length; i++) {
      if (col === 0) {
        ensure(cellH + gap)
        rowTop = y
      }
      const img = imgs[i]
      const x = margin + col * (cellW + gap)
      // Encajar la imagen dentro de la celda (contain)
      let w = cellW
      let h = (img.height / img.width) * w
      if (h > cellH) {
        h = cellH
        w = (img.width / img.height) * h
      }
      page.drawImage(img, {
        x: x + (cellW - w) / 2,
        y: rowTop - cellH + (cellH - h) / 2,
        width: w,
        height: h
      })
      col++
      if (col === cols) {
        col = 0
        y = rowTop - cellH - gap
      }
    }
    if (col !== 0) y = rowTop - cellH - gap
  }

  // ── Pie: contacto de LG Propiedades (en todas las páginas) ─────────────────
  const contactoParts: string[] = []
  if (d.contacto.telefono) contactoParts.push(`Tel: ${d.contacto.telefono}`)
  if (d.contacto.email) contactoParts.push(d.contacto.email)
  if (d.contacto.web) contactoParts.push(d.contacto.web)
  const contactoLine = contactoParts.join('  |  ')
  for (const pg of pdf.getPages()) {
    pg.drawLine({
      start: { x: margin, y: 62 },
      end: { x: rightX, y: 62 },
      thickness: 0.6,
      color: LINE
    })
    pg.drawText(san(`LG PROPIEDADES - REG. ${d.registro}`), {
      x: margin,
      y: 50,
      size: 8,
      font: bold,
      color: NAVY
    })
    if (contactoLine) {
      pg.drawText(san(contactoLine), { x: margin, y: 39, size: 8, font, color: GRAY })
    }
    const right = san(`${d.ciudad} - ${fechaCorta(d.fecha)}`)
    pg.drawText(right, { x: rightX - wAt(right, 8, font), y: 50, size: 8, font, color: GRAY })
  }

  return await pdf.save()
}
