// Tipos de la base de datos LG Prop (alineados con supabase/migrations/0001_init.sql).
// IMPORTANTE: las entidades se declaran como `type` (no `interface`) para que
// `Partial<T>` sea asignable a `Record<string, unknown>` y así cumplan el
// GenericSchema de @supabase/supabase-js. Con `interface` el esquema colapsa a `never`.
//
// Cuando el esquema esté estable, se puede regenerar con:
//   supabase gen types typescript --project-id <id> > src/renderer/src/types/database.ts

export type EstadoPropiedad = 'alquilada' | 'vacia'
export type PagaExpensas = 'inquilino' | 'dueno'
export type TipoIndice =
  | 'ICL'
  | 'IPC'
  | 'Casa Propia'
  | 'UVA'
  | 'Combinado'
  | 'Porcentaje fijo'
  | 'Manual'
export type EstadoContrato = 'activo' | 'vencido' | 'rescindido'
export type EstadoDeposito = 'retenido' | 'devuelto'
export type Moneda = 'ARS' | 'USD'
export type EstadoPago = 'pagado' | 'pendiente' | 'atrasado'
export type EstadoLiquidacion = 'pendiente' | 'enviada'
export type EstadoMantenimiento = 'pendiente' | 'en_proceso' | 'resuelto'
export type TipoSeguro = 'seguro' | 'art' | 'otro'
export type RolUsuario = 'admin' | 'operador'
export type TipoNotificacion =
  | 'vencimiento_contrato'
  | 'actualizacion_monto'
  | 'pago_atrasado'
  | 'expensas_pendientes'
  | 'deposito_pendiente'
  | 'seguro_por_vencer'
  | 'expensas_liquidacion_pendiente'
  | 'expensa_impaga'
  | 'reclamo_sin_resolver'

export type Dueno = {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  cbu: string | null
  alias_cbu: string | null
  porcentaje_comision: number
  notas: string | null
  created_at: string
}

export type Inquilino = {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  dni: string | null
  garante_nombre: string | null
  garante_telefono: string | null
  garante_dni: string | null
  notas: string | null
  created_at: string
}

export type Propiedad = {
  id: string
  direccion: string
  tipo: string | null
  dueno_id: string | null
  estado: EstadoPropiedad
  monto_expensas: number
  paga_expensas: PagaExpensas
  porcentaje_comision: number | null // NULL = hereda del dueño
  administrada: boolean // true = LG Prop la administra (comisión + liquidaciones + avisos)
  notas: string | null
  created_at: string
}

export type Contrato = {
  id: string
  propiedad_id: string
  inquilino_id: string
  dueno_id: string | null
  fecha_inicio: string
  fecha_fin: string
  monto_inicial: number
  monto_actual: number
  indice_actualizacion: TipoIndice
  indice_primario: TipoIndice | null
  indice_secundario: TipoIndice | null
  moneda: Moneda
  indice_sobre: Moneda | null
  frecuencia_actualizacion_meses: number
  duracion_meses: number
  porcentaje_fijo: number | null
  proxima_actualizacion: string | null
  estado: EstadoContrato
  monto_deposito: number
  estado_deposito: EstadoDeposito
  fecha_devolucion_deposito: string | null
  motivo_finalizacion: string | null
  confeccionado_por: string | null // usuarios_equipo.id
  notas: string | null
  created_at: string
}

export type IndiceValor = {
  id: string
  tipo_indice: TipoIndice
  fecha: string
  valor: number
  fuente: string | null
  created_at: string
}

export type ActualizacionContrato = {
  id: string
  contrato_id: string
  fecha_calculo: string
  monto_anterior: number
  monto_nuevo: number
  indice_usado: TipoIndice
  coeficiente: number | null
  confirmado_por_usuario: boolean
  confirmado_at: string | null
  confirmado_por: string | null
  created_at: string
}

export type Pago = {
  id: string
  contrato_id: string
  mes_correspondiente: string
  monto: number
  fecha_pago: string | null
  estado: EstadoPago
  expensas_pagadas: boolean
  porcentaje_comision_aplicado: number
  monto_comision: number
  monto_neto: number
  cotizacion_usada: number | null
  monto_ars: number | null
  notas: string | null
  created_at: string
}

export type CotizacionDolar = {
  id: string
  fecha: string
  tipo: string
  compra: number | null
  venta: number | null
  fuente: string | null
  created_at: string
}

export type Liquidacion = {
  id: string
  dueno_id: string
  periodo: string // YYYY-MM-01
  monto_bruto: number
  monto_comision: number
  monto_neto: number
  cant_propiedades: number
  estado: EstadoLiquidacion
  enviada_at: string | null
  generada_por: string | null
  created_at: string
}

export type ContratoGenerado = {
  id: string
  contrato_id: string | null
  origen: string
  generado_por: string | null
  generado_por_nombre: string | null
  datos: Record<string, unknown> | null
  texto: string | null
  created_at: string
}

export type Mantenimiento = {
  id: string
  propiedad_id: string
  fecha_reporte: string
  descripcion: string
  estado: EstadoMantenimiento
  fecha_resolucion: string | null
  costo: number | null
  notas: string | null
  created_at: string
}

export type SeguroPropiedad = {
  id: string
  propiedad_id: string
  tipo: TipoSeguro
  aseguradora: string | null
  numero_poliza: string | null
  fecha_vencimiento: string
  notas: string | null
  created_at: string
}

export type Configuracion = {
  clave: string
  valor: string
  updated_at: string
}

