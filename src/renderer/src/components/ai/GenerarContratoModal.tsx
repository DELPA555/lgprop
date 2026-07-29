import { useMemo, useState } from 'react'
import { Sparkles, FileDown, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import type { Propiedad, Inquilino, Dueno, TipoIndice } from '@/types/database'
import Modal from '@/components/ui/Modal'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { todayISO } from '@/lib/dates'
import { exportContratoPDF } from '@/lib/pdf'
import { edgeErrorMessage } from '@/lib/edgeError'

const INDICES: TipoIndice[] = [
  'ICL',
  'IPC',
  'Casa Propia',
  'UVA',
  'Combinado',
  'Porcentaje fijo',
  'Manual'
]

type Props = {
  open: boolean
  onClose: () => void
  propiedades: Propiedad[]
  inquilinos: Inquilino[]
  duenos: Dueno[]
}

export default function GenerarContratoModal({
  open,
  onClose,
  propiedades,
  inquilinos,
  duenos
}: Props): JSX.Element {
  const toast = useToast()
  const [propiedadId, setPropiedadId] = useState('')
  const [inquilinoId, setInquilinoId] = useState('')
  const [duenoId, setDuenoId] = useState('')
  const [monto, setMonto] = useState<number>(0)
  const [fechaInicio, setFechaInicio] = useState(todayISO())
  const [duracion, setDuracion] = useState<number>(36)
  const [indice, setIndice] = useState<TipoIndice>('ICL')
  const [frecuencia, setFrecuencia] = useState<number>(3)
  const [clausulas, setClausulas] = useState('')

  const [generando, setGenerando] = useState(false)
  const [texto, setTexto] = useState<string | null>(null)

  const duenoMap = useMemo(() => {
    const m: Record<string, Dueno> = {}
    for (const d of duenos) m[d.id] = d
    return m
  }, [duenos])

  const reset = (): void => {
    setPropiedadId('')
    setInquilinoId('')
    setDuenoId('')
    setMonto(0)
    setFechaInicio(todayISO())
    setDuracion(36)
    setIndice('ICL')
    setFrecuencia(3)
    setClausulas('')
    setTexto(null)
  }

  const close = (): void => {
    reset()
    onClose()
  }

  const onPropiedad = (id: string): void => {
    setPropiedadId(id)
    const p = propiedades.find((x) => x.id === id)
    if (p?.dueno_id) setDuenoId(p.dueno_id)
  }

  const generar = async (): Promise<void> => {
    const prop = propiedades.find((p) => p.id === propiedadId)
    const inq = inquilinos.find((i) => i.id === inquilinoId)
    const due = duenoId ? duenoMap[duenoId] : undefined
    if (!prop) return toast.error('Elegí una propiedad')
    if (!inq) return toast.error('Elegí un inquilino')
    if (!due) return toast.error('Elegí un dueño')
    if (!monto || monto <= 0) return toast.error('Cargá el monto del alquiler')

    setGenerando(true)
    const { data, error } = await supabase.functions.invoke('generar-contrato', {
      body: {
        inquilino: { nombre: inq.nombre, dni: inq.dni },
        dueno: { nombre: due.nombre },
        propiedad: { direccion: prop.direccion },
        monto: Number(monto),
        fecha_inicio: fechaInicio,
        duracion_meses: Number(duracion),
        indice,
        frecuencia_meses: Number(frecuencia),
        clausulas_particulares: clausulas
      }
    })
    setGenerando(false)

    if (error) return void toast.error(await edgeErrorMessage(error, 'No se pudo generar el contrato'))
    if (!data?.ok) return void toast.error(data?.error ?? 'No se pudo generar el contrato')
    setTexto(data.texto as string)
    toast.success('Contrato redactado. Revisalo antes de exportar.')
  }

  const exportar = async (): Promise<void> => {
    if (!texto) return
    const prop = propiedades.find((p) => p.id === propiedadId)
    const base = (prop?.direccion ?? 'contrato')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    try {
      await exportContratoPDF(texto, `contrato-${base || 'locacion'}.pdf`)
      toast.success('PDF generado')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Modal
      open={open}
      title={texto ? 'Revisar contrato redactado' : 'Generar contrato con IA'}
      onClose={close}
      wide
      footer={
        texto ? (
          <>
            <button
              onClick={() => setTexto(null)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border flex items-center gap-2"
            >
              <ArrowLeft size={15} /> Volver a editar datos
            </button>
            <button onClick={exportar} className="btn-primary text-sm flex items-center gap-2">
              <FileDown size={16} /> Exportar PDF
            </button>
          </>
        ) : (
          <>
            <button
              onClick={close}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button
              onClick={generar}
              disabled={generando}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <Sparkles size={16} /> {generando ? 'Redactando…' : 'Generar contrato'}
            </button>
          </>
        )
      }
    >
      {texto ? (
        <div className="space-y-2">
          <p className="text-xs text-zinc-500">
            Editá el texto libremente antes de exportar. Este borrador es orientativo: revisalo
            con un profesional antes de firmar.
          </p>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="input w-full font-mono text-xs leading-relaxed"
            style={{ minHeight: '52vh', resize: 'vertical' }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Propiedad" required>
              <Select value={propiedadId} onChange={(e) => onPropiedad(e.target.value)}>
                <option value="">— Elegir —</option>
                {propiedades.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.direccion}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Inquilino" required>
              <Select value={inquilinoId} onChange={(e) => setInquilinoId(e.target.value)}>
                <option value="">— Elegir —</option>
                {inquilinos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Dueño" required>
            <Select value={duenoId} onChange={(e) => setDuenoId(e.target.value)}>
              <option value="">— Elegir —</option>
              {duenos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Monto mensual" required>
              <TextInput
                type="number"
                min={0}
                value={monto}
                onChange={(e) => setMonto(Number(e.target.value))}
              />
            </Field>
            <Field label="Inicio" required>
              <TextInput
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </Field>
            <Field label="Duración (meses)">
              <TextInput
                type="number"
                min={1}
                value={duracion}
                onChange={(e) => setDuracion(Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Índice de actualización">
              <Select value={indice} onChange={(e) => setIndice(e.target.value as TipoIndice)}>
                {INDICES.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Frecuencia de ajuste (meses)">
              <TextInput
                type="number"
                min={1}
                value={frecuencia}
                onChange={(e) => setFrecuencia(Number(e.target.value))}
              />
            </Field>
          </div>

          <Field label="Cláusulas particulares (opcional)">
            <TextArea
              value={clausulas}
              onChange={(e) => setClausulas(e.target.value)}
              placeholder="Ej: se permite una mascota; el inquilino puede pintar previo aviso; etc."
              className="min-h-[96px]"
            />
          </Field>
        </div>
      )}
    </Modal>
  )
}
