-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0012: Contratos en dólares o mixtos + cotización del dólar
--  - contratos.moneda (ARS/USD) y contratos.indice_sobre (para contratos mixtos:
--    sobre qué moneda se aplica el índice; NULL = misma que la moneda del contrato)
--  - tabla cotizaciones_dolar (oficial/blue/mep, cargada por cron)
--  - pagos.monto_ars + cotizacion_usada: al pagar un contrato USD, se guarda el
--    equivalente en pesos según la cotización (blue por defecto, configurable)
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  create type moneda as enum ('ARS', 'USD');
exception when duplicate_object then null; end $$;

alter table public.contratos
  add column if not exists moneda moneda not null default 'ARS',
  add column if not exists indice_sobre moneda; -- NULL = misma moneda que el contrato

-- ── Cotizaciones del dólar ──────────────────────────────────────────────────
create table if not exists public.cotizaciones_dolar (
  id         uuid primary key default gen_random_uuid(),
  fecha      date not null,
  tipo       text not null,          -- 'oficial' | 'blue' | 'mep'
  compra     numeric(12, 2),
  venta      numeric(12, 2),
  fuente     text,
  created_at timestamptz not null default now(),
  unique (fecha, tipo)
);
create index if not exists cotizaciones_dolar_fecha_idx on public.cotizaciones_dolar (fecha desc);

alter table public.cotizaciones_dolar enable row level security;
drop policy if exists cotizaciones_dolar_member_all on public.cotizaciones_dolar;
create policy cotizaciones_dolar_member_all on public.cotizaciones_dolar
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

-- Tipo de cotización que se usa para convertir pagos USD → ARS (configurable)
insert into public.configuracion (clave, valor)
  values ('cotizacion_pagos_tipo', 'blue')
  on conflict (clave) do nothing;

-- ── Equivalente en pesos de cada pago ───────────────────────────────────────
alter table public.pagos
  add column if not exists cotizacion_usada numeric(12, 2),
  add column if not exists monto_ars numeric(14, 2);

-- Cotización (venta) del tipo configurado para una fecha dada (o la última <= fecha,
-- o la última disponible).
create or replace function public.cotizacion_para_pago(p_fecha date)
returns numeric
language plpgsql
stable
as $$
declare
  v_tipo text;
  v_val numeric;
begin
  select valor into v_tipo from public.configuracion where clave = 'cotizacion_pagos_tipo';
  v_tipo := coalesce(v_tipo, 'blue');
  if p_fecha is not null then
    select venta into v_val from public.cotizaciones_dolar
      where tipo = v_tipo and fecha <= p_fecha order by fecha desc limit 1;
  end if;
  if v_val is null then
    select venta into v_val from public.cotizaciones_dolar
      where tipo = v_tipo order by fecha desc limit 1;
  end if;
  return v_val;
end;
$$;

-- Extiende el trigger de comisión: además calcula el equivalente en pesos.
create or replace function public.calc_comision_pago()
returns trigger
language plpgsql
as $$
declare
  pct numeric(5, 2);
  v_moneda moneda;
  v_rate numeric;
begin
  pct := coalesce(public.pct_comision_contrato(new.contrato_id), 0);
  new.porcentaje_comision_aplicado := pct;
  new.monto_comision := round(new.monto * pct / 100.0, 2);
  new.monto_neto := new.monto - new.monto_comision;

  select moneda into v_moneda from public.contratos where id = new.contrato_id;
  if v_moneda = 'USD' then
    v_rate := public.cotizacion_para_pago(new.fecha_pago);
    new.cotizacion_usada := v_rate;
    new.monto_ars := round(new.monto * coalesce(v_rate, 0), 2);
  else
    new.cotizacion_usada := null;
    new.monto_ars := new.monto; -- en ARS el equivalente en pesos es el propio monto
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calc_comision_pago on public.pagos;
create trigger trg_calc_comision_pago
  before insert or update of monto, contrato_id, fecha_pago on public.pagos
  for each row execute function public.calc_comision_pago();

-- Backfill: los pagos existentes son todos en ARS (equivalente en pesos = monto).
update public.pagos set monto_ars = monto where monto_ars is null;
