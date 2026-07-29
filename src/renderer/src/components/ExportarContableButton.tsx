import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { fetchFilasContables, exportContableCSV } from '@/lib/exportContable'

type Preset = 'mes' | 'trimestre' | 'anio' | 'custom'

const pad = (n: number): string => String(n).padStart(2, '0')
const ym = (y: number, m0: number): string => `${y}-${pad(m0 + 1)}` // m0 = mes 0-11
const currentYM = (): string => {
  const d = new Date()
  return ym(d.getFullYear(), d.getMonth())
}

// Devuelve [desdeYM, hastaYM] según el preset
function rangoPreset(preset: Preset, desdeYM: string, hastaYM: string): [string, string] {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth()
  if (preset === 'mes') return [ym(y, m), ym(y, m)]
  if (preset === 'trimestre') {
    const qs = Math.floor(m / 3) * 3
    return [ym(y, qs), ym(y, qs + 2)]
  }
  if (preset === 'anio') return [ym(y, 0), ym(y, 11)]
  return [desdeYM, hastaYM] // custom
}

export default function ExportarContableButton({
  defaultYM
}: {
  defaultYM?: string
}): JSX.Element {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<Preset>('mes')
  const [desdeYM, setDesdeYM] = useState(defaultYM ?? currentYM())
  const [hastaYM, setHastaYM] = useState(defaultYM ?? currentYM())
  const [loading, setLoading] = useState(false)

  const exportar = async (): Promise<void> => {
    const [dYM, hYM] = rangoPreset(preset, desdeYM, hastaYM)
    if (dYM > hYM) return toast.error('El "desde" no puede ser posterior al "hasta"')
    setLoading(true)
    try {
      const filas = await fetchFilasContables(`${dYM}-01`, `${hYM}-01`)
      if (filas.length === 0) {
        toast.info('No hay pagos en el rango elegido.')
        return
      }
      exportContableCSV(filas, `lgprop-contable-${dYM}_a_${hYM}.csv`)
      toast.success(`${filas.length} fila(s) exportadas`)
      setOpen(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border text-zinc-300 hover:text-white hover:bg-white/5"
      >
        <Download size={16} /> Exportar
      </button>

      <Modal
        open={open}
        title="Exportar a CSV (Excel)"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 hover:text-white border border-border"
            >
              Cancelar
            </button>
            <button
              onClick={exportar}
              disabled={loading}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              Descargar CSV
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Rango">
            <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              <option value="mes">Mes actual</option>
              <option value="trimestre">Trimestre actual</option>
              <option value="anio">Año actual</option>
              <option value="custom">Personalizado</option>
            </Select>
          </Field>
          {preset === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde (mes)">
                <TextInput type="month" value={desdeYM} onChange={(e) => setDesdeYM(e.target.value)} />
              </Field>
              <Field label="Hasta (mes)">
                <TextInput type="month" value={hastaYM} onChange={(e) => setHastaYM(e.target.value)} />
              </Field>
            </div>
          )}
          <p className="text-xs text-zinc-500">
            Columnas: período, fecha de pago, propiedad, dueño, inquilino, bruto, comisión, neto y
            estado de pago. Se abre directo en Excel.
          </p>
        </div>
      </Modal>
    </>
  )
}
