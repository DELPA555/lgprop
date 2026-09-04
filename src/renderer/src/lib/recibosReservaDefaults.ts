// Plantillas por defecto de la cláusula de arrepentimiento de los recibos de
// reserva. Editables desde Ajustes (se guardan en `configuracion`) y snapshotadas
// en cada recibo. Placeholders resueltos al generar:
//   {DOBLE_LETRAS} {DOBLE}  → doble de la suma recibida (en letras / números)
//   {MONTO_LETRAS} {MONTO}  → suma recibida (en letras / números)
import { importeEnLetras, importeNumero } from './numeroLetras'

export const CLAVE_CLAUSULA_LOCACION = 'recibo_clausula_locacion'
export const CLAVE_CLAUSULA_VENTA = 'recibo_clausula_venta'
export const CLAVE_CIUDAD = 'recibo_ciudad_default'
export const CLAVE_REGISTRO = 'recibo_registro'

export const CIUDAD_DEFAULT = 'Mar del Plata'
export const REGISTRO_DEFAULT = '4171'

export const CLAUSULA_LOCACION_DEFAULT = `La parte reservante declara conocer y aceptar que la entrega de la presente suma tiene por finalidad reservar el inmueble e inmovilizar temporalmente su ofrecimiento a terceros. Si la parte reservante **desistiere, se arrepintiere o, por una causa imputable a ella, no avanzare con la celebración del contrato**, perderá íntegramente la suma entregada, sin derecho a restitución.

Si, una vez aceptada la reserva, la parte locadora **desistiere injustificadamente** de la operación por una causa exclusivamente imputable a ella, deberá reintegrar a la parte reservante el **doble de la suma recibida**, es decir, **{DOBLE_LETRAS} ({DOBLE})**.

Si la operación no pudiere concretarse por **rechazo de la reserva por parte de la locadora** antes de su aceptación, por imposibilidad jurídica de celebrar la locación o por otra circunstancia no imputable a la parte reservante, la suma entregada será restituida en su totalidad, sin intereses ni indemnización adicional.

La recepción de esta reserva **no implica por sí sola la celebración definitiva del contrato de locación**. La operación quedará perfeccionada con la aceptación de la parte locadora y la suscripción del instrumento correspondiente. Se extiende el presente recibo para constancia y en prueba de conformidad.`

export const CLAUSULA_VENTA_DEFAULT = `La parte reservante declara conocer y aceptar que la entrega de la presente suma tiene por finalidad reservar el inmueble e inmovilizar temporalmente su ofrecimiento a terceros. Si la parte reservante **desistiere, se arrepintiere o, por una causa imputable a ella, no avanzare con la celebración de la operación**, perderá íntegramente la suma entregada, sin derecho a restitución.

Si, una vez aceptada la reserva, la parte vendedora **desistiere injustificadamente** de la operación por una causa exclusivamente imputable a ella, deberá reintegrar a la parte reservante el **doble de la suma recibida**, es decir, **{DOBLE_LETRAS} ({DOBLE})**.

Si la operación no pudiere concretarse por **rechazo de la reserva por parte de la vendedora** antes de su aceptación, por imposibilidad jurídica de celebrar la compraventa o por otra circunstancia no imputable a la parte reservante, la suma entregada será restituida en su totalidad, sin intereses ni indemnización adicional.

La recepción de esta reserva **no implica por sí sola la celebración definitiva de la operación de compraventa**. La operación quedará perfeccionada con la aceptación de la parte vendedora y la suscripción del instrumento correspondiente (boleto de compraventa y/o escritura traslativa de dominio). Se extiende el presente recibo para constancia y en prueba de conformidad.`

// Sustituye los placeholders de importe en una plantilla de cláusula.
export function resolverClausula(
  template: string,
  monto: number,
  moneda: 'ARS' | 'USD'
): string {
  const doble = monto * 2
  return template
    .replace(/\{DOBLE_LETRAS\}/g, importeEnLetras(doble, moneda))
    .replace(/\{DOBLE\}/g, importeNumero(doble, moneda))
    .replace(/\{MONTO_LETRAS\}/g, importeEnLetras(monto, moneda))
    .replace(/\{MONTO\}/g, importeNumero(monto, moneda))
}
