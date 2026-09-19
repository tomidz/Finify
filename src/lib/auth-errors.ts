/*
 * Supabase Auth errors in Spanish. Its messages are English ("Invalid login
 * credentials"); the code says what happened.
 */

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email o contraseña incorrectos.",
  email_not_confirmed: "Confirmá tu email antes de entrar: te mandamos un link.",
  user_already_exists: "Ya hay una cuenta con ese email.",
  email_exists: "Ya hay una cuenta con ese email.",
  weak_password: "La contraseña es demasiado débil.",
  same_password: "La nueva contraseña tiene que ser distinta de la actual.",
  over_request_rate_limit: "Demasiados intentos. Esperá unos minutos y probá de nuevo.",
  over_email_send_rate_limit: "Ya te mandamos un email hace poco. Esperá unos minutos.",
  otp_expired: "El link venció. Pedí uno nuevo.",
  signup_disabled: "El registro está cerrado.",
  user_not_found: "No hay una cuenta con ese email.",
  session_not_found: "Tu sesión venció. Volvé a entrar.",
};

export function authErrorMessage(error: { code?: string } | null | undefined, fallback: string): string {
  return (error?.code ? MESSAGES[error.code] : undefined) ?? fallback;
}
