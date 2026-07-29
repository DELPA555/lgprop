-- ════════════════════════════════════════════════════════════════════════════
-- LG Prop — 0004: scheduling de cron (pg_cron + pg_net)
-- ⚠️ ESPECÍFICA DEL PROYECTO tvvmsuminnurcqtjvepm: las URLs y la anon key (pública)
--    están hardcodeadas. Para otro entorno, ajustar antes de aplicar.
--    cron.schedule es idempotente por nombre de job (re-aplicar actualiza).
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- Scheduling de Edge Functions con pg_cron + pg_net (Supabase)
-- Ejecutar UNA vez en el SQL Editor del proyecto (rol de servicio).
--
-- Reemplazá tvvmsuminnurcqtjvepm por el ref de tu proyecto y eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2dm1zdW1pbm51cmNxdGp2ZXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDU2MzYsImV4cCI6MjEwMDkyMTYzNn0.NyVupkFs4Y7UHWxy8wrUs98WsZx3gXUDcIiAF6Bs6PI
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2dm1zdW1pbm51cmNxdGp2ZXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDU2MzYsImV4cCI6MjEwMDkyMTYzNn0.NyVupkFs4Y7UHWxy8wrUs98WsZx3gXUDcIiAF6Bs6PI'
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2dm1zdW1pbm51cmNxdGp2ZXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNDU2MzYsImV4cCI6MjEwMDkyMTYzNn0.NyVupkFs4Y7UHWxy8wrUs98WsZx3gXUDcIiAF6Bs6PI'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para ver/borrar jobs:
--   select * from cron.job;
--   select cron.unschedule('lgprop-enviar-avisos');
