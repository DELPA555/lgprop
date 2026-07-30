import { Routes, Route, Navigate } from 'react-router-dom'
import { DatabaseZap, LogOut, ShieldAlert, Loader2 } from 'lucide-react'
import Layout from './components/layout/Layout'
import UpdateNotice from './components/UpdateNotice'
import { ToastProvider } from './components/ui/Toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { isSupabaseConfigured } from './lib/supabase/client'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Duenos from './pages/Duenos'
import Inquilinos from './pages/Inquilinos'
import Propiedades from './pages/Propiedades'
import PropiedadDetalle from './pages/PropiedadDetalle'
import Contratos from './pages/Contratos'
import Mantenimiento from './pages/Mantenimiento'
import Indices from './pages/Indices'
import Actualizaciones from './pages/Actualizaciones'
import Pagos from './pages/Pagos'
import Liquidaciones from './pages/Liquidaciones'
import Equipo from './pages/Equipo'
import Ajustes from './pages/Ajustes'
import Actividad from './pages/Actividad'
import Consorcios from './pages/Consorcios'
import ConsorcioDetalle from './pages/ConsorcioDetalle'
import Tareas from './pages/Tareas'
import Prospectos from './pages/Prospectos'
import Agenda from './pages/Agenda'

function FullScreenConfig(): JSX.Element {
  return (
    <div className="h-screen w-screen bg-surface flex items-center justify-center p-4">
      <div className="card p-8 max-w-md text-center">
        <DatabaseZap className="text-amber-400 mx-auto mb-4" size={32} />
        <h1 className="text-lg font-semibold text-white">Falta configurar Supabase</h1>
        <p className="text-sm text-zinc-400 mt-2">
          Copiá <code className="text-zinc-300">.env.example</code> a{' '}
          <code className="text-zinc-300">.env</code>, completá{' '}
          <code className="text-zinc-300">VITE_SUPABASE_URL</code> y{' '}
          <code className="text-zinc-300">VITE_SUPABASE_ANON_KEY</code>, y reiniciá la app.
        </p>
      </div>
    </div>
  )
}

function SinAcceso(): JSX.Element {
  const { session, signOut } = useAuth()
  return (
    <div className="h-screen w-screen bg-surface flex items-center justify-center p-4">
      <div className="card p-8 max-w-md text-center">
        <ShieldAlert className="text-amber-400 mx-auto mb-4" size={32} />
        <h1 className="text-lg font-semibold text-white">Cuenta sin acceso</h1>
        <p className="text-sm text-zinc-400 mt-2">
          Iniciaste sesión como <span className="text-zinc-200">{session?.user?.email}</span>, pero
          tu cuenta todavía no está habilitada en el equipo (o fue desactivada). Pedile a un
          administrador que te dé de alta.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-5 inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white border border-border rounded-lg px-4 py-2"
        >
          <LogOut size={15} /> Cerrar sesión
        </button>
      </div>
    </div>
  )
}

function AppRoutes(): JSX.Element {
  const { isAdmin } = useAuth()
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/propiedades" element={<Propiedades />} />
        <Route path="/propiedades/:id" element={<PropiedadDetalle />} />
        <Route path="/mantenimiento" element={<Mantenimiento />} />
        <Route path="/tareas" element={<Tareas />} />
        <Route path="/prospectos" element={<Prospectos />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/duenos" element={<Duenos />} />
        <Route path="/inquilinos" element={<Inquilinos />} />
        <Route path="/contratos" element={<Contratos />} />
        <Route path="/actualizaciones" element={<Actualizaciones />} />
        <Route path="/indices" element={<Indices />} />
        <Route path="/pagos" element={<Pagos />} />
        <Route path="/liquidaciones" element={<Liquidaciones />} />
        <Route path="/consorcios" element={<Consorcios />} />
        <Route path="/consorcios/:id" element={<ConsorcioDetalle />} />
        <Route path="/equipo" element={isAdmin ? <Equipo /> : <Navigate to="/" replace />} />
        <Route path="/ajustes" element={isAdmin ? <Ajustes /> : <Navigate to="/" replace />} />
        <Route
          path="/actividad"
          element={isAdmin ? <Actividad /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </Layout>
  )
}

function Gate(): JSX.Element {
  const { session, member, loading } = useAuth()

  if (!isSupabaseConfigured) return <FullScreenConfig />
  if (loading) {
    return (
      <div className="h-screen w-screen bg-surface flex items-center justify-center">
        <Loader2 className="text-zinc-500 animate-spin" size={24} />
      </div>
    )
  }
  if (!session) return <Login />
  if (!member || !member.activo) return <SinAcceso />
  return <AppRoutes />
}

export default function App(): JSX.Element {
  return (
    <ToastProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
      <UpdateNotice />
    </ToastProvider>
  )
}
