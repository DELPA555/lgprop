// Cartera Disponible: "vidriera interna" de las propiedades ofrecidas (alquiler
// y/o venta) con foto de portada, datos clave y filtros. Click → detalle.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Bed, Bath, Maximize, Car, ImageOff } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import type { DisponiblePara, EstadoOferta, FotoPropiedad, Propiedad } from '@/types/database'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { listarFotosDe, urlsFirmadasFotos, portadaDe } from '@/lib/fotosPropiedad'
import { DISPONIBLE_LABEL, ESTADO_OFERTA_LABEL, preciosDe } from '@/lib/fichaPropiedad'

const ESTADO_CHIP: Record<EstadoOferta, string> = {
  disponible: 'chip-ok',
  reservada: 'chip-warn',
  en_proceso: 'chip-info',
  no_disponible: 'chip-muted'
}

export default function Cartera(): JSX.Element {
  const navigate = useNavigate()
  const [props, setProps] = useState<Propiedad[]>([])
  const [portadas, setPortadas] = useState<Record<string, string>>({}) // propId → url
  const [fotoCount, setFotoCount] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  const [fOferta, setFOferta] = useState<'todas' | DisponiblePara>('todas')
  const [fEstado, setFEstado] = useState<'todos' | EstadoOferta>('todos')
  const [precioMin, setPrecioMin] = useState('')
  const [precioMax, setPrecioMax] = useState('')
  const [ambMin, setAmbMin] = useState('')

  const load = async (): Promise<void> => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('propiedades')
      .select('*')
      .neq('disponible_para', 'ninguna')
      .order('created_at', { ascending: false })
    const list = (data ?? []) as Propiedad[]
    setProps(list)

    const fotosPorProp = await listarFotosDe(list.map((p) => p.id))
    const counts: Record<string, number> = {}
    const portadaPaths: { propId: string; path: string }[] = []
    for (const p of list) {
      const fs: FotoPropiedad[] = fotosPorProp[p.id] ?? []
      counts[p.id] = fs.length
      const port = portadaDe(fs)
      if (port) portadaPaths.push({ propId: p.id, path: port.path })
    }
    setFotoCount(counts)
    const urls = await urlsFirmadasFotos(portadaPaths.map((x) => x.path))
    const map: Record<string, string> = {}
    for (const x of portadaPaths) if (urls[x.path]) map[x.propId] = urls[x.path]
    setPortadas(map)
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtradas = useMemo(() => {
    const min = precioMin.trim() ? Number(precioMin) : null
    const max = precioMax.trim() ? Number(precioMax) : null
    const amb = ambMin.trim() ? Number(ambMin) : null
    return props.filter((p) => {
      if (fOferta !== 'todas') {
        if (fOferta === 'ambas' ? p.disponible_para !== 'ambas' : !(p.disponible_para === fOferta || p.disponible_para === 'ambas'))
          return false
      }
      if (fEstado !== 'todos' && p.estado_oferta !== fEstado) return false
      if (amb != null && (p.ambientes ?? 0) < amb) return false
      if (min != null || max != null) {
        const precios = [p.precio_alquiler, p.precio_venta].filter((x): x is number => x != null)
        if (precios.length === 0) return false
        const cumple = precios.some((pr) => (min == null || pr >= min) && (max == null || pr <= max))
        if (!cumple) return false
      }
      return true
    })
  }, [props, fOferta, fEstado, precioMin, precioMax, ambMin])

  return (
    <div>
      <PageHeader
        title="Cartera Disponible"
        subtitle="Propiedades que tenemos para ofrecer — alquiler y venta"
      />
      {!isSupabaseConfigured && <ConfigNotice />}

      {/* Filtros */}
      <div className="card p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Field label="Tipo de oferta">
          <Select value={fOferta} onChange={(e) => setFOferta(e.target.value as typeof fOferta)}>
            <option value="todas">Todas</option>
            <option value="alquiler">Alquiler</option>
            <option value="venta">Venta</option>
            <option value="ambas">Alquiler y venta</option>
          </Select>
        </Field>
        <Field label="Estado">
          <Select value={fEstado} onChange={(e) => setFEstado(e.target.value as typeof fEstado)}>
            <option value="todos">Todos</option>
            {(['disponible', 'reservada', 'en_proceso', 'no_disponible'] as EstadoOferta[]).map((v) => (
              <option key={v} value={v}>
                {ESTADO_OFERTA_LABEL[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Precio desde">
          <TextInput type="number" value={precioMin} onChange={(e) => setPrecioMin(e.target.value)} placeholder="—" />
        </Field>
        <Field label="Precio hasta">
          <TextInput type="number" value={precioMax} onChange={(e) => setPrecioMax(e.target.value)} placeholder="—" />
        </Field>
        <Field label="Ambientes (mín.)">
          <TextInput type="number" value={ambMin} onChange={(e) => setAmbMin(e.target.value)} placeholder="—" />
        </Field>
      </div>

      {loading ? (
        <p className="text-sm text-ink-3">Cargando cartera…</p>
      ) : filtradas.length === 0 ? (
        <div className="card p-10 text-center text-ink-3">
          {props.length === 0
            ? 'Todavía no hay propiedades marcadas como disponibles. Marcá una propiedad como disponible desde su ficha (sección Publicación).'
            : 'No hay propiedades que coincidan con los filtros.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtradas.map((p) => {
            const precios = preciosDe(p)
            return (
              <button
                key={p.id}
                onClick={() => navigate(`/propiedades/${p.id}`)}
                className="card overflow-hidden text-left hover:border-accent/50 transition-colors group"
              >
                <div className="relative h-44 bg-surface flex items-center justify-center overflow-hidden">
                  {portadas[p.id] ? (
                    <img
                      src={portadas[p.id]}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform"
                    />
                  ) : (
                    <div className="flex flex-col items-center text-ink-3 gap-1">
                      <ImageOff size={22} />
                      <span className="text-xs">Sin fotos</span>
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex gap-1.5">
                    <span className="chip chip-info !py-0.5">{DISPONIBLE_LABEL[p.disponible_para]}</span>
                    <span className={`chip ${ESTADO_CHIP[p.estado_oferta]} !py-0.5`}>
                      {ESTADO_OFERTA_LABEL[p.estado_oferta]}
                    </span>
                  </div>
                  {fotoCount[p.id] > 1 && (
                    <span className="absolute bottom-2 right-2 text-[11px] text-white bg-black/55 rounded px-1.5 py-0.5">
                      {fotoCount[p.id]} fotos
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-semibold text-white flex items-center gap-1.5">
                    <Building2 size={14} className="text-accent shrink-0" />
                    <span className="truncate">{p.direccion}</span>
                  </p>
                  {p.tipo && <p className="text-xs text-ink-3 mt-0.5">{p.tipo}</p>}

                  {precios.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {precios.map((pr, i) => (
                        <p key={i} className="num text-accent font-bold">
                          {pr}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-xs text-ink-2">
                    {p.ambientes != null && <span>{p.ambientes} amb.</span>}
                    {p.dormitorios != null && (
                      <span className="flex items-center gap-1">
                        <Bed size={12} /> {p.dormitorios}
                      </span>
                    )}
                    {p.banos != null && (
                      <span className="flex items-center gap-1">
                        <Bath size={12} /> {p.banos}
                      </span>
                    )}
                    {p.superficie_m2 != null && (
                      <span className="flex items-center gap-1">
                        <Maximize size={12} /> {p.superficie_m2} m²
                      </span>
                    )}
                    {p.cochera && (
                      <span className="flex items-center gap-1">
                        <Car size={12} /> Cochera
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
