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
  Settings,
  ScrollText,
  LogOut,
  Home,
  Building,
  CheckSquare,
  Contact,
  CalendarDays,
  CalendarCheck,
  Landmark,
  Handshake
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

type NavItem = {
  to: string
  label: string
  Icon: typeof LayoutDashboard
  end?: boolean
  adminOnly?: boolean
  socioOnly?: boolean
}
type NavGroup = { title: string | null; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    title: null,
    items: [{ to: '/', label: 'Dashboard', Icon: LayoutDashboard, end: true }]
  },
  {
    title: 'Operación',
    items: [
      { to: '/propiedades', label: 'Propiedades', Icon: Building2 },
      { to: '/duenos', label: 'Dueños', Icon: Users },
      { to: '/inquilinos', label: 'Inquilinos', Icon: UserSquare2 },
      { to: '/contratos', label: 'Contratos', Icon: FileText },
      { to: '/mantenimiento', label: 'Mantenimiento', Icon: Wrench },
      { to: '/prospectos', label: 'Prospectos', Icon: Contact },
      { to: '/visitas', label: 'Visitas', Icon: CalendarCheck },
      { to: '/agenda', label: 'Agenda', Icon: CalendarDays },
      { to: '/tareas', label: 'Tareas', Icon: CheckSquare }
    ]
  },
  {
    title: 'Finanzas',
    items: [
      { to: '/pagos', label: 'Pagos', Icon: Wallet },
      { to: '/liquidaciones', label: 'Liquidaciones', Icon: HandCoins },
      { to: '/actualizaciones', label: 'Actualizaciones', Icon: Calculator },
      { to: '/indices', label: 'Índices', Icon: TrendingUp },
      { to: '/contabilidad', label: 'Contabilidad', Icon: Landmark, adminOnly: true },
      { to: '/sociedad', label: 'Sociedad', Icon: Handshake, socioOnly: true }
    ]
  },
  {
    title: 'Consorcios',
    items: [{ to: '/consorcios', label: 'Consorcios', Icon: Building }]
  },
  {
    title: 'Sistema',
    items: [
      { to: '/equipo', label: 'Equipo', Icon: ShieldCheck, adminOnly: true },
      { to: '/actividad', label: 'Actividad', Icon: ScrollText, adminOnly: true },
      { to: '/ajustes', label: 'Ajustes', Icon: Settings, adminOnly: true }
    ]
  }
]

export default function Sidebar(): JSX.Element {
  const { member, isAdmin, isSocio, signOut } = useAuth()
  const [version, setVersion] = useState('')
  useEffect(() => {
    window.lgprop
      ?.getVersion?.()
      .then(setVersion)
      .catch(() => {})
  }, [])

  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => (!i.adminOnly || isAdmin) && (!i.socioOnly || isSocio))
  })).filter((g) => g.items.length > 0)

  return (
    <aside className="w-60 shrink-0 h-full bg-[#080a0e] border-r border-border flex flex-col">
      {/* Marca */}
      <div className="px-5 py-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
          <Home size={18} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="font-display font-bold text-[17px] text-ink leading-none tracking-tight">
            LG Prop
          </div>
          <div className="text-[10px] text-ink-3 uppercase tracking-[0.18em] mt-1">
            Alquileres
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto pb-3 px-2.5 space-y-4">
        {groups.map((g, gi) => (
          <div key={g.title ?? `top-${gi}`} className="space-y-0.5">
            {g.title && (
              <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
                {g.title}
              </div>
            )}
            {g.items.map(({ to, label, Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-accent/12 text-accent font-medium ring-1 ring-inset ring-accent/25'
                      : 'text-ink-2 hover:text-ink hover:bg-white/[0.04]'
                  }`
                }
              >
                <Icon size={17} strokeWidth={2} />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-border">
        {member && (
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-border flex items-center justify-center text-xs font-semibold text-ink-2 shrink-0">
                {member.nombre?.trim()?.charAt(0)?.toUpperCase() ?? '·'}
              </div>
              <div className="min-w-0">
                <div className="text-xs text-ink truncate">{member.nombre}</div>
                <div className="text-[10px] text-ink-3 capitalize">{member.rol}</div>
              </div>
            </div>
            <button
              onClick={() => signOut()}
              className="p-1.5 rounded-md text-ink-3 hover:text-bad hover:bg-white/5 shrink-0 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={15} />
            </button>
          </div>
        )}
        <div className="text-[10px] text-ink-3/70 px-1 num">
          {version ? `v${version} · ` : ''}LG Prop
        </div>
      </div>
    </aside>
  )
}
