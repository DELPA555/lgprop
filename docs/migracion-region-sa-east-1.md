# Migración de región — us-east-2 (Ohio) → sa-east-1 (São Paulo)

**Estado: PLAN. NO ejecutar todavía.** Primero se prueba y publica la versión de
rendimiento (v0.21.0). Esta migración se ejecuta recién cuando Iván dé el OK.

## 1. Por qué

El proyecto Supabase de producción (`tvvmsuminnurcqtjvepm`) está en **us-east-2
(Ohio)**. Medido desde Argentina, cada consulta paga **~190–250 ms** de ida y
vuelta, sin importar cuántos datos trae (las tablas tienen 0–40 filas; el tiempo
es 100% latencia de red). Mover el proyecto a **sa-east-1 (São Paulo)** baja ese
piso a **~40–70 ms**: **3–4× más rápido en cada consulta**, para siempre.

Supabase **no** permite cambiar la región de un proyecto existente. Hay que
**crear un proyecto nuevo** en sa-east-1 y migrar todo: esquema, datos, Storage,
usuarios de Auth, Edge Functions, secrets y cron.

## 2. Principio rector (lo más importante)

> **El proyecto de Ohio sigue vivo y funcionando durante toda la transición.**

Las apps ya instaladas (la de Iván y la de Gero) apuntan a Ohio por la URL
embebida en su `.exe`. No se rompen hasta que **se actualicen** al nuevo `.exe`
que apunta a São Paulo. Por eso Ohio **no se toca ni se borra** hasta confirmar
que todas las instalaciones migraron. El corte real es sólo una **ventana corta
de congelamiento de escrituras** (minutos), coordinada entre los 2 usuarios.

## 3. Prerequisitos

- Cuenta Supabase (la misma, `delpa555@gmail.com`) — el proyecto nuevo se crea
  en la misma organización.
- **Supabase CLI** ya instalada y logueada (`supabase login`).
- **PostgreSQL client tools** (`pg_dump`, `pg_restore`, `psql`) — vienen con
  PostgreSQL 15+. Verificar: `pg_dump --version`.
- Node 18+ (para el script de copia de Storage).
- Las **connection strings** (Postgres directo) de ambos proyectos, que se sacan
  del Dashboard → Project Settings → Database → **Connection string → URI**
  (usar el modo **Session**, puerto 5432, no el pooler 6543, para `pg_dump`).
- Los valores actuales de todos los **secrets** de las Edge Functions (ver §8).
  Los que no se recuerden se regeneran (API keys nuevas).

> Nomenclatura en este doc: `OHIO` = proyecto viejo (`tvvmsuminnurcqtjvepm`),
> `SP` = proyecto nuevo en São Paulo (ref a definir, p. ej. `xxxxxxxx`).

---

## FASE 0 — Ensayo en un proyecto de staging (sin tocar producción)

Objetivo: probar todo el procedimiento end-to-end contra un proyecto descartable
antes de hacerlo con los datos reales.

1. **Crear proyecto de staging** en sa-east-1 (Dashboard → New project → Region
   **South America (São Paulo)**). Nombre p. ej. `lgprop-staging-sp`. Guardar la
   DB password que se genera.
2. **Linkear la CLI** a staging desde la carpeta del repo:
   ```bash
   cd /c/Users/Ivan/OneDrive/Escritorio/lgprop
   supabase link --project-ref <STAGING_REF>
   ```
3. **Aplicar el esquema** (las 36 migraciones + cron) con push:
   ```bash
   supabase db push --linked
   supabase db push --linked --include-all   # si hace falta forzar
   ```
   Si el cron (`supabase/cron.sql`) no está como migración numerada, aplicarlo
   después a mano en el SQL Editor con el anon key del proyecto staging.
4. **Probar un volcado + restore de datos** desde OHIO a staging (ver Fase 2) con
   los datos reales de prueba — así se valida que `pg_dump/pg_restore` corren sin
   errores de FK, enums, triggers, etc.
5. **Probar la copia de Storage** (Fase 3) y la **migración de Auth** (Fase 4).
6. **Deployar las Edge Functions** a staging y smoke-testearlas (Fase 5).
7. **Compilar un `.exe` de prueba** apuntando a staging (Fase 6) y verificar que
   la app abre, loguea y lee/escribe bien.

Cuando la Fase 0 sale limpia de punta a punta, recién ahí se agenda la migración
real. **Borrar el proyecto de staging** al terminar (para no pagar de más).

---

## FASE 1 — Crear el proyecto de producción en São Paulo

