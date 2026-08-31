const AUTH_COOKIE_PREFIX = "sb-";

/** Estructura mínima de NextResponse que necesita `clearAuthCookies`. */
type CookieDeleter = {
  cookies: { delete: (name: string) => unknown };
};

/**
 * @supabase/ssr parte el token en `sb-<ref>-auth-token.0`, `.1`, … cuando no
 * entra en una sola cookie, así que hay que filtrar por prefijo y no por nombre
 * exacto: borrar sólo `sb-<ref>-auth-token` deja los chunks huérfanos y la
 * sesión muerta se sigue reconstruyendo.
 */
export function authCookieNames(names: readonly string[]): string[] {
  return names.filter((name) => name.startsWith(AUTH_COOKIE_PREFIX));
}

export function clearAuthCookies(
  response: CookieDeleter,
  names: readonly string[],
): void {
  for (const name of authCookieNames(names)) {
    response.cookies.delete(name);
  }
}
