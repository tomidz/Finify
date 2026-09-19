---
name: db-change-safety
description: Revisar una migración de Supabase de Finify antes de commitearla. Usar al crear o modificar archivos en supabase/migrations o supabase/tests, o al tocar RLS, grants o funciones SQL.
---

# Seguridad de cambios en la base

Producción tiene datos reales y las migraciones se aplican solas al mergear a `main`, en paralelo
con el deploy de Vercel. Revisá cada ley contra el diff y marcala **PASS**, **DEFECT** (con archivo
y línea) o **N/A**. Un DEFECT se arregla antes de commitear.

## Leyes

1. **Número.** `NNNN_nombre.sql` con el siguiente número libre, mayor que el último de `main`.
2. **Solo agregar.** No se edita una migración mergeada: el arreglo es una migración nueva.
3. **Compatible con el código anterior.** La migración corre mientras el código viejo sigue
   sirviendo: primero agregar, después usar, al final quitar. Un `REVOKE`, `DROP` o `CHECK` nuevo
   no puede romper lo que `main` hace hoy.
4. **Destructiva o de datos.** `DROP TABLE/COLUMN`, `RENAME`, `ALTER COLUMN … TYPE`,
   `SET NOT NULL` llevan `-- destructive-ok: <motivo>`. Un `UPDATE`/`DELETE` de datos necesita la
   aprobación explícita del usuario.
5. **RLS.** Tabla nueva: RLS activa, políticas para las operaciones que usa la app con
   `WITH CHECK`, dueño validado (`auth.uid()`), y el dueño de cada FK si la fila apunta a otra.
6. **Funciones.** `SECURITY INVOKER` por defecto. `SECURITY DEFINER` solo con `search_path` fijo,
   identidad de `auth.uid()` (nunca de un parámetro) y la excepción agregada en
   `supabase/tests/rls_coverage_test.sql`. `REVOKE … FROM PUBLIC, anon` y `GRANT` a
   `authenticated` explícitos.
7. **CHECK sobre historial.** `NOT VALID`: valida filas nuevas sin arriesgar el deploy.
8. **Reversión.** El encabezado dice cómo volver atrás.
9. **Test.** RLS, grants o funciones nuevas tienen su `supabase/tests/*_test.sql`.
10. **Tipos.** `src/types/database.types.ts` coincide con lo que genera la CLI fijada en CI.
11. **Comentarios.** El repo es público: describen lo que la migración hace, no un hueco que sigue
    abierto.

## Falsos positivos

- `DROP …` dentro de un comentario de reversión: el chequeo del CI ignora los comentarios `--`.
- `REVOKE … TRUNCATE` lo marca el chequeo de DDL destructiva: no hace falta, PostgREST no
  expone `TRUNCATE`.
- `CREATE OR REPLACE FUNCTION` con la misma firma conserva dueño y grants: no hay que repetirlos.
- Las acciones de FK (`ON DELETE CASCADE`/`SET NULL`) corren como dueño de la tabla: funcionan
  aunque el usuario no tenga `UPDATE`/`DELETE` sobre la tabla hija.
- Las funciones SQL `INVOKER` sin `search_path` fijo son deliberadas (0042): un `SET` impide
  inlinearlas y no protege ningún límite de privilegios.
