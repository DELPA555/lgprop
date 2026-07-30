import { useEffect, useRef, useState } from 'react'
import { Plus, Pencil, Trash2, Users2, FileText, Upload, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Asamblea, ContratoArchivo } from '@/types/database'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ArchivoPreviewModal from '@/components/ArchivoPreviewModal'
import { Field, TextInput, TextArea } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { formatDate } from '@/lib/format'
import { todayISO } from '@/lib/dates'
import { BUCKET } from '@/lib/contratoArchivos'

const sanitize = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120)

// Adapta los datos del acta al shape que espera ArchivoPreviewModal.
const asArchivo = (a: Asamblea): ContratoArchivo =>
  ({
    id: a.id,
    contrato_id: '',
    nombre: a.acta_nombre ?? 'acta.pdf',
    path: a.acta_path ?? '',
    tipo: a.acta_tipo ?? null,
    tamano: null,
    subido_por: null,
    created_at: a.created_at
  }) as ContratoArchivo

export default function AsambleasSection({ consorcioId }: { consorcioId: string }): JSX.Element {
  const toast = useToast()
  const [rows, setRows] = useState<Asamblea[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Asamblea | null>(null)
  const [fecha, setFecha] = useState(todayISO())
  const [temas, setTemas] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [actaActual, setActaActual] = useState<{ nombre: string; path: string; tipo: string | null } | null>(null)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<Asamblea | null>(null)
  const [delTarget, setDelTarget] = useState<Asamblea | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    const { data } = await supabase
      .from('asambleas')
      .select('*')
      .eq('consorcio_id', consorcioId)
      .order('fecha', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }
  useEffect(() => {
    void load()
  }, [consorcioId])

  const openCreate = (): void => {
    setEditing(null)
    setFecha(todayISO())
    setTemas('')
    setArchivo(null)
    setActaActual(null)
    setModalOpen(true)
  }
  const openEdit = (a: Asamblea): void => {
    setEditing(a)
    setFecha(a.fecha)
    setTemas(a.temas ?? '')
    setArchivo(null)
    setActaActual(a.acta_path ? { nombre: a.acta_nombre ?? 'acta', path: a.acta_path, tipo: a.acta_tipo } : null)
    setModalOpen(true)
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      let acta_path = actaActual?.path ?? null
      let acta_nombre = actaActual?.nombre ?? null
      let acta_tipo = actaActual?.tipo ?? null

      // Subir el acta nueva si se eligió una
      if (archivo) {
        const path = `asambleas/${consorcioId}/${Date.now()}-${sanitize(archivo.name)}`
        const up = await supabase.storage.from(BUCKET).upload(path, archivo, {
          contentType: archivo.type || undefined,
          upsert: false
        })
        if (up.error) {
          setSaving(false)
          return void toast.error(up.error.message)
        }
        // Borrar el acta anterior si se reemplaza
        if (editing?.acta_path) {
          await supabase.storage.from(BUCKET).remove([editing.acta_path])
        }
        acta_path = path
        acta_nombre = archivo.name
        acta_tipo = archivo.type || null
      }

      const payload = {
        consorcio_id: consorcioId,
        fecha,
        temas: temas || null,
        acta_path,
        acta_nombre,
        acta_tipo
      }
      const { error } = editing
        ? await supabase.from('asambleas').update(payload).eq('id', editing.id)
        : await supabase.from('asambleas').insert(payload)
      setSaving(false)
      if (error) return void toast.error(error.message)
      toast.success(editing ? 'Asamblea actualizada' : 'Asamblea registrada')
      setModalOpen(false)
      void load()
    } catch (e) {
      setSaving(false)
      toast.error((e as Error).message)
    }
  }

  const doDelete = async (): Promise<void> => {
    if (!delTarget) return
    setDeleting(true)
    if (delTarget.acta_path) await supabase.storage.from(BUCKET).remove([delTarget.acta_path])
    const { error } = await supabase.from('asambleas').delete().eq('id', delTarget.id)
    setDeleting(false)
    if (error) return void toast.error(error.message)
    toast.success('Asamblea eliminada')
    setDelTarget(null)
    void load()
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 mt-6">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Users2 size={16} className="text-ink-3" /> Asambleas
        </h2>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={15} /> Nueva asamblea
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3 uppercase tracking-wider border-b border-border">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Temas tratados</th>
              <th className="px-4 py-3 font-medium">Acta</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-3">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-3">
                  Sin asambleas registradas.
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr key={a.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-ink-2 text-xs whitespace-nowrap">
                    {formatDate(a.fecha)}
                  </td>
                  <td className="px-4 py-3 text-ink-2 max-w-md">
                    <div className="line-clamp-2 whitespace-pre-wrap">{a.temas || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    {a.acta_path ? (
                      <button
                        onClick={() => setPreview(a)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-info/30 text-info hover:bg-info/10 text-xs max-w-[180px]"
                        title={a.acta_nombre ?? 'Ver acta'}
                      >
                        <FileText size={12} className="shrink-0" />
                        <span className="truncate">{a.acta_nombre ?? 'Ver acta'}</span>
                      </button>
                    ) : (
                      <span className="text-ink-3 text-xs">Sin acta</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(a)}
                        className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-white/5"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDelTarget(a)}
                        className="p-1.5 rounded-md text-ink-2 hover:text-bad hover:bg-white/5"
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        title={editing ? 'Editar asamblea' : 'Nueva asamblea'}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button onClick={save} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
              {saving && <Loader2 size={15} className="animate-spin" />}
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Fecha de la asamblea">
            <TextInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
          <Field label="Temas tratados">
            <TextArea
              value={temas}
              onChange={(e) => setTemas(e.target.value)}
              placeholder="Orden del día / resoluciones tomadas…"
              className="min-h-[120px]"
            />
          </Field>
          <div>
            <p className="label">Acta (PDF o imagen)</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setArchivo(f)
                e.target.value = ''
              }}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border text-ink-2 hover:text-ink hover:bg-white/5"
              >
                <Upload size={15} /> {actaActual || archivo ? 'Reemplazar acta' : 'Adjuntar acta'}
              </button>
              <span className="text-xs text-ink-3 truncate">
                {archivo ? archivo.name : actaActual ? actaActual.nombre : 'Ningún archivo'}
              </span>
            </div>
          </div>
        </div>
      </Modal>

      <ArchivoPreviewModal
        open={!!preview}
        archivo={preview ? asArchivo(preview) : null}
        onClose={() => setPreview(null)}
      />

      <ConfirmDialog
        open={!!delTarget}
        message="¿Eliminar esta asamblea? Se borra también el acta adjunta. Esta acción no se puede deshacer."
        onConfirm={doDelete}
        onClose={() => setDelTarget(null)}
        loading={deleting}
      />
    </>
  )
}
