// Exportación del contrato redactado a PDF con pdf-lib (corre en el renderer de
// Electron). Formato prolijo A4, tipografía Times, con salto de página automático.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// La fuente WinAnsi de pdf-lib no codifica algunos caracteres Unicode (comillas
// tipográficas, guiones largos, etc.). Los normalizamos a ASCII equivalente.
function sanitize(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[•]/g, '- ')
    .replace(/\t/g, '    ')
}

export async function exportContratoPDF(texto: string, filename = 'contrato.pdf'): Promise<void> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.TimesRoman)

  const fontSize = 11
  const lineHeight = 16
  const margin = 56 // ~2 cm
  const pageW = 595.28
  const pageH = 841.89 // A4
  const maxW = pageW - margin * 2

  let page = pdf.addPage([pageW, pageH])
  let y = pageH - margin

  const newPage = (): void => {
    page = pdf.addPage([pageW, pageH])
    y = pageH - margin
  }

  // Envuelve una línea larga en varias según el ancho disponible.
  const wrap = (line: string): string[] => {
    if (line === '') return ['']
    const words = line.split(/\s+/)
    const out: string[] = []
    let cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (font.widthOfTextAtSize(test, fontSize) > maxW && cur) {
        out.push(cur)
        cur = w
      } else {
        cur = test
      }
    }
    if (cur) out.push(cur)
    return out
  }

  const paragraphs = sanitize(texto).replace(/\r\n/g, '\n').split('\n')
  for (const para of paragraphs) {
    const wrapped = wrap(para)
    for (const ln of wrapped) {
      if (y < margin) newPage()
      page.drawText(ln, { x: margin, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) })
      y -= lineHeight
    }
  }

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
