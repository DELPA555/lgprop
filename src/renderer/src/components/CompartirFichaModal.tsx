// Modal para compartir la ficha de una propiedad de cara al cliente: elige si
// mostrar la dirección exacta o solo la zona, y permite Descargar / WhatsApp /
// Email. Nunca incluye datos privados del dueño (eso lo garantiza el PDF).
import { useState } from 'react'
import { Download, MessageCircle, Mail, Loader2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { Field, TextInput } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { waLink } from '@/components/ui/TelefonoWhatsApp'
import type { FotoPropiedad, Propiedad } from '@/types/database'
import { descargarFicha, subirFichaYFirmar, enviarFichaEmail } from '@/lib/fichaPropiedad'

export default function CompartirFichaModal({
  open,
  onClose,
  prop,
  fotos
}: {
  open: boolean
  onClose: () => void
  prop: Propiedad
  fotos: FotoPropiedad[]
}): JSX.Element {
  const toast = useToast()
  const [mostrarDireccion, setMostrarDireccion] = useState(true)
  const [zona, setZona] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'' | 'download' | 'wa' | 'email'>('')

  const opts = (): { mostrarDireccion: boolean; zona?: string | null } => ({
    mostrarDireccion,
    zona: zona.trim() || null
  })

  const onDescargar = async (): Promise<void> => {
    setBusy('download')
    try {
      await descargarFicha(prop, fotos, opts())
      toast.success('Ficha descargada')
    } catch (e) {
      toast.error('No se pudo generar la ficha: ' + (e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const onWhatsApp = async (): Promise<void> => {
    const link = waLink(telefono, '')
    if (!link && telefono.trim()) {
      toast.error('Teléfono inválido')
      return
    }
    setBusy('wa')
    try {
      const { url, error } = await subirFichaYFirmar(prop, fotos, opts())
      if (error || !url) {
        toast.error(error || 'No se pudo preparar la ficha')
        return
      }
      const ref = mostrarDireccion ? prop.direccion : zona.trim() || 'la propiedad'
      const msg = `Hola! Te comparto la ficha de ${ref}: ${url}`
      const wa = waLink(telefono, msg) ?? `https://wa.me/?text=${encodeURIComponent(msg)}`
      window.open(wa, '_blank')
    } catch (e) {
      toast.error('Error: ' + (e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const onEmail = async (): Promise<void> => {
    if (!email.trim()) {
      toast.error('Ingresá un email')
      return
    }
    setBusy('email')
    try {
      const { path, error } = await subirFichaYFirmar(prop, fotos, opts())
      if (error || !path) {
        toast.error(error || 'No se pudo preparar la ficha')
        return
      }
      const r = await enviarFichaEmail(prop, path, email.trim())
      if (!r.ok) {
        toast.error(r.error || 'No se pudo enviar el email')
        return
      }
      toast.success(`Ficha enviada a ${email.trim()}`)
    } catch (e) {
      toast.error('Error: ' + (e as Error).message)
    } finally {
      setBusy('')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Compartir ficha en PDF">
      <div className="space-y-4">
        {fotos.length === 0 && (
          <p className="text-xs text-warn">
            La propiedad no tiene fotos: la ficha se generará igual, pero sin imágenes.
          </p>
        )}

        <label className="flex items-center gap-2 text-sm text-ink-2 cursor-pointer">
          <input
            type="checkbox"
            checked={mostrarDireccion}
            onChange={(e) => setMostrarDireccion(e.target.checked)}
            className="accent-accent"
          />
          Mostrar dirección exacta
        </label>

        {!mostrarDireccion && (
          <Field label="Zona / barrio a mostrar">
            <TextInput
              value={zona}
              onChange={(e) => setZona(e.target.value)}
              placeholder="Ej: Playa Grande, Mar del Plata"
            />
          </Field>
        )}

        <div className="border-t border-border pt-4 space-y-3">
          <button
            onClick={() => void onDescargar()}
            disabled={busy !== ''}
            className="btn-ghost w-full flex items-center justify-center gap-2 text-sm"
          >
            {busy === 'download' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Descargar PDF
          </button>

          <div className="flex gap-2">
            <TextInput
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Teléfono del cliente (WhatsApp)"
            />
            <button
              onClick={() => void onWhatsApp()}
              disabled={busy !== ''}
              className="btn-ghost flex items-center gap-2 text-sm whitespace-nowrap"
              title="Enviar por WhatsApp (link de descarga)"
            >
              {busy === 'wa' ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
              WhatsApp
            </button>
          </div>

          <div className="flex gap-2">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email del cliente"
            />
            <button
              onClick={() => void onEmail()}
              disabled={busy !== ''}
              className="btn-primary flex items-center gap-2 text-sm whitespace-nowrap"
              title="Enviar por email con el PDF adjunto"
            >
              {busy === 'email' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              Email
            </button>
          </div>
          <p className="text-[11px] text-ink-3">
            WhatsApp adjunta un link de descarga (válido 7 días). El email manda el PDF adjunto.
          </p>
        </div>
      </div>
    </Modal>
  )
}
