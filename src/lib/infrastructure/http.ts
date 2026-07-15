import { atlasHttp } from "@/lib/http-client";
import { NetworkError } from "@/lib/infrastructure/errors";
import type { HttpRequest, HttpResponse, HttpError } from "@/types/http";

// Atlas Infrastructure — HTTP.
//
// Atlas already has a full HTTP Client (`src/lib/http-client.ts`,
// `atlasHttp`) built in an earlier sprint: timeout support (via a real
// `AbortController`), JSON parsing, structured errors (`HttpError`), and
// documented seams for future retry/rate-limiting/Edge Function support
// (see `docs/architecture/http-client.md`). Per "no duplicated
// utilities," this file does NOT reimplement any of that — it re-exports
// `atlasHttp` and adds `safeGet`/`safePost`, two thin convenience
// wrappers that never throw (returning a result object instead), for
// callers who prefer that style over try/catch around `atlasHttp`
// directly. No networking logic of its own lives here.

export { atlasHttp };
export type { HttpRequest, HttpResponse, HttpError };

type RequestOptions = Partial<Omit<HttpRequest, "url" | "method" | "body">>;

/**
 * The result shape `safeGet`/`safePost` resolve to — exactly one of
 * `data` or `error` is populated, never both.
 */
export interface SafeHttpResult<T> {
  ok: boolean;
  data: T | null;
  error: HttpError | null;
}

function toNetworkError(err: unknown): HttpError {
  if (err && typeof err === "object" && "retryable" in err && "status" in err) {
    return err as HttpError;
  }
  // atlasHttp is documented to only ever throw a structured HttpError,
  // but this file never assumes that of a caught value it didn't throw
  // itself — wrap anything unexpected into the same shape rather than
  // letting a malformed error leak out of a "safe" method.
  throw new NetworkError("Unexpected non-HttpError thrown by atlasHttp", { cause: err });
}

/**
 * GET that never throws — a network failure/timeout resolves to
 * `{ ok: false, data: null, error }` instead of rejecting. Prefer
 * `atlasHttp.get()` directly when you want to `try`/`catch` an
 * `HttpError` yourself.
 */
export async function safeGet<T = unknown>(url: string, options?: RequestOptions): Promise<SafeHttpResult<T>> {
  try {
    const response = await atlasHttp.get<T>(url, options);
    return { ok: response.ok, data: response.body, error: null };
  } catch (err) {
    return { ok: false, data: null, error: toNetworkError(err) };
  }
}

/**
 * POST that never throws — see `safeGet` above for the same rationale.
 */
export async function safePost<T = unknown>(
  url: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<SafeHttpResult<T>> {
  try {
    const response = await atlasHttp.post<T>(url, body, options);
    return { ok: response.ok, data: response.body, error: null };
  } catch (err) {
    return { ok: false, data: null, error: toNetworkError(err) };
  }
}

// --- Future extensibility -------------------------------------------------
//
// Future Edge Function support: `atlasHttp`'s own TODO(edge-function)
// comments (see `http-client.ts` and `website-discovery-service.ts`)
// already mark where a server-side proxy replaces direct browser
// `fetch()` calls — `safeGet`/`safePost` need no changes when that
// lands, since they call `atlasHttp` rather than `fetch` themselves.
//
// Future retry support: `HttpError.retryable` already exists specifically
// for this (see `docs/architecture/http-client.md`'s "Future Retry
// Strategy"). A future `safeGetWithRetry`-style helper here would wrap
// `safeGet` and retry while `error.retryable` is true, up to some limit.
//
// Future rate limiting: same integration point as documented in
// `http-client.md` — a pre-flight check before `atlasHttp.request()` is
// called, not something `safeGet`/`safePost` need to know about here.
