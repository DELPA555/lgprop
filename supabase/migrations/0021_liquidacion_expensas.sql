-- ════════════════════════════════════════════════════════════════════════
-- 0021 · Módulo Consorcios (Tanda 3) — liquidación de expensas + fondo reserva
-- ════════════════════════════════════════════════════════════════════════

-- ── Liquidación mensual de expensas de un consorcio ───────────────────────
create table if not exists public.liquidaciones_expensas (
  id                          uuid primary key default gen_random_uuid(),
  consorcio_id                uuid not null references public.consorcios(id) on delete cascade,
  mes                         date not null,                 -- YYYY-MM-01
  total_gastos                numeric(14, 2) not null default 0,
  monto_fondo_reserva_del_mes numeric(14, 2) not null default 0,
  base_a_repartir             numeric(14, 2) not null default 0, -- total_gastos + fondo
  fecha_generacion            timestamptz not null default now(),
  generada_por                uuid references public.usuarios_equipo(id) on delete set null,
  notas                       text,
  created_at                  timestamptz not null default now(),
  unique (consorcio_id, mes)
);
create index if not exists liquidaciones_expensas_consorcio_idx
  on public.liquidaciones_expensas (consorcio_id, mes);

-- ── Expensa que le toca a cada unidad en una liquidación ──────────────────
create table if not exists public.expensas_por_unidad (
  id                  uuid primary key default gen_random_uuid(),
  liquidacion_id      uuid not null references public.liquidaciones_expensas(id) on delete cascade,
  unidad_id           uuid references public.unidades_funcionales(id) on delete set null,
  identificador       text,                          -- snapshot por si se borra la unidad
  porcentaje_aplicado numeric(7, 3) not null default 0,
  monto_a_pagar       numeric(14, 2) not null default 0,
  estado              text not null default 'pendiente'
                        check (estado in ('pendiente', 'pagado', 'atrasado')),
  fecha_pago          date,
  created_at          timestamptz not null default now()
);
create index if not exists expensas_por_unidad_liq_idx
  on public.expensas_por_unidad (liquidacion_id);

-- ── Fondo de reserva: movimientos (aporte +, egreso -) por consorcio ──────
create table if not exists public.fondo_reserva (
  id             uuid primary key default gen_random_uuid(),
  consorcio_id   uuid not null references public.consorcios(id) on delete cascade,
  fecha          date not null default current_date,
  mes            date,                               -- opcional
  concepto       text not null,
  monto          numeric(14, 2) not null default 0,  -- + aporte / - egreso
  liquidacion_id uuid references public.liquidaciones_expensas(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists fondo_reserva_consorcio_idx
  on public.fondo_reserva (consorcio_id, fecha);

-- ── RLS: cualquier miembro activo del equipo ──────────────────────────────
alter table public.liquidaciones_expensas enable row level security;
alter table public.expensas_por_unidad enable row level security;
alter table public.fondo_reserva enable row level security;

drop policy if exists liquidaciones_expensas_member_all on public.liquidaciones_expensas;
create policy liquidaciones_expensas_member_all on public.liquidaciones_expensas
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists expensas_por_unidad_member_all on public.expensas_por_unidad;
create policy expensas_por_unidad_member_all on public.expensas_por_unidad
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

drop policy if exists fondo_reserva_member_all on public.fondo_reserva;
create policy fondo_reserva_member_all on public.fondo_reserva
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
