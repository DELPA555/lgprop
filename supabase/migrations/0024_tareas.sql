-- ════════════════════════════════════════════════════════════════════════
-- 0024 · Tareas internas / checklist del equipo
-- Pendientes propios (no ligados a los avisos automáticos), ej: "llamar al
-- plomero de la propiedad X". Se pueden asignar a un miembro y a una propiedad.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.tareas (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null,
  descripcion   text,
  completada    boolean not null default false,
  prioridad     text not null default 'normal' check (prioridad in ('baja', 'normal', 'alta')),
  asignado_a    uuid references public.usuarios_equipo(id) on delete set null,
  propiedad_id  uuid references public.propiedades(id) on delete set null,
  fecha_limite  date,
  creada_por    uuid references public.usuarios_equipo(id) on delete set null,
  completada_at timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists tareas_completada_idx on public.tareas (completada);
create index if not exists tareas_asignado_idx on public.tareas (asignado_a);

alter table public.tareas enable row level security;
drop policy if exists tareas_member_all on public.tareas;
create policy tareas_member_all on public.tareas
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
