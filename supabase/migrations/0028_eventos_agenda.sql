-- ════════════════════════════════════════════════════════════════════════
-- 0028 · Agenda general del negocio (eventos_agenda)
-- Agenda NO limitada a propiedades ya cargadas: tasaciones, posibles ingresos,
-- reuniones, visitas, etc. Puede ligarse opcionalmente a una propiedad existente
-- (propiedad_id) o llevar un contacto libre (nombre/teléfono) cuando la persona
-- todavía no es un inquilino/dueño cargado (ej. un posible cliente de tasación).
-- El tipo se guarda como TEXTO (no enum) para que sea extensible sin migración.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.eventos_agenda (
  id                   uuid primary key default gen_random_uuid(),
  titulo               text not null,
  descripcion          text,
  fecha_hora           timestamptz not null,
  -- tipo extensible (la UI sugiere: tasacion / posible_ingreso / reunion / visita / otro)
  tipo                 text not null default 'otro',
  propiedad_id         uuid references public.propiedades(id) on delete set null,
  contacto_nombre      text,
  contacto_telefono    text,
  creado_por           uuid references public.usuarios_equipo(id) on delete set null,
  estado               text not null default 'pendiente'
                         check (estado in ('pendiente', 'realizado', 'cancelado')),
  recordatorio_enviado boolean not null default false,
  created_at           timestamptz not null default now()
);
create index if not exists eventos_agenda_fecha_idx on public.eventos_agenda (fecha_hora);
create index if not exists eventos_agenda_propiedad_idx on public.eventos_agenda (propiedad_id);

-- Nuevo tipo de notificación para el recordatorio de evento de agenda
alter type public.tipo_notificacion add value if not exists 'evento_proximo';

alter table public.eventos_agenda enable row level security;

drop policy if exists eventos_agenda_member_all on public.eventos_agenda;
create policy eventos_agenda_member_all on public.eventos_agenda
  for all to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
