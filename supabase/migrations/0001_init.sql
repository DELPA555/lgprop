-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — Esquema inicial (Postgres / Supabase)
-- Sistema de administración de alquileres inmobiliarios.
-- ════════════════════════════════════════════════════════════════════════════

-- Extensiones
create extension if not exists pgcrypto;

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type estado_propiedad as enum ('alquilada', 'vacia');
exception when duplicate_object then null; end $$;

do $$ begin
  create type paga_expensas as enum ('inquilino', 'dueno');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_indice as enum ('ICL', 'IPC', 'Casa Propia', 'UVA', 'Combinado', 'Porcentaje fijo', 'Manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_contrato as enum ('activo', 'vencido', 'rescindido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_pago as enum ('pagado', 'pendiente', 'atrasado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type rol_usuario as enum ('admin', 'operador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_notificacion as enum ('vencimiento_contrato', 'actualizacion_monto', 'pago_atrasado', 'expensas_pendientes');
exception when duplicate_object then null; end $$;

-- ── Tablas ───────────────────────────────────────────────────────────────────

create table if not exists public.duenos (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  telefono     text,
  email        text,
  cbu          text,
  alias_cbu    text,
  notas        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.inquilinos (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  telefono          text,
  email             text,
  dni               text,
  garante_nombre    text,
  garante_telefono  text,
  garante_dni       text,
  notas             text,
  created_at        timestamptz not null default now()
);

create table if not exists public.propiedades (
  id             uuid primary key default gen_random_uuid(),
  direccion      text not null,
  tipo           text,
  dueno_id       uuid references public.duenos(id) on delete set null,
  estado         estado_propiedad not null default 'vacia',
  monto_expensas numeric(14,2) not null default 0,
  paga_expensas  paga_expensas not null default 'inquilino',
  notas          text,
  created_at     timestamptz not null default now()
);

create table if not exists public.contratos (
  id                              uuid primary key default gen_random_uuid(),
  propiedad_id                    uuid not null references public.propiedades(id) on delete restrict,
  inquilino_id                    uuid not null references public.inquilinos(id) on delete restrict,
  dueno_id                        uuid references public.duenos(id) on delete set null,
  fecha_inicio                    date not null,
  fecha_fin                       date not null,
  monto_inicial                   numeric(14,2) not null,
  monto_actual                    numeric(14,2) not null,
  indice_actualizacion            tipo_indice not null default 'ICL',
  indice_secundario               tipo_indice,               -- para índice 'Combinado'
  frecuencia_actualizacion_meses  int not null default 3,
  duracion_meses                  int not null default 36,
  porcentaje_fijo                 numeric(6,2),              -- solo si indice = 'Porcentaje fijo'
  proxima_actualizacion           date,
  estado                          estado_contrato not null default 'activo',
  notas                           text,
  created_at                      timestamptz not null default now()
);

create table if not exists public.indices_valores (
  id           uuid primary key default gen_random_uuid(),
  tipo_indice  tipo_indice not null,
  fecha        date not null,
  valor        numeric(18,6) not null,
  fuente       text,                                          -- 'BCRA' | 'INDEC' | 'manual'
  created_at   timestamptz not null default now(),
  unique (tipo_indice, fecha)
);

create table if not exists public.actualizaciones_contrato (
  id                     uuid primary key default gen_random_uuid(),
  contrato_id            uuid not null references public.contratos(id) on delete cascade,
  fecha_calculo          date not null default current_date,
  monto_anterior         numeric(14,2) not null,
  monto_nuevo            numeric(14,2) not null,
  indice_usado           tipo_indice not null,
  coeficiente            numeric(12,6),
  confirmado_por_usuario boolean not null default false,
  confirmado_at          timestamptz,
  confirmado_por         uuid references auth.users(id) on delete set null,
  created_at             timestamptz not null default now()
);

create table if not exists public.pagos (
  id                  uuid primary key default gen_random_uuid(),
  contrato_id         uuid not null references public.contratos(id) on delete cascade,
  mes_correspondiente date not null,                          -- primer día del mes
  monto               numeric(14,2) not null,
  fecha_pago          date,
  estado              estado_pago not null default 'pendiente',
  expensas_pagadas    boolean not null default false,
  notas               text,
  created_at          timestamptz not null default now(),
  unique (contrato_id, mes_correspondiente)
);

create table if not exists public.usuarios_equipo (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  nombre        text not null,
  email         text not null,
  rol           rol_usuario not null default 'operador',
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.notificaciones (
  id            uuid primary key default gen_random_uuid(),
  tipo          tipo_notificacion not null,
  contrato_id   uuid references public.contratos(id) on delete cascade,
  titulo        text not null,
  mensaje       text not null,
  leida         boolean not null default false,
  email_enviado boolean not null default false,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

-- ── Índices de performance ───────────────────────────────────────────────────
create index if not exists idx_propiedades_dueno       on public.propiedades(dueno_id);
create index if not exists idx_contratos_propiedad     on public.contratos(propiedad_id);
create index if not exists idx_contratos_inquilino     on public.contratos(inquilino_id);
create index if not exists idx_contratos_estado        on public.contratos(estado);
create index if not exists idx_contratos_fecha_fin     on public.contratos(fecha_fin);
create index if not exists idx_contratos_prox_actual   on public.contratos(proxima_actualizacion);
create index if not exists idx_indices_tipo_fecha      on public.indices_valores(tipo_indice, fecha desc);
create index if not exists idx_actualiz_contrato       on public.actualizaciones_contrato(contrato_id);
create index if not exists idx_pagos_contrato          on public.pagos(contrato_id);
create index if not exists idx_pagos_estado            on public.pagos(estado);
create index if not exists idx_pagos_mes               on public.pagos(mes_correspondiente);
create index if not exists idx_notif_leida             on public.notificaciones(leida, created_at desc);

-- ── Helpers de autorización (SECURITY DEFINER: evitan recursión de RLS) ───────
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios_equipo
    where auth_user_id = auth.uid() and activo = true
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios_equipo
    where auth_user_id = auth.uid() and activo = true and rol = 'admin'
  );
$$;

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.duenos                   enable row level security;
alter table public.inquilinos               enable row level security;
alter table public.propiedades              enable row level security;
alter table public.contratos                enable row level security;
alter table public.indices_valores          enable row level security;
alter table public.actualizaciones_contrato enable row level security;
alter table public.pagos                    enable row level security;
alter table public.usuarios_equipo          enable row level security;
alter table public.notificaciones           enable row level security;

-- Tablas de datos operativos: acceso total para miembros activos del equipo.
-- (La diferenciación fina admin/operador se puede endurecer más adelante.)
do $$
declare t text;
begin
  foreach t in array array[
    'duenos','inquilinos','propiedades','contratos',
    'indices_valores','actualizaciones_contrato','pagos','notificaciones'
  ]
  loop
    execute format('drop policy if exists %I on public.%I;', t || '_member_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (public.is_active_member()) with check (public.is_active_member());',
      t || '_member_all', t
    );
  end loop;
end $$;

-- usuarios_equipo:
--  - cualquier miembro activo puede leer la lista del equipo
--  - cada usuario puede leer su propia fila (para bootstrap del rol)
--  - solo admin puede crear / editar / borrar usuarios
drop policy if exists usuarios_equipo_select on public.usuarios_equipo;
create policy usuarios_equipo_select on public.usuarios_equipo
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_active_member());

drop policy if exists usuarios_equipo_admin_write on public.usuarios_equipo;
create policy usuarios_equipo_admin_write on public.usuarios_equipo
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- NOTA DE BOOTSTRAP:
-- La primera cuenta admin se crea a mano (RLS bloquea la auto-inserción):
--   1) Registrar el usuario en Supabase Auth (Dashboard → Authentication).
--   2) Ejecutar en el SQL Editor con rol de servicio:
--        insert into public.usuarios_equipo (auth_user_id, nombre, email, rol)
--        values ('<uuid-del-auth-user>', 'Nombre', 'mail@dominio.com', 'admin');
--   Desde ahí, ese admin ya puede dar de alta al resto del equipo desde la app.
-- ════════════════════════════════════════════════════════════════════════════
