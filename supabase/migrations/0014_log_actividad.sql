-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0014: Auditoría / log de actividad
-- Registra automáticamente (vía triggers) las acciones sensibles: marcar un pago
-- como cobrado, editar el monto/estado o eliminar un contrato, editar el % de
-- comisión (dueño o propiedad) y marcar una liquidación como enviada.
-- Cada registro guarda quién (auth.uid + nombre), qué acción, qué tabla/registro,
-- el detalle (antes/después) y la fecha_hora. Solo el admin puede leerlo.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.log_actividad (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid,
  usuario_nombre  text,
  accion          text not null,        -- 'cobrar' | 'editar' | 'eliminar' | 'enviar'
  tabla_afectada  text not null,
  registro_id     uuid,
  detalle         jsonb,
  fecha_hora      timestamptz not null default now()
);
create index if not exists log_actividad_fecha_idx on public.log_actividad (fecha_hora desc);
create index if not exists log_actividad_usuario_idx on public.log_actividad (usuario_id);
create index if not exists log_actividad_accion_idx on public.log_actividad (accion);

alter table public.log_actividad enable row level security;
-- Solo el admin puede leer la auditoría. La escritura la hacen los triggers
-- (funciones SECURITY DEFINER, que saltean RLS).
drop policy if exists log_actividad_admin_read on public.log_actividad;
create policy log_actividad_admin_read on public.log_actividad
  for select to authenticated
  using (public.is_admin());

-- Helper: inserta un registro de auditoría resolviendo el usuario actual.
create or replace function public.registrar_log(
  p_accion text, p_tabla text, p_reg uuid, p_detalle jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nombre text;
begin
  if v_uid is not null then
    select nombre into v_nombre from public.usuarios_equipo where auth_user_id = v_uid;
  end if;
  insert into public.log_actividad (usuario_id, usuario_nombre, accion, tabla_afectada, registro_id, detalle)
  values (v_uid, v_nombre, p_accion, p_tabla, p_reg, p_detalle);
end;
$$;

-- ── Pago marcado como cobrado ───────────────────────────────────────────────
create or replace function public.trg_log_pago_cobrado() returns trigger
language plpgsql as $$
begin
  if new.estado = 'pagado' and (old.estado is distinct from 'pagado') then
    perform public.registrar_log('cobrar', 'pagos', new.id, jsonb_build_object(
      'monto', new.monto, 'monto_ars', new.monto_ars, 'fecha_pago', new.fecha_pago
    ));
  end if;
  return new;
end;
$$;
drop trigger if exists log_pago_cobrado on public.pagos;
create trigger log_pago_cobrado after update of estado on public.pagos
  for each row execute function public.trg_log_pago_cobrado();

-- ── Contrato: edición de monto/estado y eliminación ─────────────────────────
create or replace function public.trg_log_contrato_upd() returns trigger
language plpgsql as $$
declare d jsonb := '{}'::jsonb;
begin
  if old.monto_actual is distinct from new.monto_actual then
    d := d || jsonb_build_object('monto_actual', jsonb_build_object('antes', old.monto_actual, 'despues', new.monto_actual));
  end if;
  if old.monto_inicial is distinct from new.monto_inicial then
    d := d || jsonb_build_object('monto_inicial', jsonb_build_object('antes', old.monto_inicial, 'despues', new.monto_inicial));
  end if;
  if old.estado is distinct from new.estado then
    d := d || jsonb_build_object('estado', jsonb_build_object('antes', old.estado, 'despues', new.estado));
  end if;
  if d <> '{}'::jsonb then
    perform public.registrar_log('editar', 'contratos', new.id, d);
  end if;
  return new;
end;
$$;
drop trigger if exists log_contrato_upd on public.contratos;
create trigger log_contrato_upd after update on public.contratos
  for each row execute function public.trg_log_contrato_upd();

create or replace function public.trg_log_contrato_del() returns trigger
language plpgsql as $$
begin
  perform public.registrar_log('eliminar', 'contratos', old.id, jsonb_build_object(
    'propiedad_id', old.propiedad_id, 'inquilino_id', old.inquilino_id,
    'monto_actual', old.monto_actual, 'moneda', old.moneda
  ));
  return old;
end;
$$;
drop trigger if exists log_contrato_del on public.contratos;
create trigger log_contrato_del after delete on public.contratos
  for each row execute function public.trg_log_contrato_del();

-- ── Edición del % de comisión (dueño / propiedad) ───────────────────────────
create or replace function public.trg_log_comision_dueno() returns trigger
language plpgsql as $$
begin
  perform public.registrar_log('editar', 'duenos', new.id, jsonb_build_object(
    'porcentaje_comision', jsonb_build_object('antes', old.porcentaje_comision, 'despues', new.porcentaje_comision)
  ));
  return new;
end;
$$;
drop trigger if exists log_comision_dueno on public.duenos;
create trigger log_comision_dueno after update of porcentaje_comision on public.duenos
  for each row when (old.porcentaje_comision is distinct from new.porcentaje_comision)
  execute function public.trg_log_comision_dueno();

create or replace function public.trg_log_comision_prop() returns trigger
language plpgsql as $$
begin
  perform public.registrar_log('editar', 'propiedades', new.id, jsonb_build_object(
    'porcentaje_comision', jsonb_build_object('antes', old.porcentaje_comision, 'despues', new.porcentaje_comision)
  ));
  return new;
end;
$$;
drop trigger if exists log_comision_prop on public.propiedades;
create trigger log_comision_prop after update of porcentaje_comision on public.propiedades
  for each row when (old.porcentaje_comision is distinct from new.porcentaje_comision)
  execute function public.trg_log_comision_prop();

-- ── Liquidación marcada como enviada ────────────────────────────────────────
create or replace function public.trg_log_liq_enviada() returns trigger
language plpgsql as $$
begin
  if new.estado = 'enviada' and (old.estado is distinct from 'enviada') then
    perform public.registrar_log('enviar', 'liquidaciones', new.id, jsonb_build_object(
      'dueno_id', new.dueno_id, 'periodo', new.periodo, 'monto_neto', new.monto_neto
    ));
  end if;
  return new;
end;
$$;
drop trigger if exists log_liq_enviada on public.liquidaciones;
create trigger log_liq_enviada after update of estado on public.liquidaciones
  for each row execute function public.trg_log_liq_enviada();
