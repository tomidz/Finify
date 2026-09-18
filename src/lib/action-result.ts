/*
 * What server actions return, and how the client turns a failure into a
 * message: the action's own words, or a Spanish one for a failure on the way
 * (the network, a server that did not answer) instead of the browser's.
 */

/** A server action's data, or a message the user can read. */
export type ActionResult<T> = { data: T } | { error: string };

/** A failure the action reported, with a message meant for the user. */
export class ActionError extends Error {
  override readonly name = "ActionError";
}

/** The data of a result, or an ActionError with its message (for query and mutation functions). */
export function unwrapResult<T>(result: ActionResult<T>): T {
  if ("error" in result) throw new ActionError(result.error);
  return result.data;
}

export const TRANSPORT_FAILURE = "No se pudo conectar con el servidor. Revisá tu conexión y probá de nuevo.";
export const UNEXPECTED_FAILURE = "Algo salió mal. Probá de nuevo.";

// What browsers, fetch and Next say when a request never got an answer.
const TRANSPORT_PATTERN =
  /failed to fetch|load failed|networkerror|fetch failed|network request failed|unexpected response was received from the server/i;

/** A request that failed on the way, which is worth retrying. */
export function isTransportError(error: unknown): boolean {
  if (error instanceof ActionError) return false;
  if (error instanceof TypeError && TRANSPORT_PATTERN.test(error.message)) return true;
  return error instanceof Error && TRANSPORT_PATTERN.test(error.message);
}

export const STALE_CLIENT = "Finify se actualizó. Recargá la página y probá de nuevo.";

/**
 * The message to show for a failed query or mutation. Only an ActionError
 * carries words for the user; any other error is a bug or a server error Next
 * hides, and its message is technical.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ActionError) return error.message;
  if (isTransportError(error)) return TRANSPORT_FAILURE;
  // A tab opened before a deploy calls actions the server no longer has.
  if (error instanceof Error && error.name === "UnrecognizedActionError") return STALE_CLIENT;
  return UNEXPECTED_FAILURE;
}