1. Dashboard → **New project** → Region **South America (São Paulo)** →
   nombre p. ej. `lgprop` (o `lgprop-sp`). Plan igual al de Ohio.
2. Guardar: **project ref** (`SP`), **DB password**, **anon key**,
   **service_role key** (Project Settings → API).
3. Linkear la CLI a SP (igual que en Fase 0 paso 2).

---

## FASE 2 — Migrar esquema + datos

### 2a. Esquema

```bash
supabase db push --linked        # corre las 36 migraciones en SP
```

Verificar en el SQL Editor de SP que estén las tablas, enums, funciones,
triggers y políticas RLS. Aplicar `supabase/cron.sql` si no entró por migración
(con el anon key de SP inline).

### 2b. Datos (sólo filas, el esquema ya está)

Volcar **sólo los datos** del schema `public` desde OHIO y restaurarlos en SP.
Usar la connection string **Session** (puerto 5432) de cada proyecto:

```bash
# Dump de datos de OHIO (sin esquema; el esquema ya lo creó db push)
pg_dump "postgresql://postgres:<PASS_OHIO>@db.tvvmsuminnurcqtjvepm.supabase.co:5432/postgres" \
  --data-only --schema=public \
  --disable-triggers \
  --no-owner --no-privileges \
  -f ohio_public_data.sql

# Restore en SP
psql "postgresql://postgres:<PASS_SP>@db.<SP>.supabase.co:5432/postgres" \
  -f ohio_public_data.sql
```

Notas:
- `--disable-triggers` evita que los triggers de la app (comisión, honorarios,
  logs) se vuelvan a disparar durante la carga y re-calculen o dupliquen. Los
  valores viajan **tal cual estaban en Ohio** (crítico para no alterar comisión/
  liquidación/honorario/sociedad). Requiere correr el restore como superusuario;
  en Supabase el rol `postgres` lo permite vía la connection string directa.
- Si aparecen errores de orden por FKs, alternativamente usar
  `pg_dump ... --data-only` **sin** `--disable-triggers` pero con la base vacía y
  dejando que el orden topológico de `pg_dump` resuelva, o migrar tabla por tabla
  respetando dependencias (duenos → propiedades → inquilinos → contratos → pagos …).
- **Verificación obligatoria** tras el restore: comparar `count(*)` de cada tabla
  y, sobre todo, chequear que `pagos.monto_comision`, `honorarios_operacion` y los
  snapshots de `liquidaciones_socios` sean **idénticos** a Ohio (ver §9).

---

## FASE 3 — Copiar Storage (4 buckets privados)

Buckets a migrar: **`fotos-propiedades`**, **`recibos-reserva`**,
**`contratos-archivos`**, **`backups`**.

Los buckets y sus policies ya los crean las migraciones (Fase 2a). Falta copiar
los **archivos** (las filas de `storage.objects` no mueven los binarios). Script
Node que baja de OHIO y sube a SP con los service_role de cada uno:

```js
// copiar-storage.mjs — correr con: node copiar-storage.mjs
import { createClient } from '@supabase/supabase-js'
const OLD = createClient('https://tvvmsuminnurcqtjvepm.supabase.co', process.env.OLD_SERVICE_ROLE)
const NEW = createClient('https://<SP>.supabase.co', process.env.NEW_SERVICE_ROLE)
const BUCKETS = ['fotos-propiedades', 'recibos-reserva', 'contratos-archivos', 'backups']

async function walk(client, bucket, prefix = '') {
  const out = []
  const { data } = await client.storage.from(bucket).list(prefix, { limit: 1000 })
  for (const item of data ?? []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name
    if (item.id === null) out.push(...(await walk(client, bucket, path))) // carpeta
    else out.push(path)
  }
  return out
}

for (const bucket of BUCKETS) {
  const paths = await walk(OLD, bucket)
  console.log(`${bucket}: ${paths.length} archivos`)
  for (const p of paths) {
    const { data: blob } = await OLD.storage.from(bucket).download(p)
    if (!blob) { console.error('  ⚠️ no bajó', p); continue }
    const buf = Buffer.from(await blob.arrayBuffer())
    const { error } = await NEW.storage.from(bucket).upload(p, buf, { upsert: true })
    if (error) console.error('  ⚠️ no subió', p, error.message)
  }
}
console.log('listo')
```

```bash
OLD_SERVICE_ROLE="<service_role OHIO>" NEW_SERVICE_ROLE="<service_role SP>" node copiar-storage.mjs
```

Verificar en el Dashboard de SP → Storage que cada bucket tenga la misma cantidad
de archivos. `backups` puede saltearse si no interesa el histórico.

