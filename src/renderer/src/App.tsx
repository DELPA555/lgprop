import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { DatabaseZap, LogOut, ShieldAlert, Loader2 } from 'lucide-react'
import Layout from './components/layout/Layout'
import UpdateNotice from './components/UpdateNotice'
import { ToastProvider } from './components/ui/Toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { isSupabaseConfigured } from './lib/supabase/client'
// Login va antes del gate de autenticación: se mantiene eager para no mostrar
// un parpadeo de carga en la pantalla de ingreso.
import Login from './pages/Login'

// Resto de los módulos: carga diferida por ruta (code-splitting). Antes los 25
// módulos + pdf-lib + pdfjs entraban al bundle inicial (~3,3 MB en un solo .js);
// ahora cada pantalla trae su propio chunk al abrirse por primera vez, y el
// arranque de la app es mucho más liviano.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Duenos = lazy(() => import('./pages/Duenos'))
const Inquilinos = lazy(() => import('./pages/Inquilinos'))
const Propiedades = lazy(() => import('./pages/Propiedades'))
const PropiedadDetalle = lazy(() => import('./pages/PropiedadDetalle'))
const Contratos = lazy(() => import('./pages/Contratos'))
const Mantenimiento = lazy(() => import('./pages/Mantenimiento'))
const Indices = lazy(() => import('./pages/Indices'))
const Actualizaciones = lazy(() => import('./pages/Actualizaciones'))
const Pagos = lazy(() => import('./pages/Pagos'))
const Liquidaciones = lazy(() => import('./pages/Liquidaciones'))
const Equipo = lazy(() => import('./pages/Equipo'))
const Ajustes = lazy(() => import('./pages/Ajustes'))
const Actividad = lazy(() => import('./pages/Actividad'))
const Consorcios = lazy(() => import('./pages/Consorcios'))
const ConsorcioDetalle = lazy(() => import('./pages/ConsorcioDetalle'))
const Tareas = lazy(() => import('./pages/Tareas'))
const Prospectos = lazy(() => import('./pages/Prospectos'))
const Interesados = lazy(() => import('./pages/Interesados'))
const Agenda = lazy(() => import('./pages/Agenda'))
const Visitas = lazy(() => import('./pages/Visitas'))
const Contabilidad = lazy(() => import('./pages/Contabilidad'))
const Sociedad = lazy(() => import('./pages/Sociedad'))
const RecibosReserva = lazy(() => import('./pages/RecibosReserva'))
const Cartera = lazy(() => import('./pages/Cartera'))

function RouteFallback(): JSX.Element {
  return (
    <div className="flex items-center justify-center py-20 text-zinc-500">
      <Loader2 size={20} className="animate-spin" />
    </div>
  )
}

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
  const { isAdmin, isSocio } = useAuth()
  return (
    <Layout>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/propiedades" element={<Propiedades />} />
        <Route path="/propiedades/:id" element={<PropiedadDetalle />} />
        <Route path="/mantenimiento" element={<Mantenimiento />} />
        <Route path="/tareas" element={<Tareas />} />
        <Route path="/prospectos" element={<Prospectos />} />
        <Route path="/interesados" element={<Interesados />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/visitas" element={<Visitas />} />
        <Route path="/duenos" element={<Duenos />} />
        <Route path="/inquilinos" element={<Inquilinos />} />
        <Route path="/contratos" element={<Contratos />} />
        <Route path="/recibos-reserva" element={<RecibosReserva />} />
        <Route path="/cartera" element={<Cartera />} />
        <Route path="/actualizaciones" element={<Actualizaciones />} />
        <Route path="/indices" element={<Indices />} />
        <Route path="/pagos" element={<Pagos />} />
        <Route path="/liquidaciones" element={<Liquidaciones />} />
        <Route path="/consorcios" element={<Consorcios />} />
        <Route path="/consorcios/:id" element={<ConsorcioDetalle />} />
        <Route
          path="/contabilidad"
          element={isAdmin ? <Contabilidad /> : <Navigate to="/" replace />}
        />
        <Route path="/sociedad" element={isSocio ? <Sociedad /> : <Navigate to="/" replace />} />
        <Route path="/equipo" element={isAdmin ? <Equipo /> : <Navigate to="/" replace />} />
        <Route path="/ajustes" element={isAdmin ? <Ajustes /> : <Navigate to="/" replace />} />
        <Route
          path="/actividad"
          element={isAdmin ? <Actividad /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Dashboard />} />
      </Routes>
      </Suspense>
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
