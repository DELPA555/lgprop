// Orquestación de la ficha de propiedad compartible: arma los datos del PDF a
// partir de la propiedad + fotos, la genera, la descarga, la sube al bucket y
// dispara el envío por email (Edge Function) o WhatsApp (link firmado).
import { supabase } from '@/lib/supabase/client'
import type { DisponiblePara, EstadoOferta, FotoPropiedad, Propiedad } from '@/types/database'
import { formatMoneda } from '@/lib/format'
import {
  buildFichaPropiedadPDF,
  type FichaFoto,
  type FichaContacto,
  type FichaPropiedadPDFData
} from '@/lib/fichaPropiedadPdf'
import { urlsFirmadasFotos, portadaDe, BUCKET } from '@/lib/fotosPropiedad'

export const DISPONIBLE_LABEL: Record<DisponiblePara, string> = {
  alquiler: 'Alquiler',
  venta: 'Venta',
  ambas: 'Alquiler y venta',
  ninguna: 'No ofrecida'
}

export const ESTADO_OFERTA_LABEL: Record<EstadoOferta, string> = {
  disponible: 'Disponible',
  reservada: 'Reservada',
  en_proceso: 'En proceso',
  no_disponible: 'No disponible'
}

export function tituloOferta(dp: DisponiblePara): string {
  if (dp === 'alquiler') return 'EN ALQUILER'
  if (dp === 'venta') return 'EN VENTA'
  if (dp === 'ambas') return 'EN ALQUILER Y VENTA'
  return 'FICHA DE PROPIEDAD'
}

// Precios formateados para mostrar (tarjeta / PDF).
export function preciosDe(p: Propiedad): string[] {
  const out: string[] = []
  const mostrarAlq = p.disponible_para === 'alquiler' || p.disponible_para === 'ambas'
  const mostrarVta = p.disponible_para === 'venta' || p.disponible_para === 'ambas'
  if (mostrarAlq && p.precio_alquiler != null)
    out.push(`${formatMoneda(p.precio_alquiler, p.moneda_alquiler)} / mes`)
  if (mostrarVta && p.precio_venta != null)
    out.push(`${formatMoneda(p.precio_venta, p.moneda_venta)}`)
  return out
}

// Lee los datos de contacto + ciudad + registro desde `configuracion`.
export async function cargarDatosFicha(): Promise<{
  contacto: FichaContacto
  ciudad: string
  registro: string
}> {
  const claves = [
    'ficha_contacto_telefono',
    'ficha_contacto_email',
    'ficha_contacto_web',
    'recibo_ciudad_default',
    'recibo_registro'
  ]
  const { data } = await supabase.from('configuracion').select('clave, valor').in('clave', claves)
  const map: Record<string, string> = {}
  for (const row of data ?? []) map[row.clave] = row.valor ?? ''
  return {
    contacto: {
      telefono: map['ficha_contacto_telefono'] || null,
      email: map['ficha_contacto_email'] || null,
      web: map['ficha_contacto_web'] || null
    },
    ciudad: map['recibo_ciudad_default'] || 'Mar del Plata',
    registro: map['recibo_registro'] || '4171'
  }
}

// Baja los bytes de las fotos (ordenadas, portada primero) desde el bucket.
export async function cargarFotosBytes(fotos: FotoPropiedad[]): Promise<FichaFoto[]> {
  if (fotos.length === 0) return []
  const portada = portadaDe(fotos)
  const ordenadas = portada ? [portada, ...fotos.filter((f) => f.id !== portada.id)] : fotos
  const urls = await urlsFirmadasFotos(ordenadas.map((f) => f.path))
  const out: FichaFoto[] = []
  for (const f of ordenadas) {
    const url = urls[f.path]
    if (!url) continue
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const buf = new Uint8Array(await res.arrayBuffer())
      out.push({ bytes: buf, tipo: res.headers.get('content-type') || 'image/jpeg' })
    } catch {
      /* saltar la que falle */
    }
  }
  return out
}

// Construye el objeto de datos del PDF.
export async function armarDatosFicha(
  p: Propiedad,
  fotos: FotoPropiedad[],
  opts: { mostrarDireccion: boolean; zona?: string | null }
): Promise<FichaPropiedadPDFData> {
  const { contacto, ciudad, registro } = await cargarDatosFicha()
  const fotosBytes = await cargarFotosBytes(fotos)
  const direccion = opts.mostrarDireccion
    ? p.direccion
    : (opts.zona && opts.zona.trim()) || ciudad
  return {
    registro,
    ciudad,
    fecha: new Date().toISOString().slice(0, 10),
    tituloOferta: tituloOferta(p.disponible_para),
    direccion,
    tipo: p.tipo,
    precios: preciosDe(p),
    estadoOferta: p.estado_oferta !== 'disponible' ? ESTADO_OFERTA_LABEL[p.estado_oferta] : null,
    ambientes: p.ambientes,
    dormitorios: p.dormitorios,
    banos: p.banos,
    superficieM2: p.superficie_m2,
    cochera: p.cochera,
    descripcion: p.descripcion_publicacion,
    fotos: fotosBytes,
    contacto
  }
}

export function nombreFichaArchivo(p: Propiedad): string {
  const slug = (p.direccion || 'propiedad')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40)
  return `ficha-${slug || 'propiedad'}.pdf`
}

// Genera y descarga la ficha en el navegador.
export async function descargarFicha(
  p: Propiedad,
  fotos: FotoPropiedad[],
  opts: { mostrarDireccion: boolean; zona?: string | null }
): Promise<void> {
  const data = await armarDatosFicha(p, fotos, opts)
  const bytes = await buildFichaPropiedadPDF(data)
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreFichaArchivo(p)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Sube la ficha al bucket (upsert) y devuelve su path + URL firmada de descarga.
export async function subirFichaYFirmar(
  p: Propiedad,
  fotos: FotoPropiedad[],
  opts: { mostrarDireccion: boolean; zona?: string | null }
): Promise<{ path?: string; url?: string; error?: string }> {
  const data = await armarDatosFicha(p, fotos, opts)
  const bytes = await buildFichaPropiedadPDF(data)
  const path = `fichas/${p.id}.pdf`
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const up = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true })
  if (up.error) return { error: up.error.message }
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 7 * 24 * 3600, { download: nombreFichaArchivo(p) })
  return { path, url: signed?.signedUrl ?? undefined }
}

// Envía la ficha por email (Resend con adjunto) vía Edge Function.
export async function enviarFichaEmail(
  p: Propiedad,
  path: string,
  to: string
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('enviar-ficha', {
    body: {
      pdf_path: path,
      to,
      direccion: p.direccion,
      titulo: tituloOferta(p.disponible_para)
    }
  })
  if (error) {
    let detail = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.text === 'function') {
        const parsed = JSON.parse(await ctx.text())
        if (parsed?.error) detail = parsed.error
      }
    } catch {
      /* noop */
    }
    return { ok: false, error: detail }
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo enviar' }
  return { ok: true }
}
