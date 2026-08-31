import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { clearAuthCookies } from "@/lib/supabase/cookies";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();

  // Con una sesión ya revocada esto responde 403; las cookies se borran igual
  // más abajo, así que el logout nunca queda a medias.
  try {
    await supabase.auth.signOut();
  } catch {
    // Ignorado a propósito: el borrado de cookies es lo que corta la sesión.
  }

  const target = new URL("/auth/login", url.origin);
  if (url.searchParams.get("reason") === "expired") {
    target.searchParams.set("expired", "1");
  }

  const response = NextResponse.redirect(target);
  const cookieStore = await cookies();
  clearAuthCookies(
    response,
    cookieStore.getAll().map((cookie) => cookie.name),
  );

  return response;
}
