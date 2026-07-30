// Chip de estado unificado: punto + etiqueta, con color semántico.
// Uso: <EstadoChip tone="ok">Pagado</EstadoChip>
// o con el helper por dominio: <EstadoChip {...pagoEstado(p.estado)} />
import { ReactNode } from 'react'

export type ChipTone = 'ok' | 'warn' | 'bad' | 'info' | 'muted'

const TONE_CLASS: Record<ChipTone, string> = {
  ok: 'chip chip-ok',
  warn: 'chip chip-warn',
  bad: 'chip chip-bad',
  info: 'chip chip-info',
  muted: 'chip chip-muted'
}

export default function EstadoChip({
  tone = 'muted',
  children
}: {
  tone?: ChipTone
  children: ReactNode
}): JSX.Element {
  return <span className={TONE_CLASS[tone]}>{children}</span>
}
