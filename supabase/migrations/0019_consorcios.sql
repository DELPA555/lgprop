-- ════════════════════════════════════════════════════════════════════════
-- 0019 · Módulo Consorcios (Tanda 1) — edificios, propietarios y unidades
-- Servicio nuevo dentro de LG Prop. Reutiliza el patrón de RLS (is_active_member)
-- y de auditoría (registrar_log) del resto del sistema.
-- ════════════════════════════════════════════════════════════════════════

-- ── Edificios administrados ───────────────────────────────────────────────
create table if not exists public.consorcios (
  id                         uuid primary key default gen_random_uuid(),
  nombre                     text not null,
  direccion                  text,
  cuit                       text,
  cantidad_unidades          integer not null default 0,
  administrador_usuario_id   uuid references public.usuarios_equipo(id) on delete set null,
  administrador_nombre       text,          -- por si el administrador no es un usuario del sistema
  fecha_inicio_administracion date not null default current_date,
  notas                      text,
  created_at                 timestamptz not null default now()
);

-- ── Propietarios de unidades (tabla propia, independiente de "duenos" de alquiler) ──
create table if not exists public.propietarios_consorcio (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  telefono   text,
  email      text,
  cbu        text,
  alias_cbu  text,
  notas      text,
  created_at timestamptz not null default now()
);

-- ── Unidades funcionales (piso/depto) con su % fiscal ─────────────────────
create table if not exists public.unidades_funcionales (
  id               uuid primary key default gen_random_uuid(),
  consorcio_id     uuid not null references public.consorcios(id) on delete cascade,
  identificador    text not null,                 -- ej: "3° B", "PB Local 2"
  propietario_id   uuid references public.propietarios_consorcio(id) on delete set null,
  porcentaje_fiscal numeric(7, 3) not null default 0,  -- cuánto paga de expensas sobre el total
  notas            text,
  created_at       timestamptz not null default now()
);

create index if not exists unidades_funcionales_consorcio_idx
  on public.unidades_funcionales (consorcio_id);
create index if not exists unidades_funcionales_propietario_idx
  on public.unidades_funcionales (propietario_id);

-- ── RLS: cualquier miembro activo del equipo (mismo criterio que el resto) ──
alter table public.consorcios enable row level security;
alter table public.propietarios_consorcio enable row level security;
alter table public.unidades_funcionales enable row level security;

drop policy if exists consorcios_member_all on public.consorcios;
create policy consorcios_member_all on public.consorcios
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists propietarios_consorcio_member_all on public.propietarios_consorcio;
create policy propietarios_consorcio_member_all on public.propietarios_consorcio
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists unidades_funcionales_member_all on public.unidades_funcionales;
create policy unidades_funcionales_member_all on public.unidades_funcionales
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

-- ── Auditoría: registrar alta/baja de consorcios (reutiliza registrar_log) ──
create or replace function public.trg_log_consorcio_ins() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.registrar_log('crear', 'consorcios', new.id,
    jsonb_build_object('nombre', new.nombre, 'direccion', new.direccion));
  return new;
end; $$;
drop trigger if exists log_consorcio_ins on public.consorcios;
create trigger log_consorcio_ins after insert on public.consorcios
  for each row execute function public.trg_log_consorcio_ins();

create or replace function public.trg_log_consorcio_del() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.registrar_log('eliminar', 'consorcios', old.id,
    jsonb_build_object('nombre', old.nombre));
  return old;
end; $$;
drop trigger if exists log_consorcio_del on public.consorcios;
create trigger log_consorcio_del after delete on public.consorcios
  for each row execute function public.trg_log_consorcio_del();
