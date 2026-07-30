import { useEffect, useRef, useState } from 'react'
import { Loader2, Download, FileWarning, ChevronLeft, ChevronRight } from 'lucide-react'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import Modal from '@/components/ui/Modal'
import { urlFirmada } from '@/lib/contratoArchivos'
import type { ContratoArchivo } from '@/types/database'

// Worker de pdf.js empaquetado por Vite (mismo origen → compatible con la CSP).
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export default function ArchivoPreviewModal({
  open,
  archivo,
  onClose
}: {
  open: boolean
  archivo: ContratoArchivo | null
  onClose: () => void
}): JSX.Element {
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const tipo = archivo?.tipo ?? ''
  const nombre = archivo?.nombre ?? ''
  const isImg = tipo.startsWith('image/')
  const isPdf = tipo === 'application/pdf' || nombre.toLowerCase().endsWith('.pdf')

  // Cargar el archivo cuando se abre el modal
  useEffect(() => {
    if (!open || !archivo) return
    let alive = true
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null
    setLoading(true)
    setError(null)
    setImgUrl(null)
    setPdf(null)
    setNumPages(0)
    setPageNum(1)
    ;(async () => {
      try {
        const url = await urlFirmada(archivo.path)
        if (!url) throw new Error('No se pudo obtener el archivo.')
        if (isImg) {
          if (!alive) return
          setImgUrl(url)
          setLoading(false)
          return
        }
        if (isPdf) {
          // Descargar el PDF como ArrayBuffer y parsearlo con pdf.js (sin visor nativo)
          const resp = await fetch(url)
          if (!resp.ok) throw new Error('No se pudo descargar el PDF.')
          const data = await resp.arrayBuffer()
          loadingTask = pdfjsLib.getDocument({ data })
          const doc = await loadingTask.promise
          if (!alive) {
            void loadingTask.destroy()
            return
          }
          setPdf(doc)
          setNumPages(doc.numPages)
          setLoading(false)
          return
        }
        // Otro tipo: no previsualizable
        setLoading(false)
      } catch (e) {
        if (!alive) return
        setError((e as Error).message || 'No se pudo abrir el archivo.')
        setLoading(false)
      }
    })()
    return () => {
      alive = false
      if (loadingTask) void loadingTask.destroy()
    }
  }, [open, archivo, isImg, isPdf])

  // Renderizar la página actual del PDF al canvas
  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const page = await pdf.getPage(pageNum)
        if (cancelled) return
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        // Escala 2x para nitidez; el CSS lo achica al ancho del modal.
        const viewport = page.getViewport({ scale: 2 })
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: ctx, viewport }).promise
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'No se pudo mostrar esta página.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdf, pageNum])

  const descargar = async (): Promise<void> => {
    if (!archivo) return
    const u = await urlFirmada(archivo.path, { download: archivo.nombre })
    if (!u) return
    const api = window.lgprop?.openExternal
    if (api) api(u).catch(() => window.open(u, '_blank'))
    else window.open(u, '_blank')
  }

  return (
    <Modal
      open={open}
      title={nombre || 'Archivo'}
      onClose={onClose}
      wide
      footer={
        <>
          {isPdf && numPages > 1 && (
            <div className="flex items-center gap-2 mr-auto text-sm text-ink-2">
              <button
                onClick={() => setPageNum((n) => Math.max(1, n - 1))}
                disabled={pageNum <= 1}
                className="p-1.5 rounded-md border border-border hover:text-ink disabled:opacity-40"
                title="Página anterior"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="num tabular-nums">
                {pageNum} / {numPages}
              </span>
              <button
                onClick={() => setPageNum((n) => Math.min(numPages, n + 1))}
                disabled={pageNum >= numPages}
                className="p-1.5 rounded-md border border-border hover:text-ink disabled:opacity-40"
                title="Página siguiente"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
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
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500">
            <Loader2 size={18} className="animate-spin" /> Cargando archivo…
          </div>
        ) : error ? (
          <div className="text-center text-sm text-bad">
            <FileWarning size={28} className="mx-auto mb-2" />
            No se pudo previsualizar el archivo.
            <div className="text-xs text-ink-3 mt-1">{error}</div>
            <div className="text-xs text-ink-3 mt-1">Probá con “Descargar”.</div>
          </div>
        ) : isImg && imgUrl ? (
          <img
            src={imgUrl}
            alt={nombre}
            className="max-w-full max-h-[70vh] rounded-lg object-contain"
          />
        ) : isPdf && pdf ? (
          <div className="w-full max-h-[70vh] overflow-auto rounded-lg bg-white/[0.02]">
            <canvas ref={canvasRef} className="mx-auto max-w-full h-auto rounded-lg" />
          </div>
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
