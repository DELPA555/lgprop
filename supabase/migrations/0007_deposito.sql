-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0007: Garantías y depósitos en contratos
-- Cada contrato puede tener un depósito en garantía, que queda retenido hasta
-- que se devuelve al finalizar/rescindir el contrato.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  create type estado_deposito as enum ('retenido', 'devuelto');
exception when duplicate_object then null; end $$;

alter table public.contratos
  add column if not exists monto_deposito numeric(12, 2) not null default 0,
  add column if not exists estado_deposito estado_deposito not null default 'retenido',
  add column if not exists fecha_devolucion_deposito date;

-- Nuevo tipo de notificación para el recordatorio de devolución del depósito.
-- (No se usa dentro de esta misma migración, así que ADD VALUE es seguro.)
alter type tipo_notificacion add value if not exists 'deposito_pendiente';
