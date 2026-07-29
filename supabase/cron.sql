-- ════════════════════════════════════════════════════════════════════════════
-- Scheduling de Edge Functions con pg_cron + pg_net (Supabase)
-- Ejecutar UNA vez en el SQL Editor del proyecto (rol de servicio).
--
-- Reemplazá tvvmsuminnurcqtjvepm por el ref de tu proyecto y <ANON_OR_SERVICE_KEY>
-- por una key válida (se recomienda el service_role guardado como secreto).
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Guardá la key en Vault o como setting; acá va inline por simplicidad del ejemplo.
-- 1) Actualizar índices: el día 2 de cada mes a las 12:00 UTC (09:00 ARG aprox).
select cron.schedule(
  'lgprop-actualizar-indices',
  '0 12 2 * *',
  $$
  select net.http_post(
    url     := 'https://tvvmsuminnurcqtjvepm.functions.supabase.co/actualizar-indices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_OR_SERVICE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 2) Enviar avisos: todos los días a las 11:00 UTC (08:00 ARG aprox).
select cron.schedule(
  'lgprop-enviar-avisos',
  '0 11 * * *',
  $$
  select net.http_post(
    url     := 'https://tvvmsuminnurcqtjvepm.functions.supabase.co/enviar-avisos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_OR_SERVICE_KEY>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para ver/borrar jobs:
--   select * from cron.job;
--   select cron.unschedule('lgprop-enviar-avisos');
