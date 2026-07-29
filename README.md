# LG Prop — Sistema de administración de alquileres

Aplicación de escritorio para Windows (Electron + React + TypeScript + Vite + Tailwind)
con backend en **Supabase** (Postgres + Auth + Edge Functions). Pensada para uso
multiusuario con base de datos compartida en la nube.

> Estado: **scaffold inicial**. Base de datos, conexión y Dashboard listos.
> Los módulos (Propiedades, Dueños, Inquilinos, Contratos, Índices, Pagos, Equipo)
> se implementan a continuación, uno por uno.

## Stack

- **Electron 33** + **electron-vite** + **electron-builder** (instalador `.exe`)
- **React 18** + **TypeScript** + **Vite** + **Tailwind CSS 3**
- **Supabase**: Postgres, Auth (roles admin/operador), Edge Functions (Deno)
- **Resend** para el envío de emails de avisos

## Estructura

```
lgprop/
├─ electron.vite.config.ts      # Config main / preload / renderer
├─ src/
│  ├─ main/index.ts             # Proceso principal de Electron
│  ├─ preload/index.ts          # Bridge seguro (contextIsolation)
│  └─ renderer/
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx, App.tsx
│        ├─ components/          # UI compartida (layout, PageHeader, ...)
│        ├─ pages/               # Una página por módulo
│        ├─ lib/supabase/        # Cliente Supabase
│        └─ types/               # Tipos de la base (database.ts)
└─ supabase/
   ├─ migrations/0001_init.sql   # Esquema completo + RLS
   ├─ cron.sql                   # Scheduling de las Edge Functions
   └─ functions/
      ├─ actualizar-indices/     # Trae ICL/IPC/UVA/Casa Propia (mensual)
      └─ enviar-avisos/          # Notificaciones + email digest (diario)
```

## Puesta en marcha (desarrollo)

