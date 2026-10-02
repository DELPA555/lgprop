-- ════════════════════════════════════════════════════════════════════════════
-- 0034 · Corrección manual de comisión + contratos de "solo seguimiento"
-- El valor EFECTIVO de comisión se escribe en pagos.monto_comision (vía trigger),
-- así Liquidaciones, Sociedad y reportes —que ya leen monto_comision— usan el
-- valor real (manual si existe, automático si no) SIN cambios en esos módulos.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Campos nuevos ─────────────────────────────────────────────────────────────
-- Contrato que NO cobra comisión (seguimiento de conocidos): nunca sugiere comisión.
alter table public.contratos
  add column if not exists cobra_comision boolean not null default true;

-- Override manual de comisión por pago:
--   comision_manual  = monto real (NULL = usar cálculo automático)
--   comision_percibida = false → se percibió $0 explícitamente (pisa todo)
alter table public.pagos
  add column if not exists comision_manual    numeric,
  add column if not exists comision_percibida boolean not null default true;

-- ── pct = 0 también cuando el contrato no cobra comisión ──────────────────────
create or replace function public.pct_comision_contrato(p_contrato_id uuid)
returns numeric language sql stable as $$
  select case
           when not coalesce(c.cobra_comision, true) then 0
           when coalesce(p.administrada, true)
             then coalesce(p.porcentaje_comision, d.porcentaje_comision, 0)
           else 0
         end
  from public.contratos c
  join public.propiedades p on p.id = c.propiedad_id
  left join public.duenos d on d.id = coalesce(p.dueno_id, c.dueno_id)
  where c.id = p_contrato_id;
$$;

-- ── Trigger de comisión: ahora calcula la comisión EFECTIVA ───────────────────
create or replace function public.calc_comision_pago()
returns trigger language plpgsql as $$
declare
  pct numeric(5,2);
  v_moneda moneda;
  v_rate numeric;
  v_auto numeric;
begin
  pct := coalesce(public.pct_comision_contrato(new.contrato_id), 0);
  new.porcentaje_comision_aplicado := pct;
  v_auto := round(new.monto * pct / 100.0, 2);

  -- Comisión EFECTIVA (prioridad: percibida=false → $0; manual; si no, automático)
  if new.comision_percibida is false then
    new.monto_comision := 0;
  elsif new.comision_manual is not null then
    new.monto_comision := new.comision_manual;
  else
    new.monto_comision := v_auto;
  end if;
  new.monto_neto := new.monto - new.monto_comision;

  select moneda into v_moneda from public.contratos where id = new.contrato_id;
  if v_moneda = 'USD' then
    v_rate := public.cotizacion_para_pago(new.fecha_pago);
    new.cotizacion_usada := v_rate;
    new.monto_ars := round(new.monto * coalesce(v_rate, 0), 2);
  else
    new.cotizacion_usada := null;
    new.monto_ars := new.monto;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calc_comision_pago on public.pagos;
create trigger trg_calc_comision_pago
  before insert or update of monto, contrato_id, fecha_pago, comision_manual, comision_percibida on public.pagos
  for each row execute function public.calc_comision_pago();

-- ── Al togglear cobra_comision en un contrato, recalcular sus pagos existentes ─
create or replace function public.recompute_comision_contrato()
returns trigger language plpgsql as $$
begin
  -- monto está en el UPDATE OF del trigger de pagos → forzar recálculo sin cambiar datos
  update public.pagos set monto = monto where contrato_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_recompute_comision_contrato on public.contratos;
create trigger trg_recompute_comision_contrato
  after update of cobra_comision on public.contratos
  for each row when (old.cobra_comision is distinct from new.cobra_comision)
  execute function public.recompute_comision_contrato();

-- ── Log de cada edición manual de comisión (plata → trazabilidad completa) ─────
create or replace function public.log_comision_manual()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pct numeric; v_auto numeric;
begin
  if (new.comision_manual is distinct from old.comision_manual)
     or (new.comision_percibida is distinct from old.comision_percibida) then
    v_pct := coalesce(public.pct_comision_contrato(new.contrato_id), 0);
    v_auto := round(new.monto * v_pct / 100.0, 2);
    perform public.registrar_log('comision_manual', 'pagos', new.id, jsonb_build_object(
      'comision_automatica', v_auto,
      'comision_final', new.monto_comision,
      'percibida', new.comision_percibida,
      'manual', new.comision_manual
    ));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_comision_manual on public.pagos;
create trigger trg_log_comision_manual
  after update of comision_manual, comision_percibida on public.pagos
  for each row execute function public.log_comision_manual();
