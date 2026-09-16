---
name: verify
description: Verificar un cambio de Finify antes de darlo por terminado y reportar qué se comprobó y qué no. Usar al terminar cualquier tarea de código.
---

# Verificar

## 1. Siempre

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Un warning o test nuevo que falla es parte del cambio: se arregla, no se reporta como ajeno.

## 2. Según lo que tocaste

| Tocaste | Además |
|---|---|
| Rutas, `next.config`, dependencias | `pnpm build` |
| `supabase/migrations` o `supabase/tests` | `pnpm db:test` y `pnpm db:types:check` con `supabase start` local (preguntar antes de cualquier `db reset`); la skill `db-change-safety` |
| Transacciones, saldos, FX, inversiones | La skill `ledger-invariants`; en local, Configuración → Diagnóstico de saldos sin diferencias |
| Pantallas | Abrir la pantalla en local: carga, estado vacío, error y el número que cambió |

## 3. Reportar

- Qué corriste y el resultado real (con la salida si algo falló).
- Cada ley revisada con **PASS**, **DEFECT** o **N/A**.
- **Qué no verificaste** y por qué (por ejemplo: sin base local, sin datos de producción). Nunca
  presentes como verificado algo que no corriste.

## Falsos positivos

- `pnpm build` sin variables de entorno falla por las `NEXT_PUBLIC_SUPABASE_*`: con valores de
  prueba compila igual.
- La diferencia de formato en `database.types.ts` (paréntesis en tipos auxiliares) viene de la
  versión de la CLI: se regenera con la que fija el CI.