### 1. Requisitos
- Node.js 20+
- Una cuenta de [Supabase](https://supabase.com) (proyecto creado)
- (Opcional) [Supabase CLI](https://supabase.com/docs/guides/cli) para migraciones y functions
- Una API key de [Resend](https://resend.com) para los emails

### 2. Instalar dependencias
```bash
npm install
```

### 3. Configurar variables de entorno
```bash
cp .env.example .env
```
Completá en `.env`:
- `VITE_SUPABASE_URL` — URL del proyecto (Settings → API)
- `VITE_SUPABASE_ANON_KEY` — anon/public key (Settings → API)

Estas dos son públicas por diseño: la seguridad la aplica **RLS** en Postgres.

### 4. Crear el esquema en Supabase
Opción A (SQL Editor): pegá y ejecutá `supabase/migrations/0001_init.sql`.
Opción B (CLI):
```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

### 5. Crear el primer usuario admin (bootstrap)
1. En Supabase → **Authentication** → agregá tu usuario (email + password).
2. En el **SQL Editor** ejecutá (con el UUID del auth user):
   ```sql
   insert into public.usuarios_equipo (auth_user_id, nombre, email, rol)
   values ('<uuid-del-auth-user>', 'Tu Nombre', 'mail@dominio.com', 'admin');
   ```
   Desde la app, ese admin ya puede dar de alta al resto del equipo.

### 6. Correr en desarrollo
```bash
npm run dev
```

### 7. Acceso / login
La app está protegida por login (Supabase Auth). Iniciá sesión con el email y la
contraseña del usuario que registraste en Auth y diste de alta en `usuarios_equipo`
(paso 5). Ese admin puede crear al resto del equipo desde **Equipo → Nuevo usuario**
(lo procesa la Edge Function `crear-usuario`). Sin una fila activa en
`usuarios_equipo`, la sesión queda en pantalla de "cuenta sin acceso" (por RLS).

## Edge Functions

```bash
# Deploy
supabase functions deploy actualizar-indices
supabase functions deploy enviar-avisos
supabase functions deploy crear-usuario   # alta de usuarios del equipo (solo admin)

# Secrets (no van en el .exe)
supabase secrets set RESEND_API_KEY=re_xxx \
  EMAIL_FROM="LG Prop <avisos@tudominio.com>" \
  AVISOS_EMAIL_TO="equipo@tudominio.com"
# SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya están disponibles en el entorno.
```

Programar la ejecución automática: ejecutá `supabase/cron.sql` (usa `pg_cron` + `pg_net`).

> **Índices:** `actualizar-indices` usa la API de Series de Tiempo de
> `datos.gob.ar` (republica BCRA e INDEC). Antes de producción, **verificá los IDs
> de serie** en `supabase/functions/actualizar-indices/index.ts` contra el catálogo:
> https://apis.datos.gob.ar/series/api/search/?q=ICL

## Generar el instalador `.exe`

```bash
npm run build:win
```
El instalador NSIS queda en `dist-installer/LG-Prop-Setup-<version>.exe`.
Este comando compila **sin publicar** (build local para probar).

## Actualización automática (auto-update)

La app usa **electron-updater** contra los **GitHub Releases** de
`https://github.com/DELPA555/lgprop`. Al abrir la app instalada, chequea si hay una
versión más nueva publicada, la **descarga en segundo plano** y muestra un aviso:
- *"Actualización disponible — se está descargando…"* (mientras baja).
- *"Actualización lista — reiniciá para aplicarla"* con botón **Reiniciar ahora**.

> El auto-update sólo funciona en la app **instalada** (no en `npm run dev`) y a partir
> de la **primera versión que ya incluye el updater** (v0.3.0). Las apps instaladas con
> v0.2.0 o anterior no se actualizan solas: hay que instalar la v0.3.0 una vez a mano.

### Requisito por única vez: token de GitHub

electron-builder necesita un **Personal Access Token (PAT)** con permiso para subir
Releases. Dos opciones:

- **Fine-grained token** (recomendado): en GitHub → *Settings → Developer settings →
  Fine-grained tokens → Generate new token*. Repository access: **Only select
  repositories → DELPA555/lgprop**. Permisos: **Contents → Read and write**
  (y *Metadata → Read-only*, que se agrega solo).
- **Classic token**: mismo lugar → *Tokens (classic)*, con el scope **`repo`** completo.

**Dónde ponerlo (NUNCA en el repo):** como variable de entorno `GH_TOKEN` en tu
terminal, sólo al momento de publicar. En PowerShell (Windows):

```powershell
$env:GH_TOKEN = "ghp_tu_token_aca"
```

(Esa variable dura sólo esa sesión de terminal. Si abrís otra, la volvés a setear.)

### Publicar una versión nueva

1. Subí la versión en `package.json` siguiendo **versionado semántico**
   (`0.3.0` → `0.3.1` para un fix, `0.4.0` para features, etc.).
2. Con el token seteado, corré:
   ```powershell
   npm run publish:win
   ```
   Esto compila y **sube automáticamente** el instalador + los archivos de update
   (`latest.yml`, `.blockmap`) como un **Release** en GitHub con ese tag de versión.
3. Listo: las apps ya instaladas lo detectan en el próximo arranque (o dentro de las
   6 hs si quedan abiertas).

### Verificar que el auto-update funciona

1. Instalá una versión (ej. v0.3.0) con el `.exe` publicado y abrí la app.
2. Subí la versión (ej. a v0.3.1), cambiá algo visible, y corré `npm run publish:win`.
3. Volvé a abrir la app v0.3.0 ya instalada: en unos segundos aparece el aviso de
   *"Actualización disponible"* y después *"Actualización lista"*. Reiniciá y quedás en
   v0.3.1 (se ve en la versión que muestra la app).

> Si no aparece: revisá que el Release en GitHub tenga el archivo **`latest.yml`**
> adjunto (lo sube `publish:win`; un Release hecho a mano no lo tiene) y que la versión
> publicada sea **mayor** que la instalada.

## Comisión y Liquidación a dueños

Migración: `supabase/migrations/0005_comision_liquidacion.sql`.

- **Porcentaje de comisión (modelo híbrido):**
  - `duenos.porcentaje_comision` — valor por defecto del dueño.
  - `propiedades.porcentaje_comision` — override por propiedad; **NULL = hereda del dueño**.
- **Cálculo automático por pago:** un trigger (`trg_calc_comision_pago`) completa en cada
  `pago` el `porcentaje_comision_aplicado`, el `monto_comision` (= monto × %) y el
  `monto_neto` (= monto − comisión). Se recalcula al crear o editar el monto del pago.
- **Módulo Liquidaciones** (`/liquidaciones`): por mes y por dueño muestra propiedades
  administradas, bruto cobrado, comisión retenida y neto a transferir (sobre los pagos en
  estado *cobrado*). Botón **Generar liquidación** → registra la liquidación y descarga un
  **PDF** (dirección, período, bruto, comisión, neto, datos de transferencia, fecha). Cada
  liquidación se marca **pendiente / enviada** (tabla `liquidaciones`, única por dueño+período).
- **Dashboard:** KPIs de *Comisiones cobradas* del mes y del año en curso.

## Mantenimiento / Reclamos

Migración: `supabase/migrations/0006_mantenimiento.sql` (tabla `mantenimiento`:
`propiedad_id`, `fecha_reporte`, `descripcion`, `estado` pendiente/en_proceso/resuelto,
`fecha_resolucion`, `costo` opcional).

- **Detalle de propiedad** (`/propiedades/:id`, se abre con el nombre o el ícono 👁 en la
  lista): muestra los datos de la propiedad y su historial de reclamos, con carga/edición
  y cambio de estado inline.
- **Módulo Mantenimiento** (`/mantenimiento`): todos los reclamos de todas las propiedades,
  con filtro por estado (arranca en *pendientes*) y búsqueda; enlace a la propiedad.

## Garantías y depósitos

Migración: `supabase/migrations/0007_deposito.sql` (agrega a `contratos`:
`monto_deposito`, `estado_deposito` retenido/devuelto, `fecha_devolucion_deposito`; y el
tipo de notificación `deposito_pendiente`).

- En el **modal de contrato** hay una sección *Garantía / Depósito* (monto, estado, fecha de
  devolución). Si el contrato está *vencido/rescindido* con el depósito aún *retenido*,
  muestra una advertencia. En la lista, esos contratos llevan una marca “depósito a devolver”.
- El motor **`enviar-avisos`** genera un recordatorio (`deposito_pendiente`) por cada contrato
  finalizado con depósito retenido. **Redeployar** la función tras esta migración:
  `supabase functions deploy enviar-avisos`.

## Seguros / ART

Migración: `supabase/migrations/0008_seguros.sql` (tabla `seguros_propiedad`:
`propiedad_id`, `tipo` seguro/art/otro, `aseguradora`, `numero_poliza`,
`fecha_vencimiento`; + tipo de notificación `seguro_por_vencer`).

- En el **detalle de propiedad** (`/propiedades/:id`) hay una sección *Seguros / ART* para
  cargar/editar seguros, con resaltado del vencimiento (amarillo si vence dentro de 60 días,
  rojo si ya venció).
- El motor **`enviar-avisos`** alerta por cada seguro que vence dentro de los próximos 60
  días (mismo criterio que los contratos). Dedup por seguro vía `metadata.seguro_id`.
  **Redeployar** tras la migración: `supabase functions deploy enviar-avisos`.

## Exportación contable

Botón **Exportar** en **Pagos** y en **Liquidaciones** (`lib/exportContable.ts`): genera un
**CSV** (separador `;` + BOM UTF-8, abre directo en Excel en español) con columnas *período,
fecha de pago, propiedad, dueño, inquilino, bruto, comisión, neto y estado de pago*.
Filtrable por rango: **mes / trimestre / año actual** o **personalizado** (desde–hasta por mes).
No requiere migración.

## Roles

- **admin**: acceso total, incluida la gestión del equipo (`usuarios_equipo`).
- **operador**: acceso a los datos operativos (propiedades, contratos, pagos, etc.).

La política fina operador/admin se puede endurecer en las policies de RLS
(`0001_init.sql`) a medida que definamos permisos por módulo.

## Notas de diseño

- Las **actualizaciones de monto nunca se auto-aplican**: el motor calcula y avisa,
  pero el aumento se aplica solo cuando un usuario lo confirma.
- Los emails usan lenguaje claro y profesional, sin tono acusatorio.
