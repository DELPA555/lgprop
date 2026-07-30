// Gestión de archivos de contratos en Supabase Storage (bucket privado).
import { supabase } from '@/lib/supabase/client'
import type { ContratoArchivo } from '@/types/database'

export const BUCKET = 'contratos-archivos'

const sanitize = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120)

// Sube un archivo al bucket y registra su metadato asociado al contrato.
export async function subirArchivo(contratoId: string, file: File): Promise<{ error?: string }> {
  const path = `${contratoId}/${Date.now()}-${sanitize(file.name)}`
  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false
  })
  if (up.error) return { error: up.error.message }
  const { data: userData } = await supabase.auth.getUser()
  const ins = await supabase.from('contratos_archivos').insert({
    contrato_id: contratoId,
    nombre: file.name,
    path,
    tipo: file.type || null,
    tamano: file.size,
    subido_por: userData?.user?.id ?? null
  })
  if (ins.error) {
    // rollback del archivo si falla el metadato
    await supabase.storage.from(BUCKET).remove([path])
    return { error: ins.error.message }
  }
  return {}
}

// Lista los archivos de un conjunto de contratos, agrupados por contrato_id.
export async function listarArchivosPorContratos(
  contratoIds: string[]
): Promise<Record<string, ContratoArchivo[]>> {
  const out: Record<string, ContratoArchivo[]> = {}
  if (contratoIds.length === 0) return out
  const { data } = await supabase
    .from('contratos_archivos')
    .select('*')
    .in('contrato_id', contratoIds)
    .order('created_at', { ascending: false })
  for (const a of data ?? []) {
    ;(out[a.contrato_id] ??= []).push(a)
  }
  return out
}

// URL firmada temporal (bucket privado). download=true fuerza la descarga.
export async function urlFirmada(
  path: string,
  opts?: { download?: string }
): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600, opts?.download ? { download: opts.download } : undefined)
  return data?.signedUrl ?? null
}

export async function borrarArchivo(a: ContratoArchivo): Promise<{ error?: string }> {
  const rm = await supabase.storage.from(BUCKET).remove([a.path])
  if (rm.error) return { error: rm.error.message }
  const del = await supabase.from('contratos_archivos').delete().eq('id', a.id)
  if (del.error) return { error: del.error.message }
  return {}
}
