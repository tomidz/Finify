# Runbook: saldos iniciales que no cuadran

Cada cuenta guarda su saldo inicial (`accounts.initial_amount` e `initial_base_amount`, migración
0044). Cada mes guarda el saldo de inicio de cada cuenta en `opening_balances`, y la regla es una
sola: **saldo de inicio de un mes = saldo inicial de la cuenta + movimientos no borrados de todos los
meses anteriores**, en moneda de la cuenta y en moneda base, para cuentas activas e inactivas.

`rebuild_opening_balances()` escribe esa regla en una sola sentencia. La usan todas las escrituras
del ledger: crear, editar, borrar y restaurar transacciones (`save_ledger_transaction` y
`set_ledger_transaction_deleted`, migración 0045, en la misma transacción que la escritura), crear un
mes, crear o editar una cuenta, y las inversiones.

## Diagnosticar

Configuración → **Diagnóstico de saldos**. Usa `ledger_drift()`, de solo lectura, y lista cada mes
donde la regla no se cumple:

- **Guardado / Esperado / Diferencia**: el saldo guardado, el que sale de la regla y la resta, en
  moneda de la cuenta. **Diferencia base**: lo mismo en moneda base.
- **Falta**: la cuenta no tiene fila en ese mes. No se lee como cero.

La tolerancia (0,000001) solo absorbe el redondeo a 8 decimales.

Desde SQL, como el usuario (en local): `select * from ledger_drift();`

## Corregir

1. **Revisá el saldo inicial de la cuenta.** El recálculo parte de él: si está mal, el resultado
   también, y el diagnóstico no lo ve. Se corrige en Cuentas → editar → saldo inicial, que guarda el
   valor en la cuenta y recalcula todos los meses.
2. **Recalcular todo** (en el panel de diagnóstico) reescribe los saldos de inicio de todos los meses
   y todas las cuentas.
3. Volvé a mirar el diagnóstico: tiene que quedar **Sin diferencias**.

## Qué no arregla

- **Un error en los movimientos** (monto o fecha mal cargados): el recálculo los suma tal cual. Se
  corrigen editando la transacción.
- **Un fallo del recálculo**: es una sola sentencia, así que no deja meses a medio escribir. Una
  transacción no se guarda si su recálculo falla. Si falla después de guardar una cuenta, un mes o
  una inversión, la acción avisa "Guardado, pero no se pudieron recalcular los saldos" y el
  diagnóstico muestra lo que falta; volvé a correr **Recalcular todo**.
