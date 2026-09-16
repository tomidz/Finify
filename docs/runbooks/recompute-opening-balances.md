# Runbook: saldos iniciales que no cuadran

Cada mes guarda el saldo inicial de cada cuenta activa en `opening_balances`. La regla es una
sola: **saldo inicial de un mes = saldo inicial del mes anterior + movimientos no borrados del mes
anterior**, en moneda de la cuenta y en moneda base. El primer mes es el ancla: ahí vive el saldo
inicial de cada cuenta.

## Diagnosticar

Configuración → **Diagnóstico de saldos**. Usa `ledger_drift()` (migración 0043), de solo lectura,
y lista cada mes donde la regla no se cumple:

- **Guardado / Esperado / Diferencia**: el saldo guardado, el que sale de la regla y la resta, en
  moneda de la cuenta. **Diferencia base**: lo mismo en moneda base.
- **Falta**: una cuenta activa no tiene fila en ese mes. No se lee como cero.

La tolerancia (0,000001) solo absorbe el redondeo a 8 decimales.

Desde SQL, como el usuario (en local): `select * from ledger_drift();`

## Corregir

1. **Revisá el primer mes.** Recalcular parte de sus saldos: si el ancla está mal, el resultado
   también, y el diagnóstico no lo ve porque la cadena queda consistente. Pasa, por ejemplo, si se
   registró un movimiento con fecha anterior al primer mes: ese mes nuevo pasa a ser el primero con
   saldos en cero. Para una cuenta con el saldo inicial equivocado: Cuentas → editar → saldo
   inicial. Eso escribe el primer mes y recalcula hacia adelante.
2. **Recalcular todo** (en el mismo panel) reescribe todos los meses siguientes a partir del
   primero, para las cuentas activas.
3. Volvé a mirar el diagnóstico: tiene que quedar **Sin diferencias**.

## Qué no arregla

- **Cuentas inactivas**: no se recalculan ni aparecen en el diagnóstico. Si reactivás una cuenta,
  el diagnóstico puede mostrar meses con **Falta**; recalculá después de reactivarla.
- **Un error en los movimientos** (monto o fecha mal cargados): el recálculo los suma tal cual. Se
  corrigen editando la transacción.
- **Un fallo del recálculo**: "Recalcular todo" muestra el error y no escribe nada si falla una
  lectura. Si falla una escritura a mitad de camino, los meses ya escritos quedan actualizados y el
  diagnóstico muestra los que faltan; volvé a correrlo.