---

## FASE 4 — Migrar usuarios de Auth

Son **2 usuarios** (Iván admin + Gero). Lo clave: conservar los **mismos UUIDs**,
porque `usuarios_equipo.auth_user_id` y `socios.usuario_equipo_id` apuntan a
ellos, y los datos de Fase 2 ya traen esos UUIDs.

**Opción A — recrearlos (recomendada por ser sólo 2):**
Con el service_role de SP, crear cada usuario con su **UUID original** y una
contraseña nueva (se las pasás a cada uno):

```js
// Admin API de SP
await NEW.auth.admin.createUser({
  id: '<MISMO_UUID_DE_OHIO>',           // p. ej. el de Iván: edeb852e-...
  email: 'delpa555@gmail.com',
  password: '<nueva>',
  email_confirm: true
})
```
`createUser` acepta `id` explícito, así que el UUID se preserva y las FKs de
`usuarios_equipo`/`socios` siguen válidas. Repetir para Gero. Verificar que
`usuarios_equipo` (ya migrada en Fase 2) matchee por `auth_user_id`.

**Opción B — copiar `auth.users`/`auth.identities` por SQL** (preserva los hashes
de contraseña, los usuarios no tienen que cambiarla). Más delicado; sólo si se
quiere evitar resetear passwords. Dumpear esas dos tablas desde OHIO con `pg_dump
--schema=auth --table=auth.users --table=auth.identities --data-only` y
restaurarlas en SP. Probar **sí o sí** en Fase 0 antes.

Para 2 usuarios, **Opción A** es la más simple y segura.

---

## FASE 5 — Edge Functions + secrets + cron

### 5a. Deployar las 11 funciones a SP

```bash
supabase functions deploy actualizar-cotizaciones --project-ref <SP>
supabase functions deploy actualizar-indices --project-ref <SP>
supabase functions deploy aprobar-aumento --project-ref <SP>
supabase functions deploy backup-db --project-ref <SP>
supabase functions deploy crear-usuario --project-ref <SP>
supabase functions deploy enviar-avisos --project-ref <SP>
supabase functions deploy enviar-ficha --project-ref <SP>
supabase functions deploy enviar-recibo --project-ref <SP>
supabase functions deploy extraer-datos-contrato --project-ref <SP>
supabase functions deploy generar-contrato --project-ref <SP>
supabase functions deploy solicitar-aprobacion-aumento --project-ref <SP>
```

### 5b. Regenerar / setear secrets en SP

El `SUPABASE_SERVICE_ROLE_KEY` y la URL ya los inyecta Supabase solo. Hay que
setear los **de la app**:

```bash
supabase secrets set --project-ref <SP> \
  ANTHROPIC_API_KEY="<key>" \
  RESEND_API_KEY="<key>" \
  EMAIL_FROM="LG Prop <onboarding@resend.dev>" \
  AVISOS_EMAIL_TO="delpa555@gmail.com"
```
Regenerar las API keys (Anthropic, Resend) si no se tienen a mano; es buena
oportunidad para rotarlas. **No** reutilizar el service_role de Ohio en SP.

### 5c. Cron

Re-aplicar `supabase/cron.sql` en SP con el **anon key de SP** inline (los jobs
`lgprop-actualizar-indices`, `lgprop-enviar-avisos`, el de cotizaciones y el de
backup semanal). Verificar en Dashboard de SP → Integrations → Cron.

### 5d. Smoke test

Invocar cada función (sin JWT debe dar 401 "No autenticado" = viva; con JWT de
prueba, que corra). Especial atención a `actualizar-cotizaciones` (fuente
`dolarapi.com` pelado) y `enviar-avisos`.

---

## FASE 6 — Publicar el `.exe` nuevo (apunta a São Paulo)

1. En la carpeta del repo, editar `.env` con los valores de **SP**:
   ```
   VITE_SUPABASE_URL=https://<SP>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon de SP>
   SUPABASE_SERVICE_ROLE_KEY=<service_role de SP>   # sólo local, no entra al .exe
   ```
2. Bump de versión (p. ej. **v0.22.0**) en `package.json`.
3. `npm run publish:win` con `$env:GH_TOKEN` seteado → crea el Release en GitHub
   con `latest.yml` (auto-update). Recordar el gotcha: sin `GH_TOKEN` en la
   terminal, electron-builder compila el `.exe` pero **no** publica.
4. La app embebe la URL de SP en el bundle (las `VITE_*` se inyectan al compilar),
   así que el `.exe` v0.22.0 abre **conectado a São Paulo**.

---

