-- ════════════════════════════════════════════════════════════════════════════
-- 0035 · Honorarios por operación: estado "Exento" + monto real + seguimiento
--   - estado_honorario gana 'exento' (no corresponde cobrar; no suma a Sociedad
--     ni a KPIs de pendientes).
--   - monto_real: si tiene valor, pisa el sugerido en TODOS los cálculos.
--   - Contratos de seguimiento (cobra_comision=false): no generan honorario, y si
--     ya tenían uno pasa a 'exento' automáticamente.
-- ════════════════════════════════════════════════════════════════════════════

-- Nuevo estado (no se usa en una sentencia de datos dentro de esta migración,
-- solo en cuerpos de funciones → seguro en la misma transacción).
alter type public.estado_honorario add value if not exists 'exento';

alter table public.honorarios_operacion
  add column if not exists monto_real    numeric,  -- si no null, pisa `monto` sugerido
  add column if not exists motivo_exento text;      -- opcional (cortesía, conocido, etc.)

-- gen_honorario: no generar honorario para contratos de seguimiento histórico.
create or replace function public.gen_honorario_contrato()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.cobra_comision, true) = false then
    return new; -- contrato de seguimiento: sin honorario
  end if;
  insert into public.honorarios_operacion (contrato_id, monto, moneda, estado)
  values (new.id, coalesce(new.monto_inicial, 0), coalesce(new.moneda, 'ARS'), 'pendiente')
  on conflict (contrato_id) do nothing;
  return new;
end;
$$;
-- (el trigger trg_gen_honorario ya existe y usa esta función)

-- Al marcar un contrato como seguimiento (cobra_comision=false), su honorario → exento.
create or replace function public.honorario_a_exento_seguimiento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.honorarios_operacion
     set estado = 'exento',
         fecha_cobro = null,
         motivo_exento = coalesce(motivo_exento, 'seguimiento histórico')
   where contrato_id = new.id and estado <> 'exento';
  return new;
end;
$$;

drop trigger if exists trg_honorario_seguimiento on public.contratos;
create trigger trg_honorario_seguimiento
  after update of cobra_comision on public.contratos
  for each row when (new.cobra_comision = false and old.cobra_comision is distinct from new.cobra_comision)
  execute function public.honorario_a_exento_seguimiento();

-- Log de cambios a exento / edición de monto_real (cifras de dinero → trazabilidad).
create or replace function public.log_honorario_cambio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'exento' and old.estado is distinct from 'exento' then
    perform public.registrar_log('honorario_exento', 'honorarios_operacion', new.id,
      jsonb_build_object('estado_antes', old.estado, 'motivo', new.motivo_exento));
  end if;
  if new.monto_real is distinct from old.monto_real then
    perform public.registrar_log('honorario_monto_real', 'honorarios_operacion', new.id,
      jsonb_build_object('antes', old.monto_real, 'despues', new.monto_real, 'sugerido', new.monto));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_honorario on public.honorarios_operacion;
create trigger trg_log_honorario
  after update of estado, monto_real on public.honorarios_operacion
  for each row execute function public.log_honorario_cambio();
