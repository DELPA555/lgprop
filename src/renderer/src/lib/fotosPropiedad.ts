// Storage de las fotos de propiedades (bucket privado 'fotos-propiedades',
// mismo patrón que contratos-archivos) + metadatos en la tabla fotos_propiedad.
import { supabase } from '@/lib/supabase/client'
import type { FotoPropiedad } from '@/types/database'

export const BUCKET = 'fotos-propiedades'

function extDe(nombre: string, tipo: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(nombre)
  if (m) return m[1].toLowerCase()
  if (tipo.includes('png')) return 'png'
  if (tipo.includes('webp')) return 'webp'
  return 'jpg'
}

// Sube una foto y crea su fila. orden = al final; es_portada = true si es la primera.
export async function subirFoto(
  propiedadId: string,
  file: File,
  ordenInicial: number,
  esPortada: boolean
): Promise<{ foto?: FotoPropiedad; error?: string }> {
  const ext = extDe(file.name, file.type)
  const path = `${propiedadId}/${crypto.randomUUID()}.${ext}`
  const up = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  if (up.error) return { error: up.error.message }

  let userId: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    userId = data.user?.id ?? null
  } catch {
    /* noop */
  }

  const ins = await supabase
    .from('fotos_propiedad')
    .insert({
      propiedad_id: propiedadId,
      path,
      orden: ordenInicial,
      es_portada: esPortada,
      subido_por: userId
    })
    .select('*')
    .single()
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path])
    return { error: ins.error.message }
  }
  return { foto: ins.data as FotoPropiedad }
}

export async function listarFotos(propiedadId: string): Promise<FotoPropiedad[]> {
  const { data } = await supabase
    .from('fotos_propiedad')
    .select('*')
    .eq('propiedad_id', propiedadId)
    .order('orden', { ascending: true })
  return (data ?? []) as FotoPropiedad[]
}

// Fotos de varias propiedades de una (para la grilla de cartera). Devuelve un
// mapa propiedad_id → fotos ordenadas.
export async function listarFotosDe(
  propiedadIds: string[]
): Promise<Record<string, FotoPropiedad[]>> {
  const out: Record<string, FotoPropiedad[]> = {}
  if (propiedadIds.length === 0) return out
  const { data } = await supabase
    .from('fotos_propiedad')
    .select('*')
    .in('propiedad_id', propiedadIds)
    .order('orden', { ascending: true })
  for (const f of (data ?? []) as FotoPropiedad[]) {
    ;(out[f.propiedad_id] ??= []).push(f)
  }
  return out
}

export async function urlFirmadaFoto(
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn)
  return data?.signedUrl ?? null
}

// Firma varias rutas de una (createSignedUrls); devuelve mapa path → url.
export async function urlsFirmadasFotos(
  paths: string[],
  expiresIn = 3600
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (paths.length === 0) return out
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn)
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) out[item.path] = item.signedUrl
  }
  return out
}

export async function borrarFoto(foto: FotoPropiedad): Promise<{ error?: string }> {
  const del = await supabase.from('fotos_propiedad').delete().eq('id', foto.id)
  if (del.error) return { error: del.error.message }
  await supabase.storage.from(BUCKET).remove([foto.path])
  return {}
}

// Persiste el nuevo orden (y, si se pasa, la portada) de un set de fotos.
export async function guardarOrden(
  fotos: { id: string; orden: number; es_portada: boolean }[]
): Promise<{ error?: string }> {
  for (const f of fotos) {
    const { error } = await supabase
      .from('fotos_propiedad')
      .update({ orden: f.orden, es_portada: f.es_portada })
      .eq('id', f.id)
    if (error) return { error: error.message }
  }
  return {}
}

// Marca una foto como portada (y desmarca las demás de la propiedad).
export async function marcarPortada(
  propiedadId: string,
  fotoId: string
): Promise<{ error?: string }> {
  const off = await supabase
    .from('fotos_propiedad')
    .update({ es_portada: false })
    .eq('propiedad_id', propiedadId)
  if (off.error) return { error: off.error.message }
  const on = await supabase.from('fotos_propiedad').update({ es_portada: true }).eq('id', fotoId)
  if (on.error) return { error: on.error.message }
  return {}
}

// Devuelve la foto de portada (o la primera por orden) de un set.
export function portadaDe(fotos: FotoPropiedad[]): FotoPropiedad | null {
  if (fotos.length === 0) return null
  return fotos.find((f) => f.es_portada) ?? fotos[0]
}
