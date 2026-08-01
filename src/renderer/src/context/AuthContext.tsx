import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import type { UsuarioEquipo, Socio } from '@/types/database'

interface AuthCtx {
  session: Session | null
  member: UsuarioEquipo | null
  socio: Socio | null
  loading: boolean
  isAdmin: boolean
  isSocio: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshMember: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [member, setMember] = useState<UsuarioEquipo | null>(null)
  const [socio, setSocio] = useState<Socio | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMember = useCallback(async (uid: string | undefined): Promise<void> => {
    if (!uid) {
      setMember(null)
      setSocio(null)
      return
    }
    const { data } = await supabase
      .from('usuarios_equipo')
      .select('*')
      .eq('auth_user_id', uid)
      .maybeSingle()
    setMember(data ?? null)
    // ¿Este usuario es socio del negocio? (info financiera privada entre dueños)
    if (data?.id) {
      const { data: s } = await supabase
        .from('socios')
        .select('*')
        .eq('usuario_equipo_id', data.id)
        .eq('activo', true)
        .maybeSingle()
      setSocio(s ?? null)
    } else {
      setSocio(null)
    }
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await fetchMember(data.session?.user?.id)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      void fetchMember(s?.user?.id)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [fetchMember])

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      return error ? { error: error.message } : {}
    },
    []
  )

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut()
    setMember(null)
    setSocio(null)
  }, [])

  const value: AuthCtx = {
    session,
    member,
    socio,
    loading,
    isAdmin: member?.rol === 'admin' && member?.activo === true,
    isSocio: !!socio && member?.activo === true,
    signIn,
    signOut,
    refreshMember: () => fetchMember(session?.user?.id)
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
