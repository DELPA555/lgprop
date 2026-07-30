import { useEffect, useState } from 'react'
import { Loader2, Download, FileWarning } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { urlFirmada } from '@/lib/contratoArchivos'
import type { ContratoArchivo } from '@/types/database'

export default function ArchivoPreviewModal({
  open,
  archivo,
  onClose
}: {
  open: boolean
  archivo: ContratoArchivo | null
  onClose: () => void
}): JSX.Element {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !archivo) return
    setLoading(true)
    setUrl(null)
    urlFirmada(archivo.path).then((u) => {
      setUrl(u)
      setLoading(false)
    })
  }, [open, archivo])

  const descargar = async (): Promise<void> => {
    if (!archivo) return
    const u = await urlFirmada(archivo.path, { download: archivo.nombre })
    if (u) window.open(u, '_blank')
  }

  const tipo = archivo?.tipo ?? ''
  const nombre = archivo?.nombre ?? ''
  const isImg = tipo.startsWith('image/')
  const isPdf = tipo === 'application/pdf' || nombre.toLowerCase().endsWith('.pdf')

  return (
    <Modal
      open={open}
      title={nombre || 'Archivo'}
      onClose={onClose}
      wide
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
          >
            Cerrar
          </button>
          <button onClick={descargar} className="btn-primary text-sm flex items-center gap-2">
            <Download size={15} /> Descargar
          </button>
        </>
      }
    >
      <div className="min-h-[50vh] flex items-center justify-center">
        {loading || !url ? (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 size={18} className="animate-spin" /> Cargando archivo…
          </div>
        ) : isImg ? (
          <img
            src={url}
            alt={nombre}
            className="max-w-full max-h-[70vh] rounded-lg object-contain"
          />
        ) : isPdf ? (
          <iframe src={url} title={nombre} className="w-full h-[70vh] rounded-lg bg-white" />
        ) : (
          <div className="text-center text-zinc-400 text-sm">
            <FileWarning size={28} className="mx-auto mb-2 text-zinc-500" />
            No se puede previsualizar este tipo de archivo.
            <br />
            Usá “Descargar” para abrirlo.
          </div>
        )}
      </div>
    </Modal>
  )
}
