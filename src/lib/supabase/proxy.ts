import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { clearAuthCookies } from "@/lib/supabase/cookies";
import type { Database } from "@/types/database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims() no sólo devuelve error: con una cookie corrupta o truncada
  // @supabase/ssr intenta decodificarla como base64 y tira "Invalid UTF-8
  // sequence". Sin este catch la middleware responde 500, y como el 500 corta
  // antes de limpiar las cookies, la sesión rota queda pegada hasta que el
  // usuario las borre a mano desde el browser.
  let claims: unknown = null;
  try {
    const { data } = await supabase.auth.getClaims();
    claims = data?.claims ?? null;
  } catch {
    claims = null;
  }

  if (!claims) {
    // Sin claims la sesión ya no sirve: el refresh token venció o la sesión
    // fue revocada. Si las cookies muertas no se borran acá, el browser las
    // vuelve a mandar en cada request y el ciclo se repite —403 en
    // /auth/v1/user, redirect a login, 403 otra vez— hasta que el access
    // token expire por su cuenta, hasta una hora después.
    const isPublicPath =
      request.nextUrl.pathname.startsWith("/auth") ||
      request.nextUrl.pathname === "/";

    let response = supabaseResponse;
    if (!isPublicPath) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      response = NextResponse.redirect(url);
    }

    clearAuthCookies(
      response,
      request.cookies.getAll().map((cookie) => cookie.name),
    );
    return response;
  }

  return supabaseResponse;
}
