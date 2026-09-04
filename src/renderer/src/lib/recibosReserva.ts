// Storage de los PDF de recibos de reserva (bucket privado, mismo patrón que
// contratos-archivos) + helper para reconstruir los datos de PDF desde una fila.
import { supabase } from '@/lib/supabase/client'
import type { ReciboReserva } from '@/types/database'
import type { ReciboReservaPDFData } from '@/lib/reciboReservaPdf'

export const BUCKET = 'recibos-reserva'

export function nombreArchivo(r: Pick<ReciboReserva, 'numero' | 'tipo'>): string {
  return `recibo-reserva-${r.tipo}-${String(r.numero).padStart(6, '0')}.pdf`
}

// Sube (o reemplaza) el PDF del recibo y devuelve su path en el bucket.
export async function subirReciboPdf(
  reciboId: string,
  numero: number,
  bytes: Uint8Array
): Promise<{ path?: string; error?: string }> {
  const path = `${reciboId}/recibo-${String(numero).padStart(6, '0')}.pdf`
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const up = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'application/pdf',
    upsert: true
  })
  if (up.error) return { error: up.error.message }
  return { path }
}

// URL firmada temporal (bucket privado). download=nombre fuerza la descarga.
export async function urlFirmadaRecibo(
  path: string,
  download?: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn, download ? { download } : undefined)
  return data?.signedUrl ?? null
}

// Envía el recibo por email (Resend, con PDF adjunto) vía Edge Function.
export async function enviarReciboEmail(
  reciboId: string,
  to?: string
): Promise<{ ok: boolean; error?: string; to?: string }> {
  const { data, error } = await supabase.functions.invoke('enviar-recibo', {
    body: { recibo_id: reciboId, to }
  })
  if (error) {
    // El cuerpo de error de la función suele traer el detalle real
    let detail = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.text === 'function') {
        const body = await ctx.text()
        const parsed = JSON.parse(body)
        if (parsed?.error) detail = parsed.error
      }
    } catch {
      /* noop */
    }
    return { ok: false, error: detail }
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo enviar' }
  return { ok: true, to: data.to }
}

export async function borrarReciboPdf(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path])
}

// Reconstruye los datos del PDF a partir de una fila guardada (para reimprimir).
export function pdfDataFromRecibo(r: ReciboReserva): ReciboReservaPDFData {
  return {
    tipo: r.tipo,
    ciudad: r.ciudad,
    fecha: r.fecha,
    numero: `R-${String(r.numero).padStart(6, '0')}`,
    direccion: r.direccion,
    reservanteNombre: r.reservante_nombre,
    reservanteDni: r.reservante_dni,
    reservanteDomicilio: r.reservante_domicilio,
    moneda: r.moneda,
    monto: r.monto,
    plazoMeses: r.plazo_meses,
    canonTotal: r.canon_total,
    montoOperacion: r.monto_operacion,
    clausula: r.clausula,
    registro: r.registro
  }
}
