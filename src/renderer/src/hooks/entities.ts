import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type {
  Propiedad,
  Dueno,
  Inquilino,
  Contrato,
  UsuarioEquipo
} from '@/types/database'

/**
 * Hooks de datos "de referencia" cacheados y compartidos entre pantallas.
 *
 * Varias páginas consultan las mismas tablas (propiedades, dueños, inquilinos,
 * contratos, equipo). Al compartir una sola entrada de caché por tabla, abrir
 * una pantalla "precalienta" las demás: volver a ellas es instantáneo y la
 * revalidación corre en segundo plano. El orden replica el que usaba cada
 * página para no cambiar el comportamiento; el filtrado/orden fino se hace en
 * memoria (los volúmenes son chicos).
 */

const enabled = isSupabaseConfigured

async function fetchAll<T>(table: string, orderCol: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*').order(orderCol)
  if (error) throw error
  return (data ?? []) as T[]
}

export const qk = {
  propiedades: ['propiedades'] as const,
  duenos: ['duenos'] as const,
  inquilinos: ['inquilinos'] as const,
  contratos: ['contratos'] as const,
  equipo: ['usuarios_equipo'] as const
}

export function usePropiedades() {
  return useQuery({
    queryKey: qk.propiedades,
    queryFn: () => fetchAll<Propiedad>('propiedades', 'direccion'),
    enabled
  })
}

export function useDuenos() {
  return useQuery({
    queryKey: qk.duenos,
    queryFn: () => fetchAll<Dueno>('duenos', 'nombre'),
    enabled
  })
}

export function useInquilinos() {
  return useQuery({
    queryKey: qk.inquilinos,
    queryFn: () => fetchAll<Inquilino>('inquilinos', 'nombre'),
    enabled
  })
}

export function useContratos() {
  return useQuery({
    queryKey: qk.contratos,
    queryFn: () => fetchAll<Contrato>('contratos', 'fecha_fin'),
    enabled
  })
}

export function useEquipo() {
  return useQuery({
    queryKey: qk.equipo,
    queryFn: () => fetchAll<UsuarioEquipo>('usuarios_equipo', 'nombre'),
    enabled
  })
}

/**
 * Invalidador: tras crear/editar/borrar, marca las entidades afectadas como
 * "stale" para que se refresquen (y se vean actualizadas en todas las pantallas
 * que las comparten). Reemplaza al viejo `void load()`.
 */
export function useInvalidateEntities() {
  const qc = useQueryClient()
  return (...keys: (readonly string[])[]) => {
    for (const key of keys) void qc.invalidateQueries({ queryKey: key })
  }
}
