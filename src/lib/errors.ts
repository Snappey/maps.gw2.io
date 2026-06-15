/**
 * Best-effort human-readable message from an unknown thrown/HTTP error. Effects
 * catch as `unknown`/`HttpErrorResponse` but failure actions carry `error: string`;
 * funnel the caught value through this so the store holds a renderable message
 * rather than `[object Object]`.
 *
 * Framework-free on purpose (no `HttpErrorResponse` import): an HttpErrorResponse
 * is matched structurally by its string `error` body / `message`.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (err && typeof err === "object") {
    const e = err as {error?: unknown; message?: unknown};
    if (typeof e.error === "string") {
      return e.error;
    }
    if (typeof e.message === "string") {
      return e.message;
    }
  }
  return typeof err === "string" ? err : String(err);
}
