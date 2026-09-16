# Runbook: restaurar un backup de la base

Los backups diarios (`.github/workflows/db-backup.yml`) se suben como artifacts **cifrados con
[age](https://github.com/FiloSottile/age)**. El repo es público: nunca subas un dump sin cifrar.

## Configuración inicial (una sola vez)

1. Generá el par de claves en tu máquina:

   ```bash
   age-keygen -o finify-backup.key
   ```

2. Guardá `finify-backup.key` (clave **privada**) en tu gestor de contraseñas y borrá el archivo
   local. Sin esa clave los backups no se pueden leer.
3. Copiá la línea `# public key: age1…` y creá el secret del repo `BACKUP_AGE_RECIPIENT` con ese
   valor (Settings → Secrets and variables → Actions).
4. Corré el workflow a mano (Actions → Daily DB backup → Run workflow) y verificá que el artifact
   contiene solo archivos `.age`.

Sin `BACKUP_AGE_RECIPIENT` el workflow falla a propósito y no sube nada.

## Restaurar (siempre primero en local)

Restaurar sobre producción es una decisión de incidente: no se hace sin haber validado antes el
backup en local.

1. Descargá el artifact de la corrida que querés restaurar:

   ```bash
   gh run download <run-id> -R tomidz/Finify -n finify-db-backup-<run-id>
   ```

2. Descifrá con la clave privada:

   ```bash
   age -d -i finify-backup.key -o finify-backup-data.sql finify-backup-<fecha>-data.sql.age
   ```

3. Levantá una base local limpia con todas las migraciones (`supabase start` en un checkout de
   `main`) y cargá los datos:

   ```bash
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f finify-backup-data.sql
   ```

4. Verificá: cantidad de filas de `accounts`, `transactions`, `transaction_amounts`,
   `investments`, y que los saldos de apertura cuadren con los movimientos.
5. Borrá los `.sql` descifrados cuando termines.

> El procedimiento no se ensayó todavía de punta a punta: el primer ensayo tiene que confirmar si el
> dump de datos carga sobre una base nueva (claves foráneas hacia `auth.users`) y actualizar este
> runbook con lo que haga falta.
