-- ════════════════════════════════════════════════════════════════════════════
-- 0036 · Separar "seguimiento histórico" de la comisión mensual
-- BUG de lógica (0034/0035): el flag de seguimiento (cobra_comision=false)
-- apagaba el honorario de operación (correcto) PERO también la comisión mensual
-- de administración (incorrecto). Son independientes:
--   • carga_seguimiento → exime SOLO el honorario de operación.
--   • comisión mensual  → depende SOLO de administrada + porcentaje_comision.
-- Orden cuidado: primero se quitan triggers/funciones que referencian el flag,
-- luego se renombra la columna y se actualizan los datos.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Quitar triggers/función que dependen del flag (referencian la columna).
drop trigger if exists trg_recompute_comision_contrato on public.contratos;
drop function if exists public.recompute_comision_contrato();
drop trigger if exists trg_honorario_seguimiento on public.contratos;

-- 2) Comisión mensual: depende SOLO de administrada + % (ya no mira el flag).
--    (Se reemplaza ANTES del rename para que no quede referenciando la columna.)
create or replace function public.pct_comision_contrato(p_contrato_id uuid)
returns numeric language sql stable as $$
  select case
           when coalesce(p.administrada, true)
             then coalesce(p.porcentaje_comision, d.porcentaje_comision, 0)
           else 0
         end
  from public.contratos c
  join public.propiedades p on p.id = c.propiedad_id
  left join public.duenos d on d.id = coalesce(p.dueno_id, c.dueno_id)
  where c.id = p_contrato_id;
$$;

-- 3) Renombrar e invertir el flag: cobra_comision(true=cobra) → carga_seguimiento(true=seguimiento)
alter table public.contratos rename column cobra_comision to carga_seguimiento;
update public.contratos set carga_seguimiento = not carga_seguimiento;
alter table public.contratos alter column carga_seguimiento set default false;

-- 4) gen_honorario: no genera honorario para contratos de seguimiento
create or replace function public.gen_honorario_contrato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.carga_seguimiento, false) = true then
    return new; -- seguimiento histórico: sin honorario de operación
  end if;
  insert into public.honorarios_operacion (contrato_id, monto, moneda, estado)
  values (new.id, coalesce(new.monto_inicial, 0), coalesce(new.moneda, 'ARS'), 'pendiente')
  on conflict (contrato_id) do nothing;
  return new;
end; $$;

-- 5) Al marcar un contrato como seguimiento → su honorario pasa a exento
create or replace function public.honorario_a_exento_seguimiento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.honorarios_operacion
     set estado = 'exento', fecha_cobro = null,
         motivo_exento = coalesce(motivo_exento, 'seguimiento histórico')
   where contrato_id = new.id and estado <> 'exento';
  return new;
end; $$;
create trigger trg_honorario_seguimiento
  after update of carga_seguimiento on public.contratos
  for each row when (new.carga_seguimiento = true and old.carga_seguimiento is distinct from new.carga_seguimiento)
  execute function public.honorario_a_exento_seguimiento();
