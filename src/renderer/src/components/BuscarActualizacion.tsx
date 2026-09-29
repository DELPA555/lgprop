import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Loader2, CheckCircle2, Download, AlertTriangle } from 'lucide-react'

// Botón de chequeo MANUAL de actualizaciones (complementa el chequeo automático
// que electron-updater hace al abrir la app y cada 6 h). Dispara
// autoUpdater.checkForUpdates() vía IPC y refleja el resultado escuchando los
// mismos eventos que usa el aviso automático (available / not-available /
// downloaded / error).
type Estado = 'idle' | 'checking' | 'uptodate' | 'downloading' | 'ready' | 'error'

export default function BuscarActualizacion(): JSX.Element {
  const [version, setVersion] = useState('')
  const [estado, setEstado] = useState<Estado>('idle')
  const [nuevaVersion, setNuevaVersion] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [restarting, setRestarting] = useState(false)
  // Sólo reaccionamos a los eventos si el usuario disparó una búsqueda manual,
  // para no pisar el estado con un chequeo automático que ocurra de fondo.
  const buscandoManual = useRef(false)

  useEffect(() => {
    const api = window.lgprop
    api?.getVersion?.().then(setVersion).catch(() => setVersion(''))
    if (!api?.onUpdateAvailable) return
    const offA = api.onUpdateAvailable((i) => {
      if (!buscandoManual.current) return
      setNuevaVersion(i.version)
      setEstado('downloading')
    })
    const offN = api.onUpdateNotAvailable?.(() => {
      if (!buscandoManual.current) return
      setEstado('uptodate')
      buscandoManual.current = false
    })
    const offD = api.onUpdateDownloaded((i) => {
      setNuevaVersion(i.version)
      setEstado('ready')
      buscandoManual.current = false
    })
    const offE = api.onUpdateError?.((e) => {
      if (!buscandoManual.current) return
      setErrorMsg(e.message || 'Error desconocido al buscar la actualización.')
      setEstado('error')
      buscandoManual.current = false
    })
    return () => {
      offA?.()
      offN?.()
      offD?.()
      offE?.()
    }
  }, [])

  const buscar = async (): Promise<void> => {
    setErrorMsg('')
    setNuevaVersion('')
    setEstado('checking')
    buscandoManual.current = true
    try {
      const r = await window.lgprop.checkForUpdates()
      // Si el arranque del chequeo falla (dev, sin conexión, error de red),
      // lo mostramos ya; si arranca OK, el resultado llega por los eventos.
      if (!r?.ok) {
        setErrorMsg(r?.error || 'No se pudo iniciar la búsqueda de actualizaciones.')
        setEstado('error')
        buscandoManual.current = false
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e))
      setEstado('error')
      buscandoManual.current = false
    }
  }

  const ocupado = estado === 'checking' || estado === 'downloading'

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={buscar}
          disabled={ocupado}
          className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60"
        >
          {ocupado ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {estado === 'checking'
            ? 'Buscando actualización…'
            : estado === 'downloading'
              ? 'Descargando…'
              : 'Buscar actualización'}
        </button>
        {version && (
          <span className="text-xs text-zinc-500">
            Versión actual <span className="text-zinc-300 num">v{version}</span>
          </span>
        )}
      </div>

      {estado === 'uptodate' && (
        <p className="text-sm text-emerald-400 flex items-center gap-2">
          <CheckCircle2 size={15} /> Ya tenés la última versión (v{version}).
        </p>
      )}

      {estado === 'downloading' && (
        <p className="text-sm text-sky-400 flex items-center gap-2">
          <Download size={15} /> Actualización disponible
          {nuevaVersion ? ` (v${nuevaVersion})` : ''} → descargando en segundo plano…
        </p>
      )}

      {estado === 'ready' && (
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm text-emerald-400 flex items-center gap-2">
            <CheckCircle2 size={15} /> Actualización lista
            {nuevaVersion ? ` (v${nuevaVersion})` : ''} — reiniciá para aplicarla.
          </p>
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
        </div>
      )}

      {estado === 'error' && (
        <p className="text-sm text-amber-400 flex items-start gap-2">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>No se pudo completar la búsqueda: {errorMsg}</span>
        </p>
      )}
    </div>
  )
}
