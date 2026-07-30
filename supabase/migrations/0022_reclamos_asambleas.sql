-- ════════════════════════════════════════════════════════════════════════
-- 0022 · Módulo Consorcios (Tanda 4) — reclamos y asambleas
-- reclamos_consorcio reutiliza el enum estado_mantenimiento del módulo de
-- mantenimiento de alquileres. Las actas de asamblea se guardan en el bucket
-- 'contratos-archivos' (mismo Storage) bajo el prefijo asambleas/.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.reclamos_consorcio (
  id               uuid primary key default gen_random_uuid(),
  consorcio_id     uuid not null references public.consorcios(id) on delete cascade,
  unidad_id        uuid references public.unidades_funcionales(id) on delete set null,
  descripcion      text not null,
  estado           estado_mantenimiento not null default 'pendiente',
  fecha_reporte    date not null default current_date,
  fecha_resolucion date,
  notas            text,
  created_at       timestamptz not null default now()
);
create index if not exists reclamos_consorcio_consorcio_idx
  on public.reclamos_consorcio (consorcio_id);
create index if not exists reclamos_consorcio_estado_idx
  on public.reclamos_consorcio (estado);

create table if not exists public.asambleas (
  id           uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null references public.consorcios(id) on delete cascade,
  fecha        date not null default current_date,
  temas        text,                 -- temas tratados
  acta_path    text,                 -- ruta en el bucket contratos-archivos (asambleas/…)
  acta_nombre  text,
  acta_tipo    text,
  created_at   timestamptz not null default now()
);
create index if not exists asambleas_consorcio_idx
  on public.asambleas (consorcio_id, fecha);

alter table public.reclamos_consorcio enable row level security;
alter table public.asambleas enable row level security;

drop policy if exists reclamos_consorcio_member_all on public.reclamos_consorcio;
create policy reclamos_consorcio_member_all on public.reclamos_consorcio
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists asambleas_member_all on public.asambleas;
create policy asambleas_member_all on public.asambleas
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