## FASE 7 — Corte / transición

Con sólo 2 usuarios, el corte limpio es trivial de coordinar:

1. **Avisar a Gero** una ventana corta (p. ej. 15–30 min) en la que **nadie
   escribe** en la app.
2. Durante esa ventana (con Ohio ya congelado de escrituras de hecho):
   - **Re-sincronizar los datos** que hayan cambiado desde el dump inicial
     (re-correr Fase 2b sobre las tablas con movimiento, o rehacer el dump
     completo si el volumen lo permite — son pocos datos, un dump full tarda
     segundos). Lo más seguro con esta escala: hacer el **dump/restore final
     dentro de la ventana** y no antes, así no hay delta que reconciliar.
   - Re-correr la copia de Storage (Fase 3) por si se subieron fotos/recibos
     nuevos.
3. **Publicar v0.22.0** (Fase 6) si no se publicó antes, o avisar que ya está.
4. **Ambos actualizan la app** al nuevo `.exe` (auto-update, o instalación
   manual). A partir de acá, los dos trabajan contra São Paulo.
5. **Ohio queda de respaldo, de sólo lectura de hecho** (nadie lo usa porque
   ambas apps ya migraron), por unos días, hasta confirmar que todo anda en SP.

> Riesgo residual: si alguien **sigue usando la app vieja** (apuntando a Ohio)
> después del corte, esas escrituras **no** llegan a São Paulo y se pierden al
> apagar Ohio. Por eso el paso 4 (que ambos actualicen) no es opcional. Con 2
> usuarios se controla con un mensaje.

---

## FASE 8 — Verificación y rollback

**Checklist de verificación en SP (post-corte):**
- [ ] Login de Iván y de Gero OK.
- [ ] `count(*)` de cada tabla = Ohio.
- [ ] Comisiones/honorarios/liquidaciones: spot-check de 3–5 registros reales con
      valores **idénticos** a Ohio (§9).
- [ ] Fotos de Cartera se ven (Storage + URLs firmadas OK).
- [ ] Un recibo/ficha se genera y se envía por email (Edge Functions + Resend).
- [ ] Cron jobs activos en el Dashboard de SP.
- [ ] Latencia medida desde Argentina **< 80 ms** (correr el script de medición
      apuntando a SP; debería caer de ~190 ms a ~50 ms).

**Rollback:** como Ohio sigue intacto, si algo sale mal **antes** de que la gente
empiece a cargar datos nuevos en SP, se vuelve a publicar un `.exe` apuntando a
Ohio (revertir `.env` + bump + publish) y listo. Una vez que hay datos nuevos en
SP, el rollback implica migrar esos deltas de vuelta — por eso conviene verificar
rápido y no demorar la confirmación.

**Apagar Ohio:** recién cuando pasen varios días sin incidencias y se confirme que
nadie usa la app vieja, se puede pausar/borrar el proyecto de Ohio.

---

## 9. Verificación de que no cambió ningún cálculo sensible

Antes y después, correr esta consulta (SQL Editor) en **ambos** proyectos y
comparar fila por fila — tienen que dar **exactamente lo mismo**:

```sql
-- Comisiones efectivas por pago
select id, contrato_id, monto, monto_comision, monto_neto, cotizacion_usada
from pagos order by id;

-- Honorarios por operación
select id, contrato_id, monto, monto_real, moneda, estado
from honorarios_operacion order by id;

-- Snapshots de liquidaciones de socios
select periodo, deudor_socio_id, acreedor_socio_id, monto_deuda, estado_pago
from liquidaciones_socios order by periodo;
```

Si algún valor difiere, **frenar** y revisar el restore (típicamente los triggers
se dispararon por no usar `--disable-triggers`, o hubo un re-cálculo).

---

## 10. Resumen de artefactos a tener a mano

| Item | De dónde sale |
|---|---|
| Connection string OHIO (puerto 5432) | Dashboard OHIO → Database → Connection string |
| Connection string SP | Dashboard SP → Database → Connection string |
| service_role OHIO / SP | Project Settings → API |
| anon key SP | Project Settings → API (va al `.env` del `.exe`) |
| Secrets de funciones | §5b (ANTHROPIC, RESEND, EMAIL_FROM, AVISOS_EMAIL_TO) |
| Script `copiar-storage.mjs` | §3 |
| Script de medición de latencia | el usado en el diagnóstico de rendimiento |

**Orden de ejecución el día D:** Fase 1 → 2a → (ventana) → 2b final → 3 final →
4 → 5 → 6 → 7 → 8. Fase 0 (ensayo) se hace días antes.
