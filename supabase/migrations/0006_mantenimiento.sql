-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0006: Historial de mantenimiento / reclamos por propiedad
-- Cada reclamo pertenece a una propiedad, tiene estado y opcionalmente costo.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  create type estado_mantenimiento as enum ('pendiente', 'en_proceso', 'resuelto');
exception when duplicate_object then null; end $$;

create table if not exists public.mantenimiento (
  id               uuid primary key default gen_random_uuid(),
  propiedad_id     uuid not null references public.propiedades(id) on delete cascade,
  fecha_reporte    date not null default current_date,
  descripcion      text not null,
  estado           estado_mantenimiento not null default 'pendiente',
  fecha_resolucion date,
  costo            numeric(12, 2), -- opcional
  notas            text,
  created_at       timestamptz not null default now()
);

create index if not exists mantenimiento_propiedad_idx on public.mantenimiento (propiedad_id);
create index if not exists mantenimiento_estado_idx on public.mantenimiento (estado);

alter table public.mantenimiento enable row level security;
drop policy if exists mantenimiento_member_all on public.mantenimiento;
create policy mantenimiento_member_all on public.mantenimiento
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
