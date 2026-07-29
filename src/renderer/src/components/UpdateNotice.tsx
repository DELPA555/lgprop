import { useEffect, useState } from 'react'
import { Download, RefreshCw, X, Loader2 } from 'lucide-react'

type State = 'idle' | 'available' | 'downloaded'

// Aviso de actualización automática. Escucha los eventos que emite el proceso
// principal (electron-updater) y muestra un banner simple:
//   - "available"  → se está descargando en segundo plano.
//   - "downloaded" → lista; botón para reiniciar y aplicarla.
export default function UpdateNotice(): JSX.Element | null {
  const [state, setState] = useState<State>('idle')
  const [version, setVersion] = useState('')
  const [dismissed, setDismissed] = useState(false)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    const api = window.lgprop
    if (!api?.onUpdateAvailable) return
    const offA = api.onUpdateAvailable((i) => {
      setVersion(i.version)
      setState('available')
      setDismissed(false)
    })
    const offD = api.onUpdateDownloaded((i) => {
      setVersion(i.version)
      setState('downloaded')
      setDismissed(false)
    })
    return () => {
      offA?.()
      offD?.()
    }
  }, [])

  if (state === 'idle' || dismissed) return null

  const ready = state === 'downloaded'

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-80 card p-4 shadow-2xl border border-border">
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 shrink-0 ${ready ? 'text-emerald-400' : 'text-sky-400'}`}
        >
          {ready ? <RefreshCw size={18} /> : <Download size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">
            {ready ? 'Actualización lista' : 'Actualización disponible'}
            {version ? <span className="text-zinc-500 font-normal"> · v{version}</span> : null}
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            {ready
              ? 'Reiniciá la app para aplicar la nueva versión.'
              : 'Se está descargando en segundo plano. Se instalará al reiniciar.'}
          </p>

          {ready && (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => {
                  setRestarting(true)
                  void window.lgprop.restartToUpdate()
                }}
                disabled={restarting}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                {restarting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {restarting ? 'Reiniciando…' : 'Reiniciar ahora'}
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="text-xs text-zinc-400 hover:text-white px-2 py-1"
              >
                Más tarde
              </button>
            </div>
          )}
        </div>
        {!ready && (
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 text-zinc-500 hover:text-white"
            title="Ocultar"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
