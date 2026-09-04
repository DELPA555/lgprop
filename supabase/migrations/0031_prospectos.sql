-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0031: Prospectos (leads de redes sociales)
-- Contactos que escriben por Instagram/Facebook consultando por propiedades, para
-- no perderlos y poder recontactarlos. Carga 100% manual (sin API de Meta).
-- Nota: el módulo previo "Prospectos" (tabla `interesados`, pipeline por
-- propiedad) se renombra a "Interesados"; esto es un concepto distinto.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  create type red_origen_prospecto as enum ('instagram', 'facebook', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_prospecto as enum ('nuevo', 'contactado', 'seguimiento', 'descartado', 'convertido');
exception when duplicate_object then null; end $$;

create table if not exists public.prospectos (
  id                     uuid primary key default gen_random_uuid(),
  nombre                 text not null,
  telefono               text,
  red_origen             red_origen_prospecto not null default 'instagram',
  fecha_contacto         date not null default current_date,
  -- Propiedad de interés: vínculo opcional a una propiedad + texto libre
  propiedad_id           uuid references public.propiedades(id) on delete set null,
  propiedad_interes      text,
  notas                  text,
  estado                 estado_prospecto not null default 'nuevo',
  -- Trazabilidad si se convierte en cliente
  convertido_inquilino_id uuid references public.inquilinos(id) on delete set null,
  convertido_dueno_id     uuid references public.duenos(id) on delete set null,
  creado_por             uuid,
  created_at             timestamptz not null default now()
);

create index if not exists prospectos_estado_idx on public.prospectos (estado);
create index if not exists prospectos_red_idx on public.prospectos (red_origen);
create index if not exists prospectos_fecha_idx on public.prospectos (fecha_contacto desc);

alter table public.prospectos enable row level security;
drop policy if exists prospectos_member_all on public.prospectos;
create policy prospectos_member_all on public.prospectos
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
