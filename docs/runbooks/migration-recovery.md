# Runbook: una migración falló en producción

Las migraciones se aplican solas al mergear a `main` (`.github/workflows/db-deploy.yml`, `supabase db
push` sin `--include-all`). Producción tiene datos reales.

## Reglas

1. **Sabé exactamente contra qué base estás operando.** Nada de `supabase link` ni `--db-url` desde
   tu máquina salvo que sea parte del incidente y lo hayas decidido.
2. **Que no corra nada más en paralelo**: no mergear otros PRs con migraciones mientras tanto.
3. **Verificá el resultado contra el catálogo o los datos**, no solo contra la fila en
   `supabase_migrations.schema_migrations`.
4. **Nunca edites una migración ya mergeada** (el CI lo bloquea). Se corrige con una migración nueva.
5. **El código desplegado tiene que seguir funcionando durante el cambio**: Vercel y `db-deploy`
   corren en paralelo, así que toda migración debe ser compatible con el código anterior
   (primero agregar, después usar, al final quitar).

## Síntomas y qué hacer

| Mensaje en el job `Push migrations` | Qué significa | Qué hacer |
|---|---|---|
| `Found local migration files to be inserted before the last migration on remote database` | Hay una migración con número menor que la última aplicada | Renombrarla con el siguiente número libre en un PR nuevo. No usar `--include-all`. |
| Error SQL en una migración (constraint, tipo, duplicado) | La migración no aplica sobre los datos reales y no quedó registrada | Confirmar que **no** figura en `supabase_migrations.schema_migrations`. Si no figura, corregir ese mismo archivo en un PR con el label `migration-override` (única excepción a append-only). Si figura, migración nueva. Probar antes en local con datos parecidos. |
| `duplicate key value violates unique constraint "schema_migrations_pkey"` | Dos archivos con el mismo número | Renombrar uno en un PR nuevo (el CI ya lo detecta). |
| Timeout o conexión | Problema transitorio | Volver a correr el workflow desde `main` (Actions → Run workflow). Re-ejecutar un run viejo usa su commit viejo. |

## Después del incidente

- Confirmá en la base que los objetos esperados existen (tablas, columnas, funciones, políticas).
- Si la app quedó incompatible con el schema, revertí el deploy de Vercel al anterior mientras se
  corrige.
- Anotá en el PR del arreglo qué pasó y cómo se verificó.
