// Extrae el mensaje de error "real" de una Edge Function invocada con
// supabase.functions.invoke(). Cuando la función responde con un status ≠ 2xx,
// supabase-js devuelve un FunctionsHttpError con mensaje genérico y deja el body
// JSON (donde vive nuestro { ok:false, error }) en `error.context` (un Response).
export async function edgeErrorMessage(error: unknown, fallback = 'Error inesperado'): Promise<string> {
  if (!error) return fallback
  const e = error as { message?: string; context?: unknown }
  const ctx = e.context as { json?: () => Promise<unknown> } | undefined
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = (await ctx.json()) as { error?: string } | null
      if (body?.error) return body.error
    } catch {
      // el body no era JSON o ya se consumió; caemos al mensaje genérico
    }
  }
  return e.message || fallback
}
