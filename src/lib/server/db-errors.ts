import "server-only";

import { logError } from "@/lib/log";

type DbError = { code?: string; message?: string } | null | undefined;

// A database message is technical and in English, and can quote the row; the
// user gets one of these instead.
const MESSAGES: Record<string, string> = {
  "23505": "Ya existe un registro con esos datos.",
  "23503": "Hay datos relacionados que lo impiden.",
  "23514": "Algún valor no es válido.",
  "23502": "Falta un dato obligatorio.",
  "22P02": "Algún valor tiene un formato inválido.",
  "22003": "Algún número es demasiado grande.",
  "42501": "No tenés permiso para hacer esto.",
  "57014": "La base de datos tardó demasiado. Probá de nuevo.",
  PGRST116: "No se encontró el registro.",
};

/**
 * The user's message for a failed query, logged under `tag`: the words of the
 * app's own functions, which raise them for the user (P0001); a fixed Spanish
 * sentence for a known code; `fallback` for anything else.
 */
export function dbError(tag: string, error: DbError, fallback: string): { error: string } {
  logError(tag, error);
  if (error?.code === "P0001" && error.message) return { error: error.message };
  // The app's functions raise 42501 for a caller with no session, too.
  if (error?.code === "42501" && /No autenticado|not signed in/.test(error.message ?? "")) {
    return { error: "No autenticado" };
  }
  return { error: (error?.code ? MESSAGES[error.code] : undefined) ?? fallback };
}
