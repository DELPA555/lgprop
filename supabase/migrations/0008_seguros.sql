-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0008: Seguros / ART por propiedad + alerta de vencimiento
-- Cada propiedad puede tener uno o más seguros (seguro del inmueble, ART, otros)
-- con su fecha de vencimiento. El motor de avisos alerta cuando están por vencer.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  create type tipo_seguro as enum ('seguro', 'art', 'otro');
exception when duplicate_object then null; end $$;

create table if not exists public.seguros_propiedad (
  id                uuid primary key default gen_random_uuid(),
  propiedad_id      uuid not null references public.propiedades(id) on delete cascade,
  tipo              tipo_seguro not null default 'seguro',
  aseguradora       text,
  numero_poliza     text,
  fecha_vencimiento date not null,
  notas             text,
  created_at        timestamptz not null default now()
);

create index if not exists seguros_propiedad_propiedad_idx on public.seguros_propiedad (propiedad_id);
create index if not exists seguros_propiedad_venc_idx on public.seguros_propiedad (fecha_vencimiento);

alter table public.seguros_propiedad enable row level security;
drop policy if exists seguros_propiedad_member_all on public.seguros_propiedad;
create policy seguros_propiedad_member_all on public.seguros_propiedad
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

-- Tipo de notificación para el aviso de seguro por vencer.
alter type tipo_notificacion add value if not exists 'seguro_por_vencer';
