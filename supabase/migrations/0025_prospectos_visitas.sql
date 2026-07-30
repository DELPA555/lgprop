-- ════════════════════════════════════════════════════════════════════════
-- 0025 · CRM de prospectos + Agenda de visitas (Bloque B)
-- interesados: quién preguntó por qué propiedad y en qué estado del pipeline.
-- visitas: agenda de visitas a propiedades, con recordatorio por el cron.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.interesados (
  id            uuid primary key default gen_random_uuid(),
  propiedad_id  uuid references public.propiedades(id) on delete cascade,
  nombre        text not null,
  telefono      text,
  email         text,
  fecha_consulta date not null default current_date,
  fecha_visita  date,
  estado        text not null default 'interesado'
                  check (estado in ('interesado', 'reservo', 'descartado')),
  origen        text,                 -- cómo llegó (portal, cartel, referido…)
  notas         text,
  creado_por    uuid references public.usuarios_equipo(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists interesados_propiedad_idx on public.interesados (propiedad_id);
create index if not exists interesados_estado_idx on public.interesados (estado);

create table if not exists public.visitas (
  id                   uuid primary key default gen_random_uuid(),
  propiedad_id         uuid references public.propiedades(id) on delete cascade,
  interesado_id        uuid references public.interesados(id) on delete set null,
  visitante            text,          -- nombre si no está ligado a un interesado
  fecha                timestamptz not null,
  asignado_a           uuid references public.usuarios_equipo(id) on delete set null,
  estado               text not null default 'programada'
                         check (estado in ('programada', 'realizada', 'cancelada')),
  notas                text,
  recordatorio_enviado boolean not null default false,
  created_at           timestamptz not null default now()
);
create index if not exists visitas_fecha_idx on public.visitas (fecha);
create index if not exists visitas_propiedad_idx on public.visitas (propiedad_id);

-- Nuevo tipo de notificación para el recordatorio de visita
alter type public.tipo_notificacion add value if not exists 'visita_proxima';

alter table public.interesados enable row level security;
alter table public.visitas enable row level security;

drop policy if exists interesados_member_all on public.interesados;
create policy interesados_member_all on public.interesados
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists visitas_member_all on public.visitas;
create policy visitas_member_all on public.visitas
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
