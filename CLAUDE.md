# Finify — guía para agentes

App de finanzas personales para **un solo usuario**. Next.js 16 (App Router) + React 19, Supabase
(Postgres + RLS por `user_id = auth.uid()`), TanStack Query, deploy en Vercel (`dub1`, misma región
que la base en `eu-west-1`). **Producción tiene datos reales.**

## Superficies

- `src/actions/*.ts`: server actions. **Cada export de un archivo `"use server"` es un endpoint
  público**: tiene que verificar la sesión antes de hacer cualquier cosa. Los helpers internos van en
  `src/lib/server/*` con `import "server-only"`, nunca exportados desde `"use server"`.
- `src/app/api/aicfo/route.ts`: único route handler (chat de IA).
- No hay cliente service-role. Toda escritura pasa por RLS.

## Comandos

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # siempre, antes de dar algo por terminado
pnpm build                                 # si tocaste rutas, config o dependencias
pnpm db:types:generate                     # después de una migración (requiere supabase start)
pnpm db:types:check                        # tipos generados = commiteados (también en CI)
pnpm db:test                               # pgTAP de supabase/tests (requiere supabase start)
```

Una migración que toca RLS, grants o funciones lleva su test en `supabase/tests/*_test.sql`. El job
`Database` del CI aplica todas las migraciones y corre pgTAP, `supabase db lint` y los tipos.

Next 16 cambió APIs respecto de versiones anteriores: antes de usar una API de Next, leé la guía
correspondiente en `node_modules/next/dist/docs/`.

## Invariantes del ledger y FX

1. `transaction_amounts.amount` está en la moneda de la cuenta; `base_amount` en la moneda base.
   Nunca se suman montos de monedas distintas.
2. Transferencia = 2 legs. El origen es `−(monto + comisión)`; en la misma moneda el destino es
   exactamente el monto, respetando `currencies.decimals` (cripto usa 6–8 decimales).
3. Toda lectura y todo agregado filtran `deleted_at IS NULL`, también dentro de las RPCs.
4. Apertura del mes M = saldo inicial + Σ legs de los meses anteriores. Toda mutación de un mes
   pasado recalcula la cadena y **el resultado del recálculo se revisa**: nunca se ignora un error.
5. Nunca se guarda una cotización bajo una fecha para la que no fue cotizada, y nunca se asume una
   tasa 1:1 en silencio (ver "Política de FX").
6. El débito o crédito automático de inversiones solo ocurre si coinciden la moneda de la cuenta y
   la de la inversión.
7. Una escritura de varias filas va en una función plpgsql (una transacción) o es idempotente.
8. Ninguna lectura que necesite "todas las filas" depende de `max_rows` (1000): sumar en SQL o
   paginar.

## Política de FX

- **Flujos** (movimientos, pagos de deuda, compras y ventas): a la tasa de su fecha. Se guarda
  `base_amount` al registrarlos y las listas y el dashboard los revalúan a esa misma fecha.
- **Saldos y patrimonio**: a la tasa de cierre de cada mes (hoy para el mes en curso). Todavía no
  todas las vistas lo cumplen: patrimonio suma la caja a la base histórica de sus movimientos y
  valúa inversiones y pasivos a la tasa de hoy.
- **Búsqueda** (`getFxQuote`, `resolveFxRates` en TS; `fx_rate_asof` en SQL): la cotización
  guardada para esa fecha; si no está, el proveedor (que se guarda); si falla, la última guardada
  dentro de 7 días (3 para ARS), con su fecha. Una fecha futura usa la de hoy.
- **Proveedores**: Frankfurter (BCE, fiat con historial). ARS oficial: dolarapi para hoy y
  argentinadatos para fechas pasadas; los cruces ARS↔otra moneda pasan por USD.
- **Sin cotización**: un monto sin tasa no tiene base. Queda fuera de los totales y la pantalla lo
  marca ("sin cotización"); una escritura que necesita la base falla con un mensaje. Las RPCs de
  patrimonio devuelven `NULL` y `fx_missing`, y solo leen cotizaciones guardadas dentro de la misma
  ventana: antes de llamarlas se trae la de hoy (`warmTodayRates`).
- **Frescura**: cuando una tasa es anterior a la fecha que se pidió, la pantalla muestra "TC del
  dd/mm".

## Rendimiento

- El cliente de Next despacha las server actions **de a una**. No agregues otra action de lectura
  por widget: agrupá las lecturas de una pantalla en una sola action con `Promise.all` o usá un
  route handler GET.
- Nada de consultas dentro de loops (N+1). Resolvé FX y precios por lote.
- Las llamadas a proveedores externos (precios, FX) no van en el camino crítico de render sin caché.

## Migraciones

- `supabase/migrations/NNNN_nombre.sql` con el **siguiente número libre**. El CI exige números
  estrictamente crecientes, sin duplicados, y **prohíbe editar migraciones ya mergeadas**.
- Aditivas y reversibles. Vercel y la migración se despliegan en paralelo, así que toda migración
  debe ser compatible con el código anterior: primero agregar, después usar, al final quitar.
- DDL destructiva (`DROP TABLE/COLUMN`, `RENAME`, `ALTER COLUMN … TYPE`, `SET NOT NULL`) necesita
  un comentario `-- destructive-ok: <motivo>` y una razón real.
- RLS: políticas para las 4 operaciones con `WITH CHECK`; validar el dueño de cada FK referenciada;
  `REVOKE` nombrando `anon` y `authenticated`; `SECURITY DEFINER` solo con `search_path` fijo y
  tomando la identidad de `auth.uid()`, nunca de un parámetro.
- Funciones: desde 0042 una función nueva no tiene `EXECUTE` para `PUBLIC` ni `anon`. En `public`,
  `authenticated` lo recibe por los defaults de Supabase; en otro esquema hace falta un `GRANT`
  explícito.
- `CHECK` sobre tablas con historial: `NOT VALID`. El runbook de restore ya los saca y los repone.
- Después de migrar: regenerar `src/types/database.types.ts` y commitearlo.

## Producción

- **Prohibido**: `supabase db push`, `supabase link`, `supabase migration repair`, cualquier comando
  con `--linked` o `--db-url`, y las tools de escritura del MCP de Supabase contra el proyecto real.
  Las migraciones llegan a producción solo por CI al mergear a `main`.
- `supabase db reset` solo contra la base **local**, y preguntando antes.
- El repo es público: nada de secretos, dumps ni datos reales en commits, artifacts o PRs.

## Local ≠ producción

`max_rows`, `enable_signup`, URLs de redirección de auth y variables de entorno de Vercel se
configuran en los dashboards, no en el repo. `supabase/config.toml` solo describe el entorno local.

## Runbooks

- `docs/runbooks/migration-recovery.md`: una migración falló en producción.
- `docs/runbooks/restore-from-backup.md`: backups cifrados y restauración.
- `docs/runbooks/fx-provider-outage.md`: un proveedor de cotizaciones no responde.

## Estilo

- UI en español rioplatense, textos cortos. Comentarios solo cuando explican un porqué que el código
  no muestra.
- Sin animaciones ni transiciones nuevas; todo tiene que funcionar en claro y oscuro.
