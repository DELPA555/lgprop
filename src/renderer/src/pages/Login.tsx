import { useEffect, useState } from 'react'
import { LogIn, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export default function Login(): JSX.Element {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [recordarme, setRecordarme] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Precargar el último email usado (no la contraseña)
  useEffect(() => {
    window.lgprop?.prefs?.getEmail().then((mail) => {
      if (mail) setEmail(mail)
    })
  }, [])

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    // Definir ANTES del login si la sesión se persiste a disco o no
    await window.lgprop?.session?.setPersist(recordarme)
    const { error } = await signIn(email.trim(), password)
    setLoading(false)
    if (error) {
      setError('No pudimos iniciar sesión. Revisá el email y la contraseña.')
      return
    }
    // Recordar el email solo si el usuario quiere mantener la sesión
    await window.lgprop?.prefs?.setEmail(recordarme ? email.trim() : '')
  }

  return (
    <div className="h-screen w-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-white font-bold text-2xl tracking-tight">LG Prop</div>
          <div className="text-xs text-zinc-500 uppercase tracking-widest mt-1">
            Administración de alquileres
          </div>
        </div>
        <form onSubmit={submit} className="card p-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="label">Contraseña</label>
            <input
              type="password"
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-300 select-none cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-emerald-500"
              checked={recordarme}
              onChange={(e) => setRecordarme(e.target.checked)}
            />
            Mantener sesión iniciada
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            Ingresar
          </button>
        </form>
        <p className="text-center text-[11px] text-zinc-600 mt-4">
          En una PC compartida, desmarcá “Mantener sesión iniciada”.
        </p>
      </div>
    </div>
  )
}
