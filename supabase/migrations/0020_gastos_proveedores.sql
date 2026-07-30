-- ════════════════════════════════════════════════════════════════════════
-- 0020 · Módulo Consorcios (Tanda 2) — proveedores y gastos del edificio
-- ════════════════════════════════════════════════════════════════════════

-- ── Proveedores de cada edificio ──────────────────────────────────────────
create table if not exists public.proveedores_edificio (
  id             uuid primary key default gen_random_uuid(),
  consorcio_id   uuid not null references public.consorcios(id) on delete cascade,
  nombre         text not null,
  servicio       text,                 -- qué presta: limpieza, ascensor, seguridad…
  telefono       text,
  email          text,
  frecuencia_pago text,                -- mensual, bimestral, por evento…
  condiciones    text,                 -- contrato / condiciones si aplica
  notas          text,
  created_at     timestamptz not null default now()
);

create index if not exists proveedores_edificio_consorcio_idx
  on public.proveedores_edificio (consorcio_id);

-- ── Gastos del edificio, por mes y categoría ──────────────────────────────
create table if not exists public.gastos_edificio (
  id                 uuid primary key default gen_random_uuid(),
  consorcio_id       uuid not null references public.consorcios(id) on delete cascade,
  proveedor_id       uuid references public.proveedores_edificio(id) on delete set null,
  concepto           text not null,
  categoria          text,             -- limpieza, seguridad, ascensor, luz, gas, sueldos…
  monto              numeric(14, 2) not null default 0,
  fecha              date not null default current_date,
  mes_correspondiente date not null,   -- YYYY-MM-01 (a qué liquidación imputa)
  notas              text,
  created_at         timestamptz not null default now()
);

create index if not exists gastos_edificio_consorcio_idx
  on public.gastos_edificio (consorcio_id);
create index if not exists gastos_edificio_mes_idx
  on public.gastos_edificio (consorcio_id, mes_correspondiente);

-- ── RLS: cualquier miembro activo del equipo ──────────────────────────────
alter table public.proveedores_edificio enable row level security;
alter table public.gastos_edificio enable row level security;

drop policy if exists proveedores_edificio_member_all on public.proveedores_edificio;
create policy proveedores_edificio_member_all on public.proveedores_edificio
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists gastos_edificio_member_all on public.gastos_edificio;
create policy gastos_edificio_member_all on public.gastos_edificio
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
