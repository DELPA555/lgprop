-- ════════════════════════════════════════════════════════════════════════
-- 0023 · Módulo Consorcios (Tanda 5) — avisos automáticos
-- Nuevos tipos de notificación para el motor de avisos (enviar-avisos) y la
-- configuración de corte/umbral que usan.
-- ════════════════════════════════════════════════════════════════════════

-- Nuevos valores del enum de notificaciones (no se usan en esta misma migración)
alter type public.tipo_notificacion add value if not exists 'expensas_liquidacion_pendiente';
alter type public.tipo_notificacion add value if not exists 'expensa_impaga';
alter type public.tipo_notificacion add value if not exists 'reclamo_sin_resolver';

-- Configuración (día de corte de liquidación, días para alertar reclamos)
insert into public.configuracion (clave, valor, updated_at) values
  ('consorcios_corte_liquidacion_dia', '10', now()),
  ('consorcios_reclamo_dias_alerta', '15', now())
on conflict (clave) do nothing;
