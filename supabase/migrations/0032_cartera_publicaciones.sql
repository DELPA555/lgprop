-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0032: Cartera disponible (publicación comercial de propiedades)
-- Extiende `propiedades` con los datos de la oferta comercial (venta/alquiler),
-- crea `fotos_propiedad` (galería) y el bucket privado `fotos-propiedades`.
-- El modelo es 1:1 con la propiedad (no se separa en `publicaciones`): una
-- propiedad tiene a lo sumo una oferta comercial activa.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Enums de la oferta ──────────────────────────────────────────────────────
do $$ begin
  create type public.disponible_para_propiedad as enum ('alquiler', 'venta', 'ambas', 'ninguna');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_oferta_propiedad as enum ('disponible', 'reservada', 'en_proceso', 'no_disponible');
exception when duplicate_object then null; end $$;

-- ── Columnas de publicación en propiedades ──────────────────────────────────
alter table public.propiedades
  add column if not exists disponible_para        public.disponible_para_propiedad not null default 'ninguna',
  add column if not exists estado_oferta          public.estado_oferta_propiedad   not null default 'disponible',
  add column if not exists precio_alquiler        numeric,
  add column if not exists moneda_alquiler        public.moneda not null default 'ARS',
  add column if not exists precio_venta           numeric,
  add column if not exists moneda_venta           public.moneda not null default 'USD',
  add column if not exists descripcion_publicacion text,
  add column if not exists ambientes              integer,
  add column if not exists dormitorios            integer,
  add column if not exists banos                  integer,
  add column if not exists superficie_m2          numeric,
  add column if not exists cochera                boolean not null default false;

-- Índice para el listado de cartera (propiedades ofrecidas)
create index if not exists propiedades_disponible_para_idx
  on public.propiedades (disponible_para) where disponible_para <> 'ninguna';

-- ── Fotos de la propiedad (galería) ─────────────────────────────────────────
create table if not exists public.fotos_propiedad (
  id            uuid primary key default gen_random_uuid(),
  propiedad_id  uuid not null references public.propiedades(id) on delete cascade,
  path          text not null,        -- ruta dentro del bucket 'fotos-propiedades'
  orden         integer not null default 0,
  es_portada    boolean not null default false,
  subido_por    uuid,
  created_at    timestamptz not null default now()
);

create index if not exists fotos_propiedad_propiedad_idx
  on public.fotos_propiedad (propiedad_id, orden);

alter table public.fotos_propiedad enable row level security;
drop policy if exists fotos_propiedad_member_all on public.fotos_propiedad;
create policy fotos_propiedad_member_all on public.fotos_propiedad
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

-- ── Bucket privado de fotos ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('fotos-propiedades', 'fotos-propiedades', false)
  on conflict (id) do nothing;

drop policy if exists "fotos_propiedades_select" on storage.objects;
create policy "fotos_propiedades_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'fotos-propiedades' and public.is_active_member());

drop policy if exists "fotos_propiedades_insert" on storage.objects;
create policy "fotos_propiedades_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fotos-propiedades' and public.is_active_member());

drop policy if exists "fotos_propiedades_update" on storage.objects;
create policy "fotos_propiedades_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'fotos-propiedades' and public.is_active_member());

drop policy if exists "fotos_propiedades_delete" on storage.objects;
create policy "fotos_propiedades_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fotos-propiedades' and public.is_active_member());

-- ── Datos de contacto para la ficha compartible (editables en Ajustes) ──────
-- Van al pie del PDF de ficha de cara al cliente. Vacíos = no se muestran.
insert into public.configuracion (clave, valor) values
  ('ficha_contacto_telefono', ''),
  ('ficha_contacto_email', ''),
  ('ficha_contacto_web', '')
on conflict (clave) do nothing;
