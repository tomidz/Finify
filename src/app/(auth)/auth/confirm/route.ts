import { authErrorMessage } from "@/lib/auth-errors";
import { logError } from "@/lib/log";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // PKCE flow: Supabase sends a "code" param
  const code = searchParams.get("code");
  // Legacy/email OTP flow: Supabase sends "token_hash" + "type"
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Only same-origin paths: an absolute, protocol-relative or backslash
  // `next` would let a crafted confirmation link land the fresh session on
  // an attacker-controlled page (open redirect).
  const next = safeRedirectPath(searchParams.get("next"));

  const supabase = await createClient();

  // Try PKCE code exchange first (magic link default flow)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(next);
    }
    redirectToError(error);
  }

  // Fallback: email OTP with token_hash
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      redirect(next);
    }
    redirectToError(error);
  }

  redirect("/auth/error?error=Token+inválido");
}

function redirectToError(error: { code?: string }): never {
  logError("authConfirm", error);
  const message = authErrorMessage(error, "No se pudo confirmar el link. Pedí uno nuevo.");
  redirect(`/auth/error?error=${encodeURIComponent(message)}`);
}
