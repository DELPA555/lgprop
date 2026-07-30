import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // No tiramos error para que la app abra igual y muestre un aviso de configuración,
  // pero dejamos rastro en consola.
  console.warn(
    '[LG Prop] Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copiá .env.example a .env y completá las credenciales de Supabase.'
  )
}

// En Electron persistimos la sesión con almacenamiento cifrado (safeStorage) vía
// el proceso principal, en lugar de localStorage (que bajo file:// no es confiable).
// Fuera de Electron (dev en navegador) usamos el storage por defecto.
const bridge = typeof window !== 'undefined' ? window.lgprop?.session : undefined
const secureStorage = bridge
  ? {
      getItem: (key: string): Promise<string | null> => bridge.getItem(key),
      setItem: (key: string, value: string): Promise<void> => bridge.setItem(key, value),
      removeItem: (key: string): Promise<void> => bridge.removeItem(key)
    }
  : undefined

export const supabase = createClient<Database>(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    ...(secureStorage ? { storage: secureStorage } : {})
  }
})

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
