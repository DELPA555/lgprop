import { useEffect, useState } from 'react'
import { Save, Loader2, BellRing } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client'
import PageHeader from '@/components/PageHeader'
import ConfigNotice from '@/components/ConfigNotice'
import { Field, TextInput } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'

const CLAVE_DIAS = 'avisos_dias_anticipacion_contrato'
const PRESETS = [30, 60, 90]

export default function Ajustes(): JSX.Element {
  const toast = useToast()
  const [dias, setDias] = useState<number>(60)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from('configuracion')
        .select('valor')
        .eq('clave', CLAVE_DIAS)
        .maybeSingle()
      if (data?.valor) setDias(parseInt(data.valor, 10) || 60)
      setLoading(false)
    })()
  }, [])

  const save = async (): Promise<void> => {
    if (!dias || dias < 1) return toast.error('Ingresá un número de días válido')
    setSaving(true)
    const { error } = await supabase
      .from('configuracion')
      .upsert(
        { clave: CLAVE_DIAS, valor: String(dias), updated_at: new Date().toISOString() },
        { onConflict: 'clave' }
      )
    setSaving(false)
    if (error) return void toast.error(error.message)
    toast.success('Configuración guardada')
  }

  return (
    <div className="p-6">
      <PageHeader title="Ajustes" subtitle="Configuración general del sistema" />

      {!isSupabaseConfigured && <ConfigNotice />}

      <div className="card p-5 max-w-xl">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <BellRing size={16} className="text-zinc-400" /> Avisos de vencimiento
        </h2>
        <p className="text-sm text-zinc-400 mt-1.5">
          ¿Con cuántos días de anticipación querés recibir el aviso de vencimiento de{' '}
          <span className="text-zinc-200">contratos</span> y{' '}
          <span className="text-zinc-200">seguros/ART</span>?
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 mt-4">
            <Loader2 size={16} className="animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setDias(p)}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    dias === p
                      ? 'bg-accent text-white border-accent'
                      : 'border-border text-zinc-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {p} días
                </button>
              ))}
              <span className="text-zinc-600 text-xs">o</span>
              <div className="w-40">
                <Field label="Personalizado (días)">
                  <TextInput
                    type="number"
                    min={1}
                    max={365}
                    value={dias}
                    onChange={(e) => setDias(Number(e.target.value))}
                  />
                </Field>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Guardar
              </button>
              <span className="text-xs text-zinc-600">
                Aplica en el motor de avisos diario (contratos y seguros por vencer).
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
