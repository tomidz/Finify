---
name: ledger-invariants
description: Revisar cambios que tocan transacciones, saldos, aperturas, FX, inversiones o deudas en Finify. Usar antes de dar por terminado un cambio en src/actions, src/lib/ledger, src/lib/server o las RPCs de saldos.
---

# Invariantes del ledger

Para cada ley, marcá **PASS**, **DEFECT** (archivo, línea y un caso concreto que lo rompe) o
**N/A**. Un DEFECT sin caso concreto no es un DEFECT: buscá el caso o descartalo.

## Leyes

1. **Monedas.** `amount` está en la moneda de la cuenta y `base_amount` en la moneda base. Nunca se
   suman montos de monedas distintas.
2. **Transferencias.** Dos legs: el origen es `−(monto + comisión)`; en la misma moneda el destino
   es exactamente el monto. Lógica en `src/lib/ledger/transfer.ts`.
3. **Borrados.** Toda lectura y todo agregado filtran `deleted_at IS NULL`, también en SQL.
4. **Cadena de aperturas.** Apertura del mes = apertura del mes anterior + legs del mes anterior
   (`src/lib/ledger/opening-balances.ts`). Toda mutación de un mes pasado recalcula y **revisa el
   resultado**. `ledger_drift()` debe quedar vacío.
5. **Redondeo.** Las columnas son `NUMERIC(18,8)`: el valor que se encadena en JS es el que guarda
   la base (`roundLikeNumeric`), no la suma sin redondear.
6. **FX.** Una cotización se guarda solo bajo la fecha para la que fue cotizada; nunca una tasa 1:1
   en silencio; dolarapi (ARS) solo cotiza el día actual. Lecturas por lote (`resolveFxRates`).
7. **Inversiones.** El débito o crédito automático ocurre solo si coinciden la moneda de la cuenta
   y la de la inversión.
8. **Atomicidad.** Una escritura de varias filas va en una función plpgsql o es idempotente.
9. **Todas las filas.** Nada depende de `max_rows` (1000): `readAllRows`/`chunk` de
   `src/lib/server/paginate.ts` o sumar en SQL.
10. **Caché.** Toda escritura invalida lo que deriva del ledger (`invalidateLedger` en
    `src/lib/query-keys.ts`).

## Falsos positivos

- Una `correction` conserva el signo que trae (`normalizeSignedAmount`): no es un error de signo.
- Las cuentas inactivas no se recalculan ni aparecen en `ledger_drift()`: es conocido y va en la
  fase 3 del plan, no es un defecto nuevo del diff.
- El forecast excluye legs `investment` y `correction` a propósito: no son gasto.
- La lista de transacciones usa el `base_amount` guardado si falta una cotización: es el fallback
  elegido para no romper la lista entera.
- Un `it.fails` en los tests documenta un bug conocido todavía sin arreglar: no lo borres para
  "arreglar" el test.
