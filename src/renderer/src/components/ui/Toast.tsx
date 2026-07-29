import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastCtx {
  toast: (type: ToastType, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const Ctx = createContext<ToastCtx | null>(null)

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}

const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info }
const COLORS = {
  success: 'text-emerald-400 border-emerald-500/30',
  error: 'text-red-400 border-red-500/30',
  info: 'text-blue-400 border-blue-500/30'
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (type: ToastType, message: string) => {
      const id = ++seq.current
      setItems((prev) => [...prev, { id, type, message }])
      setTimeout(() => remove(id), 4000)
    },
    [remove]
  )

  const api: ToastCtx = {
    toast,
    success: (m) => toast('success', m),
    error: (m) => toast('error', m),
    info: (m) => toast('info', m)
  }

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
        {items.map((t) => {
          const Icon = ICONS[t.type]
          return (
            <div
              key={t.id}
              className={`card border ${COLORS[t.type]} px-4 py-3 flex items-start gap-3 shadow-xl`}
            >
              <Icon size={16} className={`${COLORS[t.type].split(' ')[0]} shrink-0 mt-0.5`} />
              <p className="text-sm text-zinc-200 flex-1">{t.message}</p>
              <button onClick={() => remove(t.id)} className="text-zinc-500 hover:text-white">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
