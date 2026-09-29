// Sección "Publicación / Cartera" dentro de PropiedadDetalle: edita los datos
// de la oferta comercial (disponibilidad, precios, características, descripción),
// gestiona las fotos y permite compartir la ficha en PDF.
import { useState } from 'react'
import { Megaphone, Share2, Save } from 'lucide-react'
import type { DisponiblePara, EstadoOferta, FotoPropiedad, Moneda, Propiedad } from '@/types/database'
import { supabase } from '@/lib/supabase/client'
import { Field, TextInput, TextArea, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import FotosManager from '@/components/FotosManager'
import CompartirFichaModal from '@/components/CompartirFichaModal'
import { DISPONIBLE_LABEL, ESTADO_OFERTA_LABEL } from '@/lib/fichaPropiedad'

type FormState = {
  disponible_para: DisponiblePara
  estado_oferta: EstadoOferta
  precio_alquiler: string
  moneda_alquiler: Moneda
  precio_venta: string
  moneda_venta: Moneda
  descripcion_publicacion: string
  ambientes: string
  dormitorios: string
  banos: string
  superficie_m2: string
  cochera: boolean
}

function numOrNull(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export default function PublicacionSection({
  prop,
  onSaved
}: {
  prop: Propiedad
  onSaved: () => void
}): JSX.Element {
  const toast = useToast()
  const [fotos, setFotos] = useState<FotoPropiedad[]>([])
  const [compartir, setCompartir] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>({
    disponible_para: prop.disponible_para,
    estado_oferta: prop.estado_oferta,
    precio_alquiler: prop.precio_alquiler != null ? String(prop.precio_alquiler) : '',
    moneda_alquiler: prop.moneda_alquiler,
    precio_venta: prop.precio_venta != null ? String(prop.precio_venta) : '',
    moneda_venta: prop.moneda_venta,
    descripcion_publicacion: prop.descripcion_publicacion ?? '',
    ambientes: prop.ambientes != null ? String(prop.ambientes) : '',
    dormitorios: prop.dormitorios != null ? String(prop.dormitorios) : '',
    banos: prop.banos != null ? String(prop.banos) : '',
    superficie_m2: prop.superficie_m2 != null ? String(prop.superficie_m2) : '',
    cochera: prop.cochera
  })

  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void =>
    setForm((f) => ({ ...f, [k]: v }))

  const mostrarAlq = form.disponible_para === 'alquiler' || form.disponible_para === 'ambas'
  const mostrarVta = form.disponible_para === 'venta' || form.disponible_para === 'ambas'

  const guardar = async (): Promise<void> => {
    setSaving(true)
    const { error } = await supabase
      .from('propiedades')
      .update({
        disponible_para: form.disponible_para,
        estado_oferta: form.estado_oferta,
        precio_alquiler: numOrNull(form.precio_alquiler),
        moneda_alquiler: form.moneda_alquiler,
        precio_venta: numOrNull(form.precio_venta),
        moneda_venta: form.moneda_venta,
        descripcion_publicacion: form.descripcion_publicacion.trim() || null,
        ambientes: numOrNull(form.ambientes),
        dormitorios: numOrNull(form.dormitorios),
        banos: numOrNull(form.banos),
        superficie_m2: numOrNull(form.superficie_m2),
        cochera: form.cochera
      })
      .eq('id', prop.id)
    setSaving(false)
    if (error) {
      toast.error('No se pudo guardar: ' + error.message)
      return
    }
    toast.success('Publicación guardada')
    onSaved()
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Megaphone size={16} className="text-accent" /> Publicación · Cartera disponible
        </h2>
        <button
          type="button"
          onClick={() => setCompartir(true)}
          className="btn-ghost text-sm flex items-center gap-2"
        >
          <Share2 size={14} /> Compartir ficha en PDF
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Disponible para">
          <Select
            value={form.disponible_para}
            onChange={(e) => set('disponible_para', e.target.value as DisponiblePara)}
          >
            {(['ninguna', 'alquiler', 'venta', 'ambas'] as DisponiblePara[]).map((v) => (
              <option key={v} value={v}>
                {DISPONIBLE_LABEL[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estado de la oferta">
          <Select
            value={form.estado_oferta}
            onChange={(e) => set('estado_oferta', e.target.value as EstadoOferta)}
          >
            {(['disponible', 'reservada', 'en_proceso', 'no_disponible'] as EstadoOferta[]).map((v) => (
              <option key={v} value={v}>
                {ESTADO_OFERTA_LABEL[v]}
              </option>
            ))}
          </Select>
        </Field>

        {mostrarAlq && (
          <Field label="Precio alquiler (por mes)">
            <div className="flex gap-2">
              <TextInput
                type="number"
                value={form.precio_alquiler}
                onChange={(e) => set('precio_alquiler', e.target.value)}
                placeholder="0"
              />
              <Select
                value={form.moneda_alquiler}
                onChange={(e) => set('moneda_alquiler', e.target.value as Moneda)}
                className="!w-24"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </Select>
            </div>
          </Field>
        )}
        {mostrarVta && (
          <Field label="Precio venta">
            <div className="flex gap-2">
              <TextInput
                type="number"
                value={form.precio_venta}
                onChange={(e) => set('precio_venta', e.target.value)}
                placeholder="0"
              />
              <Select
                value={form.moneda_venta}
                onChange={(e) => set('moneda_venta', e.target.value as Moneda)}
                className="!w-24"
              >
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </Select>
            </div>
          </Field>
        )}

        <Field label="Ambientes">
          <TextInput type="number" value={form.ambientes} onChange={(e) => set('ambientes', e.target.value)} placeholder="—" />
        </Field>
        <Field label="Dormitorios">
          <TextInput type="number" value={form.dormitorios} onChange={(e) => set('dormitorios', e.target.value)} placeholder="—" />
        </Field>
        <Field label="Baños">
          <TextInput type="number" value={form.banos} onChange={(e) => set('banos', e.target.value)} placeholder="—" />
        </Field>
        <Field label="Superficie (m²)">
          <TextInput type="number" value={form.superficie_m2} onChange={(e) => set('superficie_m2', e.target.value)} placeholder="—" />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink-2 cursor-pointer mt-3">
        <input type="checkbox" checked={form.cochera} onChange={(e) => set('cochera', e.target.checked)} className="accent-accent" />
        Cochera
      </label>

      <div className="mt-3">
        <Field label="Descripción (para el cliente)">
          <TextArea
            value={form.descripcion_publicacion}
            onChange={(e) => set('descripcion_publicacion', e.target.value)}
            placeholder="Características, comodidades, entorno… (esto se muestra en la ficha compartible)"
          />
        </Field>
      </div>

      <div className="flex justify-end mt-3">
        <button onClick={() => void guardar()} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
          <Save size={14} /> {saving ? 'Guardando…' : 'Guardar publicación'}
        </button>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-xs font-semibold text-ink-2 uppercase tracking-wide mb-3">Fotos</h3>
        <FotosManager propiedadId={prop.id} onChange={setFotos} />
      </div>

      <CompartirFichaModal open={compartir} onClose={() => setCompartir(false)} prop={prop} fotos={fotos} />
    </section>
  )
}
