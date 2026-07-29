import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Users,
  UserSquare2,
  FileText,
  Calculator,
  TrendingUp,
  Wallet,
  HandCoins,
  Wrench,
  ShieldCheck,
  LogOut
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

const NAV = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, end: true, adminOnly: false },
  { to: '/propiedades', label: 'Propiedades', Icon: Building2, adminOnly: false },
  { to: '/duenos', label: 'Dueños', Icon: Users, adminOnly: false },
  { to: '/inquilinos', label: 'Inquilinos', Icon: UserSquare2, adminOnly: false },
  { to: '/mantenimiento', label: 'Mantenimiento', Icon: Wrench, adminOnly: false },
  { to: '/contratos', label: 'Contratos', Icon: FileText, adminOnly: false },
  { to: '/actualizaciones', label: 'Actualizaciones', Icon: Calculator, adminOnly: false },
  { to: '/indices', label: 'Índices', Icon: TrendingUp, adminOnly: false },
  { to: '/pagos', label: 'Pagos', Icon: Wallet, adminOnly: false },
  { to: '/liquidaciones', label: 'Liquidaciones', Icon: HandCoins, adminOnly: false },
  { to: '/equipo', label: 'Equipo', Icon: ShieldCheck, adminOnly: true }
]

export default function Sidebar(): JSX.Element {
  const { member, isAdmin, signOut } = useAuth()
  const nav = NAV.filter((n) => !n.adminOnly || isAdmin)
  const [version, setVersion] = useState('')
  useEffect(() => {
    window.lgprop?.getVersion?.().then(setVersion).catch(() => {})
  }, [])
  return (
    <aside className="w-56 shrink-0 h-full bg-[#0a0c11] border-r border-border flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <div className="text-white font-bold text-lg tracking-tight">LG Prop</div>
        <div className="text-[11px] text-zinc-500 uppercase tracking-widest mt-0.5">
          Administración de alquileres
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {nav.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors border-l-2 ${
                isActive
                  ? 'bg-accent/10 border-accent text-accent font-medium'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border-transparent'
              }`
            }
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-border">
        {member && (
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <div className="min-w-0">
              <div className="text-xs text-zinc-200 truncate">{member.nombre}</div>
              <div className="text-[10px] text-zinc-600 capitalize">{member.rol}</div>
            </div>
            <button
              onClick={() => signOut()}
              className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-white/5 shrink-0"
              title="Cerrar sesión"
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
        <div className="text-[10px] text-zinc-700 px-1">
          {version ? `v${version} · ` : ''}LG Prop
        </div>
      </div>
    </aside>
  )
}
