-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0003: trazabilidad de contratos redactados / cargados con IA
-- Guarda un registro de cada contrato que la IA redacta o del que extrae datos,
-- con fecha y usuario que lo generó, para tener auditoría.
--   origen = 'redaccion'   → contrato nuevo redactado por IA
--   origen = 'extraccion'  → datos extraídos de un PDF/imagen existente
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.contratos_generados (
  id                 uuid primary key default gen_random_uuid(),
  contrato_id        uuid references public.contratos(id) on delete set null,
  origen             text not null default 'redaccion',
  generado_por       uuid,          -- auth.uid() del usuario que lo generó
  generado_por_nombre text,
  datos              jsonb,         -- datos de entrada (partes, montos, plazo, etc.)
  texto              text,          -- texto del contrato redactado (si aplica)
  created_at         timestamptz not null default now()
);

create index if not exists contratos_generados_contrato_idx
  on public.contratos_generados (contrato_id);
create index if not exists contratos_generados_created_idx
  on public.contratos_generados (created_at desc);

-- RLS: acceso total para miembros activos del equipo (mismo criterio que el resto
-- de las tablas operativas). La inserción real la hacen las Edge Functions con
-- service role, pero la lectura del historial se hace desde la app.
alter table public.contratos_generados enable row level security;

drop policy if exists contratos_generados_member_all on public.contratos_generados;
create policy contratos_generados_member_all on public.contratos_generados
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
