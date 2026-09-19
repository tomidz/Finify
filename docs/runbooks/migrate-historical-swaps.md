# Runbook: pasar swaps históricos al modelo de intercambio

Antes de existir **Intercambiar** (migración 0051), un cambio de un activo por otro dentro de un
exchange (por ejemplo USDT por BTC) se cargaba como una **venta** y una **compra**. Las dos movían el
monto completo por la caja fiat de la cuenta, que nunca lo tuvo: aparecían saldos negativos
intermedios, "Ajuste Saldo" para volver a cero y, en Presupuesto, inversiones que no existieron.

Este runbook convierte cada par en un intercambio. Se hace a mano desde la app, un par por vez.

## Encontrar los pares

Correr en el SQL Editor de producción (solo lectura) la consulta 2 de la verificación de la Fase M:
lista cada venta y compra de inversión en la misma cuenta, el mismo día y por el mismo monto. La
consulta 3 lista los ajustes de saldo en cuentas de inversión.

## Convertir un par

Para cada par (venta de A, compra de B, mismo día y monto):

1. **Anotá los datos**: fecha, cantidad vendida de A, cantidad comprada de B y el monto (el crédito
   de la venta).
2. **Revisá que ni A ni B se hayan comprado, vendido, movido ni ajustado después de esa fecha** (en
   esa cuenta). Si pasó, dejá ese par como está: borrar la compra de B dejaría pagada la parte que ya
   salió del lote, y el intercambio reduciría también los lotes de A comprados después, cambiando su
   costo y la ganancia realizada.
3. **Borrá la venta de A** (Inversiones → Historial de ventas → eliminar). Vuelve el lote de A y se va
   el crédito de caja.
4. **Borrá el lote de B** (Inversiones → fila de B → eliminar). Se va el débito de caja.
5. **Registrá el intercambio**: en la fila de A, **Intercambiar**, con la fecha, las cantidades y el
   monto del paso 1 como valor de mercado.
6. **Borrá el "Ajuste Saldo"** que compensaba ese par, si lo hay (Transacciones → eliminar).

## Verificar

- La caja del exchange queda en 0 (o en su saldo real) sin ajustes.
- **Presupuesto → Inversiones** de los meses afectados ya no muestra montos que no salieron de la caja.
- Configuración → **Diagnóstico de saldos** sigue en **Sin diferencias**.

## Qué no cambia

- El costo del lote nuevo es el valor de mercado del intercambio, y la venta realiza la ganancia o
  pérdida de A a ese valor. El historial de ventas lo muestra con la nota "Intercambio por …".
