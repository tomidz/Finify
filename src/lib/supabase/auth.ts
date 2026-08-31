import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Valida la sesión contra el servidor de Auth, no sólo la firma del JWT.
 *
 * `getClaims()` verifica el access token localmente contra el JWKS, así que una
 * sesión revocada lo sigue pasando hasta que el token expira (una hora). En esa
 * ventana el layout renderizaba el dashboard como si todo estuviera bien y
 * recién fallaban los server actions, uno por uno, con "Error al cargar…" —el
 * síntoma se parecía a que la DB no respondía.
 *
 * El redirect va a /auth/logout y no directo a /auth/login porque sólo un route
 * handler puede borrar las cookies de sesión de forma confiable.
 */
export async function requireUser(): Promise<User> {
  const supabase = await createClient();

  // Igual que getClaims(), getUser() tira si la cookie está corrupta en vez de
  // devolver error, y una excepción acá rompe el render entero del dashboard.
  let user: User | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch {
    user = null;
  }

  // Fuera del try: redirect() funciona tirando NEXT_REDIRECT y el catch se lo
  // comería.
  if (!user) {
    redirect("/auth/logout?reason=expired");
  }

  return user;
}
