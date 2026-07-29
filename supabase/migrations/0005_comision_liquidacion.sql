-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0005: Comisión y Liquidación a dueños
-- Modelo híbrido de comisión:
--   duenos.porcentaje_comision      → default del dueño (NOT NULL, default 0)
--   propiedades.porcentaje_comision → NULL = hereda del dueño; valor = override propio
-- Cada pago guarda automáticamente (vía trigger) el % aplicado, la comisión y el neto.
-- Tabla liquidaciones: una por dueño+período, con totales snapshot y estado.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Porcentaje de comisión ───────────────────────────────────────────────
alter table public.duenos
  add column if not exists porcentaje_comision numeric(5, 2) not null default 0;

alter table public.propiedades
  add column if not exists porcentaje_comision numeric(5, 2); -- NULL = hereda del dueño

-- ── 2. Comisión / neto por pago ─────────────────────────────────────────────
alter table public.pagos
  add column if not exists porcentaje_comision_aplicado numeric(5, 2) not null default 0,
  add column if not exists monto_comision numeric(12, 2) not null default 0,
  add column if not exists monto_neto numeric(12, 2) not null default 0;

-- % efectivo de un contrato = override de la propiedad, o si es NULL, el del dueño.
create or replace function public.pct_comision_contrato(p_contrato_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(p.porcentaje_comision, d.porcentaje_comision, 0)
  from public.contratos c
  join public.propiedades p on p.id = c.propiedad_id
  left join public.duenos d on d.id = coalesce(p.dueno_id, c.dueno_id)
  where c.id = p_contrato_id;
$$;

-- Trigger: al insertar o cambiar el monto/contrato de un pago, recalcula.
create or replace function public.calc_comision_pago()
returns trigger
language plpgsql
as $$
declare
  pct numeric(5, 2);
begin
  pct := coalesce(public.pct_comision_contrato(new.contrato_id), 0);
  new.porcentaje_comision_aplicado := pct;
  new.monto_comision := round(new.monto * pct / 100.0, 2);
  new.monto_neto := new.monto - new.monto_comision;
  return new;
end;
$$;

drop trigger if exists trg_calc_comision_pago on public.pagos;
create trigger trg_calc_comision_pago
  before insert or update of monto, contrato_id on public.pagos
  for each row execute function public.calc_comision_pago();

-- Backfill de los pagos existentes.
update public.pagos pg
set porcentaje_comision_aplicado = public.pct_comision_contrato(pg.contrato_id),
    monto_comision = round(pg.monto * public.pct_comision_contrato(pg.contrato_id) / 100.0, 2),
    monto_neto     = pg.monto - round(pg.monto * public.pct_comision_contrato(pg.contrato_id) / 100.0, 2);

-- ── 3. Liquidaciones ────────────────────────────────────────────────────────
do $$ begin
  create type estado_liquidacion as enum ('pendiente', 'enviada');
exception when duplicate_object then null; end $$;

create table if not exists public.liquidaciones (
  id             uuid primary key default gen_random_uuid(),
  dueno_id       uuid not null references public.duenos(id) on delete cascade,
  periodo        date not null,             -- primer día del mes (YYYY-MM-01)
  monto_bruto    numeric(12, 2) not null default 0,
  monto_comision numeric(12, 2) not null default 0,
  monto_neto     numeric(12, 2) not null default 0,
  cant_propiedades integer not null default 0,
  estado         estado_liquidacion not null default 'pendiente',
  enviada_at     timestamptz,
  generada_por   uuid,
  created_at     timestamptz not null default now(),
  unique (dueno_id, periodo)
);

create index if not exists liquidaciones_periodo_idx on public.liquidaciones (periodo);
create index if not exists liquidaciones_dueno_idx on public.liquidaciones (dueno_id);

alter table public.liquidaciones enable row level security;
drop policy if exists liquidaciones_member_all on public.liquidaciones;
create policy liquidaciones_member_all on public.liquidaciones
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