export type LogActividad = {
  id: string
  usuario_id: string | null
  usuario_nombre: string | null
  accion: string
  tabla_afectada: string
  registro_id: string | null
  detalle: Record<string, unknown> | null
  fecha_hora: string
}

export type ContratoArchivo = {
  id: string
  contrato_id: string
  nombre: string
  path: string
  tipo: string | null
  tamano: number | null
  subido_por: string | null
  created_at: string
}

export type UsuarioEquipo = {
  id: string
  auth_user_id: string
  nombre: string
  email: string
  rol: RolUsuario
  activo: boolean
  created_at: string
}

// ── Módulo Consorcios ────────────────────────────────────────────────────
export type Consorcio = {
  id: string
  nombre: string
  direccion: string | null
  cuit: string | null
  cantidad_unidades: number
  administrador_usuario_id: string | null
  administrador_nombre: string | null
  fecha_inicio_administracion: string
  notas: string | null
  created_at: string
}

export type PropietarioConsorcio = {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  cbu: string | null
  alias_cbu: string | null
  notas: string | null
  created_at: string
}

export type UnidadFuncional = {
  id: string
  consorcio_id: string
  identificador: string
  propietario_id: string | null
  porcentaje_fiscal: number
  notas: string | null
  created_at: string
}

export type ProveedorEdificio = {
  id: string
  consorcio_id: string
  nombre: string
  servicio: string | null
  telefono: string | null
  email: string | null
  frecuencia_pago: string | null
  condiciones: string | null
  notas: string | null
  created_at: string
}

export type GastoEdificio = {
  id: string
  consorcio_id: string
  proveedor_id: string | null
  concepto: string
  categoria: string | null
  monto: number
  fecha: string
  mes_correspondiente: string
  notas: string | null
  created_at: string
}

export type LiquidacionExpensas = {
  id: string
  consorcio_id: string
  mes: string
  total_gastos: number
  monto_fondo_reserva_del_mes: number
  base_a_repartir: number
  fecha_generacion: string
  generada_por: string | null
  notas: string | null
  created_at: string
}

export type ExpensaPorUnidad = {
  id: string
  liquidacion_id: string
  unidad_id: string | null
  identificador: string | null
  porcentaje_aplicado: number
  monto_a_pagar: number
  estado: EstadoPago
  fecha_pago: string | null
  created_at: string
}

export type MovimientoFondoReserva = {
  id: string
  consorcio_id: string
  fecha: string
  mes: string | null
  concepto: string
  monto: number
  liquidacion_id: string | null
  created_at: string
}

export type ReclamoConsorcio = {
  id: string
  consorcio_id: string
  unidad_id: string | null
  descripcion: string
  estado: EstadoMantenimiento
  fecha_reporte: string
  fecha_resolucion: string | null
  notas: string | null
  created_at: string
}

export type Asamblea = {
  id: string
  consorcio_id: string
  fecha: string
  temas: string | null
  acta_path: string | null
  acta_nombre: string | null
  acta_tipo: string | null
  created_at: string
}

export type Notificacion = {
  id: string
  tipo: TipoNotificacion
  contrato_id: string | null
  titulo: string
  mensaje: string
  leida: boolean
  email_enviado: boolean
  metadata: Record<string, unknown> | null
  created_at: string
}

// Cada tabla expone Row/Insert/Update/Relationships para satisfacer el
// GenericSchema que espera @supabase/supabase-js v2.
type TableDef<T> = {
  Row: T
  Insert: Partial<T>
  Update: Partial<T>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      duenos: TableDef<Dueno>
      inquilinos: TableDef<Inquilino>
      propiedades: TableDef<Propiedad>
      contratos: TableDef<Contrato>
      indices_valores: TableDef<IndiceValor>
      actualizaciones_contrato: TableDef<ActualizacionContrato>
      pagos: TableDef<Pago>
      usuarios_equipo: TableDef<UsuarioEquipo>
      notificaciones: TableDef<Notificacion>
      contratos_generados: TableDef<ContratoGenerado>
      contratos_archivos: TableDef<ContratoArchivo>
      liquidaciones: TableDef<Liquidacion>
      mantenimiento: TableDef<Mantenimiento>
      seguros_propiedad: TableDef<SeguroPropiedad>
      configuracion: TableDef<Configuracion>
      cotizaciones_dolar: TableDef<CotizacionDolar>
      log_actividad: TableDef<LogActividad>
      consorcios: TableDef<Consorcio>
      propietarios_consorcio: TableDef<PropietarioConsorcio>
      unidades_funcionales: TableDef<UnidadFuncional>
      proveedores_edificio: TableDef<ProveedorEdificio>
      gastos_edificio: TableDef<GastoEdificio>
      liquidaciones_expensas: TableDef<LiquidacionExpensas>
      expensas_por_unidad: TableDef<ExpensaPorUnidad>
      fondo_reserva: TableDef<MovimientoFondoReserva>
      reclamos_consorcio: TableDef<ReclamoConsorcio>
      asambleas: TableDef<Asamblea>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      estado_propiedad: EstadoPropiedad
      paga_expensas: PagaExpensas
      tipo_indice: TipoIndice
      estado_contrato: EstadoContrato
      estado_pago: EstadoPago
      estado_deposito: EstadoDeposito
      moneda: Moneda
      estado_liquidacion: EstadoLiquidacion
      estado_mantenimiento: EstadoMantenimiento
      tipo_seguro: TipoSeguro
      rol_usuario: RolUsuario
      tipo_notificacion: TipoNotificacion
    }
    CompositeTypes: Record<string, never>
  }
}
