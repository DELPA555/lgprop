-- ════════════════════════════════════════════════════════════════════════
-- 0027 · Aprobación de aumentos por el dueño (paso intermedio opcional)
-- Antes de confirmar un aumento en la app, se le puede pedir al dueño que lo
-- apruebe/rechace por email con un link firmado (token único + vencimiento).
-- aprobacion_estado NULL = no se pidió aprobación (flujo directo de siempre).
-- ════════════════════════════════════════════════════════════════════════

alter table public.actualizaciones_contrato
  add column if not exists aprobacion_estado text
    check (aprobacion_estado in ('pendiente', 'aprobado', 'rechazado')),
  add column if not exists aprobacion_token uuid,
  add column if not exists aprobacion_token_expira timestamptz,
  add column if not exists aprobacion_solicitada_at timestamptz,
  add column if not exists aprobacion_respondido_at timestamptz;

create index if not exists actualizaciones_aprobacion_token_idx
  on public.actualizaciones_contrato (aprobacion_token);
