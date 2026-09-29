// Gestor de fotos de una propiedad: subir varias, reordenar, marcar portada y
// eliminar. Se usa dentro de la sección Publicación de PropiedadDetalle.
import { useEffect, useRef, useState } from 'react'
import { Upload, Star, Trash2, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import type { FotoPropiedad } from '@/types/database'
import {
  listarFotos,
  subirFoto,
  borrarFoto,
  marcarPortada,
  guardarOrden,
  urlsFirmadasFotos
} from '@/lib/fotosPropiedad'
import { useToast } from '@/components/ui/Toast'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

export default function FotosManager({
  propiedadId,
  onChange
}: {
  propiedadId: string
  onChange?: (fotos: FotoPropiedad[]) => void
}): JSX.Element {
  const toast = useToast()
  const [fotos, setFotos] = useState<FotoPropiedad[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [subiendo, setSubiendo] = useState(false)
  const [delTarget, setDelTarget] = useState<FotoPropiedad | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const cargar = async (): Promise<void> => {
    setLoading(true)
    const fs = await listarFotos(propiedadId)
    setFotos(fs)
    onChange?.(fs)
    if (fs.length) setUrls(await urlsFirmadasFotos(fs.map((f) => f.path)))
    setLoading(false)
  }

  useEffect(() => {
    void cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propiedadId])

  const onFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return
    setSubiendo(true)
    let orden = fotos.length ? Math.max(...fotos.map((f) => f.orden)) + 1 : 0
    const hayPortada = fotos.some((f) => f.es_portada)
    let primeraSubida = fotos.length === 0
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}" no es una imagen`)
        continue
      }
      const { error } = await subirFoto(propiedadId, file, orden, primeraSubida && !hayPortada)
      if (error) toast.error(`No se pudo subir "${file.name}": ${error}`)
      orden++
      primeraSubida = false
    }
    setSubiendo(false)
    if (inputRef.current) inputRef.current.value = ''
    await cargar()
  }

  const mover = async (idx: number, dir: -1 | 1): Promise<void> => {
    const j = idx + dir
    if (j < 0 || j >= fotos.length) return
    const next = [...fotos]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    const conOrden = next.map((f, i) => ({ ...f, orden: i }))
    setFotos(conOrden)
    onChange?.(conOrden)
    const { error } = await guardarOrden(conOrden.map((f) => ({ id: f.id, orden: f.orden, es_portada: f.es_portada })))
    if (error) {
      toast.error('No se pudo guardar el orden')
      void cargar()
    }
  }

  const portada = async (foto: FotoPropiedad): Promise<void> => {
    const { error } = await marcarPortada(propiedadId, foto.id)
    if (error) return toast.error('No se pudo marcar la portada')
    await cargar()
  }

  const eliminar = async (): Promise<void> => {
    if (!delTarget) return
    const { error } = await borrarFoto(delTarget)
    setDelTarget(null)
    if (error) return toast.error('No se pudo eliminar la foto')
    await cargar()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-ink-2">
          {fotos.length} foto{fotos.length === 1 ? '' : 's'}
          {fotos.length > 0 && ' · la marcada con ★ es la portada'}
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="btn-ghost text-sm flex items-center gap-2"
        >
          {subiendo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {subiendo ? 'Subiendo…' : 'Subir fotos'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>

      {loading ? (
        <p className="text-sm text-ink-3">Cargando fotos…</p>
      ) : fotos.length === 0 ? (
        <p className="text-sm text-ink-3">
          Todavía no hay fotos. Subí imágenes para mostrar la propiedad en la Cartera y en la ficha.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {fotos.map((f, idx) => (
            <div key={f.id} className="relative group rounded-lg overflow-hidden border border-border bg-surface">
              {urls[f.path] ? (
                <img src={urls[f.path]} alt="" className="w-full h-28 object-cover" />
              ) : (
                <div className="w-full h-28 flex items-center justify-center text-ink-3 text-xs">sin vista</div>
              )}
              {f.es_portada && (
                <span className="absolute top-1.5 left-1.5 chip chip-ok !py-0 !px-1.5 text-[10px]">
                  <Star size={10} /> Portada
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex gap-1">
                  <button type="button" onClick={() => void mover(idx, -1)} disabled={idx === 0}
                    className="p-1 text-white/90 hover:text-white disabled:opacity-30" title="Mover izquierda">
                    <ArrowLeft size={14} />
                  </button>
                  <button type="button" onClick={() => void mover(idx, 1)} disabled={idx === fotos.length - 1}
                    className="p-1 text-white/90 hover:text-white disabled:opacity-30" title="Mover derecha">
                    <ArrowRight size={14} />
                  </button>
                </div>
                <div className="flex gap-1">
                  {!f.es_portada && (
                    <button type="button" onClick={() => void portada(f)}
                      className="p-1 text-white/90 hover:text-amber-300" title="Marcar como portada">
                      <Star size={14} />
                    </button>
                  )}
                  <button type="button" onClick={() => setDelTarget(f)}
                    className="p-1 text-white/90 hover:text-red-400" title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        title="Eliminar foto"
        message="¿Eliminar esta foto de la propiedad? No se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => void eliminar()}
        onClose={() => setDelTarget(null)}
      />
    </div>
  )
}
