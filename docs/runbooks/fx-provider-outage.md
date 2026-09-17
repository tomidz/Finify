# Runbook: un proveedor de cotizaciones no responde

La app convierte a moneda base con tres proveedores:

- **Frankfurter** (`api.frankfurter.dev`): monedas fiat, con historial.
- **dolarapi** (`dolarapi.com`): el dólar oficial de hoy, para ARS.
- **argentinadatos** (`api.argentinadatos.com`): el dólar oficial de fechas pasadas, para ARS.

Cada cotización que devuelven se guarda en `fx_rates` bajo la fecha para la que fue cotizada. La
fuente guardada es `frankfurter` para fiat y `dolarapi` para cualquier par con ARS.

## Qué hace la app sin proveedor

Para una fecha, `getFxQuote` usa:

1. la cotización guardada para esa fecha;
2. si no está, el proveedor;
3. si el proveedor falla, la última guardada dentro de **7 días** (**3** para ARS).

Con el paso 3 la pantalla sigue funcionando y muestra **"TC del dd/mm"**. Si tampoco hay una
cotización reciente:

- **Lecturas**: el monto queda **sin cotización**, fuera de los totales, y la pantalla lo marca.
  Nunca se valúa 1:1.
- **Escrituras** que necesitan la base (un gasto en otra moneda, un saldo inicial, un pago de deuda):
  fallan con "No hay cotización de X a Y…". Si el formulario tiene un campo de tipo de cambio,
  cargarlo a mano permite guardar.

## Diagnosticar

1. Probá el proveedor desde el navegador:
   - `https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD`
   - `https://dolarapi.com/v1/dolares/oficial`
   - `https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial/AAAA/MM/DD`
2. Mirá qué cotizaciones hay guardadas, en el SQL Editor (solo lectura):

   ```sql
   SELECT source, from_currency, to_currency, max(rate_date) AS ultima
   FROM public.fx_rates
   GROUP BY source, from_currency, to_currency
   ORDER BY ultima;
   ```

## Qué hacer

- **Caída corta** (menos que la ventana): nada. Cuando el proveedor vuelve, la próxima lectura trae y
  guarda la cotización del día.
- **Caída larga**: cargá la cotización del día en `fx_rates` desde una fuente oficial (BCE para fiat,
  BCRA para el oficial ARS), con la **misma fuente** que usaría la app, para que la encuentre:

  ```sql
  INSERT INTO public.fx_rates (rate_date, from_currency, to_currency, rate, source)
  VALUES ('AAAA-MM-DD', 'EUR', 'USD', 1.0850, 'frankfurter');
  ```

  Es una escritura en producción: se hace a mano, con la fecha exacta de la cotización y nunca bajo
  otra fecha. Cuando el proveedor vuelva, la fila ya guardada se sigue usando.

## Verificar

- Las pantallas dejan de mostrar "sin cotización".
- "TC del dd/mm" desaparece cuando hay cotización del día.
