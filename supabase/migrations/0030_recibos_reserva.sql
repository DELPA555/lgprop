-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0030: Recibos de Reserva (locación y venta)
-- Tabla recibos_reserva + bucket privado 'recibos-reserva' (mismo patrón que
-- contratos-archivos) + seed de cláusulas por defecto en configuracion.
-- Cada recibo snapshotea su cláusula y montos en letras para trazabilidad.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin
  create type tipo_operacion_recibo as enum ('locacion', 'venta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_recibo_reserva as enum ('vigente', 'convertido', 'devuelto', 'perdido');
exception when duplicate_object then null; end $$;

-- ── Numeración correlativa ───────────────────────────────────────────────────
create sequence if not exists recibos_reserva_numero_seq;

-- ── Tabla ────────────────────────────────────────────────────────────────────
create table if not exists public.recibos_reserva (
  id                    uuid primary key default gen_random_uuid(),
  numero                bigint not null default nextval('recibos_reserva_numero_seq'),
  tipo                  tipo_operacion_recibo not null,
  -- Inmueble: propiedad del sistema (opcional) + dirección snapshot (obligatoria)
  propiedad_id          uuid references public.propiedades(id) on delete set null,
  direccion             text not null,
  -- Reservante: inquilino del sistema (opcional) + datos snapshot
  reservante_inquilino_id uuid references public.inquilinos(id) on delete set null,
  reservante_nombre     text not null,
  reservante_dni        text,
  reservante_domicilio  text,
  reservante_email      text,
  reservante_telefono   text,
  -- Importe recibido en concepto de reserva
  moneda                moneda not null default 'ARS',
  monto                 numeric(14,2) not null,
  monto_letras          text not null,
  -- Condiciones de la operación
  plazo_meses           int,            -- locación
  canon_total           numeric(14,2),  -- locación: canon locativo total
  monto_operacion       numeric(14,2),  -- venta: monto total pactado
  -- Textos institucionales snapshotados
  clausula              text not null,
  ciudad                text not null default 'Mar del Plata',
  registro              text not null default '4171',
  fecha                 date not null default current_date,
  -- Ciclo de vida de la reserva
  estado                estado_recibo_reserva not null default 'vigente',
  contrato_id           uuid references public.contratos(id) on delete set null,
  -- Archivo PDF en Storage
  pdf_path              text,
  -- Auditoría
  creado_por            uuid,
  created_at            timestamptz not null default now()
);

create index if not exists recibos_reserva_tipo_idx on public.recibos_reserva (tipo);
create index if not exists recibos_reserva_estado_idx on public.recibos_reserva (estado);
create index if not exists recibos_reserva_propiedad_idx on public.recibos_reserva (propiedad_id);
create index if not exists recibos_reserva_contrato_idx on public.recibos_reserva (contrato_id);

alter table public.recibos_reserva enable row level security;
drop policy if exists recibos_reserva_member_all on public.recibos_reserva;
create policy recibos_reserva_member_all on public.recibos_reserva
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());

-- ── Bucket privado para los PDF (mismo patrón que contratos-archivos) ─────────
insert into storage.buckets (id, name, public)
  values ('recibos-reserva', 'recibos-reserva', false)
  on conflict (id) do nothing;

drop policy if exists "recibos_reserva_files_select" on storage.objects;
create policy "recibos_reserva_files_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'recibos-reserva' and public.is_active_member());

drop policy if exists "recibos_reserva_files_insert" on storage.objects;
create policy "recibos_reserva_files_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recibos-reserva' and public.is_active_member());

drop policy if exists "recibos_reserva_files_update" on storage.objects;
create policy "recibos_reserva_files_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'recibos-reserva' and public.is_active_member());

drop policy if exists "recibos_reserva_files_delete" on storage.objects;
create policy "recibos_reserva_files_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recibos-reserva' and public.is_active_member());

-- ── Seed de cláusulas + ciudad/registro por defecto (editables en Ajustes) ───
-- Placeholders resueltos al generar: {DOBLE_LETRAS} {DOBLE} {MONTO_LETRAS} {MONTO}
insert into public.configuracion (clave, valor) values
  ('recibo_ciudad_default', 'Mar del Plata'),
  ('recibo_registro', '4171'),
  ('recibo_clausula_locacion',
$CLA$La parte reservante declara conocer y aceptar que la entrega de la presente suma tiene por finalidad reservar el inmueble e inmovilizar temporalmente su ofrecimiento a terceros. Si la parte reservante **desistiere, se arrepintiere o, por una causa imputable a ella, no avanzare con la celebración del contrato**, perderá íntegramente la suma entregada, sin derecho a restitución.

Si, una vez aceptada la reserva, la parte locadora **desistiere injustificadamente** de la operación por una causa exclusivamente imputable a ella, deberá reintegrar a la parte reservante el **doble de la suma recibida**, es decir, **{DOBLE_LETRAS} ({DOBLE})**.

Si la operación no pudiere concretarse por **rechazo de la reserva por parte de la locadora** antes de su aceptación, por imposibilidad jurídica de celebrar la locación o por otra circunstancia no imputable a la parte reservante, la suma entregada será restituida en su totalidad, sin intereses ni indemnización adicional.

La recepción de esta reserva **no implica por sí sola la celebración definitiva del contrato de locación**. La operación quedará perfeccionada con la aceptación de la parte locadora y la suscripción del instrumento correspondiente. Se extiende el presente recibo para constancia y en prueba de conformidad.$CLA$),
  ('recibo_clausula_venta',
$CLA$La parte reservante declara conocer y aceptar que la entrega de la presente suma tiene por finalidad reservar el inmueble e inmovilizar temporalmente su ofrecimiento a terceros. Si la parte reservante **desistiere, se arrepintiere o, por una causa imputable a ella, no avanzare con la celebración de la operación**, perderá íntegramente la suma entregada, sin derecho a restitución.

Si, una vez aceptada la reserva, la parte vendedora **desistiere injustificadamente** de la operación por una causa exclusivamente imputable a ella, deberá reintegrar a la parte reservante el **doble de la suma recibida**, es decir, **{DOBLE_LETRAS} ({DOBLE})**.

Si la operación no pudiere concretarse por **rechazo de la reserva por parte de la vendedora** antes de su aceptación, por imposibilidad jurídica de celebrar la compraventa o por otra circunstancia no imputable a la parte reservante, la suma entregada será restituida en su totalidad, sin intereses ni indemnización adicional.

La recepción de esta reserva **no implica por sí sola la celebración definitiva de la operación de compraventa**. La operación quedará perfeccionada con la aceptación de la parte vendedora y la suscripción del instrumento correspondiente (boleto de compraventa y/o escritura traslativa de dominio). Se extiende el presente recibo para constancia y en prueba de conformidad.$CLA$)
on conflict (clave) do nothing;
