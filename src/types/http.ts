export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

/**
 * A request to `atlasHttp`. Every field beyond `url` and `method` is
 * optional — `buildRequest()` in `http-client.ts` fills in Atlas's
 * defaults (timeout, headers) for whatever the caller omits.
 */
export interface HttpRequest {
  url: string;
  method: HttpMethod;
  /** Merged over Atlas's default headers — caller values win on conflict. */
  headers?: Record<string, string>;
  /** A string is sent as-is; any other value is JSON-serialized (and gets a `content-type: application/json` header, unless the caller already set one). */
  body?: unknown;
  /** Defaults to 10000ms (see DEFAULT_TIMEOUT_MS in http-client.ts). */
  timeoutMs?: number;
  /** Defaults to true (fetch `redirect: "follow"`). false uses `redirect: "manual"`. */
  followRedirects?: boolean;
  cache?: RequestCache;
  /** Arbitrary caller context (e.g. for future request logging/tracing) — never sent over the wire. */
  metadata?: Record<string, unknown>;
}

/**
 * The normalized result of any completed HTTP exchange (2xx through 5xx).
 * `atlasHttp` returns this instead of a raw `Response` so callers never
 * need to know they're dealing with the Fetch API specifically.
 *
 * A request that never completes at all (network failure, timeout, CORS
 * rejection) does NOT produce an `HttpResponse` — it throws an
 * `HttpError` instead (see below). `ok: false` here means "the server
 * responded, but with a non-2xx status," not "the request failed
 * outright."
 */
export interface HttpResponse<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  /** The final URL after any redirects were followed. */
  url: string;
  /** Response headers, normalized to a plain lowercase-keyed object. */
  headers: Record<string, string>;
  /**
   * The response body — parsed as JSON if the response's `content-type`
   * includes `application/json`, otherwise returned as raw text. `null`
   * for an empty body (e.g. a HEAD request, or a 204).
   */
  body: T | null;
  durationMs: number;
}

/**
 * Thrown by `atlasHttp` when a request never completes — network
 * failure, DNS failure, CORS rejection, or timeout. This is what "never
 * expose raw fetch exceptions" means in practice: callers only ever
 * catch this structured shape, never a raw `TypeError` or
 * `DOMException`.
 */
export interface HttpError {
  message: string;
  /** Always null — an HttpError means no response was ever received. */
  status: number | null;
  url: string;
  /** The original thrown value (a DOMException for aborts, a TypeError for network failures, etc.), preserved for debugging. */
  cause: unknown;
  /** Whether retrying this exact request might succeed (true for timeouts and network failures; false otherwise). */
  retryable: boolean;
}
