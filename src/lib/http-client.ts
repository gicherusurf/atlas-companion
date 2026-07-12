import type { HttpMethod, HttpRequest, HttpResponse, HttpError } from "@/types/http";

// Atlas HTTP Client.
//
// The single networking layer every Atlas department and service is
// meant to use — no module should call `fetch()` directly once migrated
// (see `website-discovery-service.ts` for the first consumer). This file
// has no knowledge of what any caller is fetching or why; it only
// standardizes how HTTP requests are made, timed, and reported.
//
// Behavior, per module requirements:
//   - every request measures its own execution time (`durationMs`)
//   - every request supports a timeout via AbortController
//   - redirects are followed by default, but callers can opt out
//   - errors are normalized: a raw fetch exception (TypeError, abort
//     DOMException) never reaches a caller — it's always converted to a
//     structured `HttpError` first
//   - callers get an `HttpResponse<T>`, never a raw `Response`
//
// Architecture: this is a Kernel-level module (alongside Job Manager and
// the Event Bus) — it has zero imports from any department, and no
// department should ever need to reach around it to call `fetch()`
// itself.

const DEFAULT_TIMEOUT_MS = 10_000;

const DEFAULT_HEADERS: Record<string, string> = {
  accept: "*/*",
  "user-agent": "Atlas/0.3",
};

// --- Internal helpers ----------------------------------------------------
// Small and independent on purpose, per "small helper functions, no
// duplicate logic" — each does exactly one thing and is usable in
// isolation.

/**
 * Merges header sets left-to-right (later sets win on conflicting keys),
 * normalizing every key to lowercase since HTTP header names are
 * case-insensitive — this avoids ending up with both a `Content-Type`
 * and a `content-type` entry after merging caller-supplied headers with
 * Atlas's defaults.
 */
function mergeHeaders(...headerSets: Array<Record<string, string> | undefined>): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const set of headerSets) {
    if (!set) continue;
    for (const [key, value] of Object.entries(set)) {
      merged[key.toLowerCase()] = value;
    }
  }
  return merged;
}

/**
 * Turns an `HttpRequest` into what `fetch()` actually needs: merged
 * headers (defaults + caller overrides), a serialized body (JSON-encoded
 * unless the caller already passed a string), and the right
 * `redirect`/`cache` options. Returns the request's own `url` alongside,
 * so callers of `buildRequest()` have everything in one place.
 */
function buildRequest(request: HttpRequest): { url: string; init: RequestInit } {
  const headers = mergeHeaders(DEFAULT_HEADERS, request.headers);

  let body: BodyInit | undefined;
  if (request.body !== undefined && request.body !== null) {
    if (typeof request.body === "string") {
      body = request.body;
    } else {
      body = JSON.stringify(request.body);
      if (!headers["content-type"]) {
        headers["content-type"] = "application/json";
      }
    }
  }

  return {
    url: request.url,
    init: {
      method: request.method,
      headers,
      body,
      redirect: request.followRedirects === false ? "manual" : "follow",
      cache: request.cache,
    },
  };
}

/**
 * Performs the actual `fetch()` call with a timeout enforced via
 * `AbortController` — the only place in this file that touches the raw
 * Fetch API directly. Rejects (with the raw abort/network exception) if
 * the request doesn't complete in time or fails outright; callers are
 * expected to pass that rejection through `normalizeError()` rather than
 * let it propagate as-is.
 */
async function performFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Elapsed milliseconds since `startedAt` (a `performance.now()`
 * timestamp), rounded to the nearest whole millisecond.
 */
function measureDuration(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

/**
 * Converts any exception `performFetch()` can throw into a structured
 * `HttpError` — this is the boundary that guarantees "never expose raw
 * fetch exceptions." An aborted request (our own timeout firing) and a
 * generic network failure (`TypeError`, e.g. DNS failure or a CORS
 * rejection) are both marked `retryable: true`; anything else is treated
 * as `retryable: false` rather than assumed safe to retry.
 */
function normalizeError(err: unknown, url: string): HttpError {
  if (err instanceof DOMException && err.name === "AbortError") {
    return { message: "Request timed out", status: null, url, cause: err, retryable: true };
  }
  if (err instanceof TypeError) {
    return {
      message: err.message || "Network request failed",
      status: null,
      url,
      cause: err,
      retryable: true,
    };
  }
  return {
    message: err instanceof Error ? err.message : String(err),
    status: null,
    url,
    cause: err,
    retryable: false,
  };
}

/**
 * Flattens a Fetch `Headers` object into a plain, lowercase-keyed record
 * — the shape `HttpResponse.headers` is documented to have.
 */
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key.toLowerCase()] = value;
  });
  return record;
}

/**
 * Reads a response body as text, then attempts a JSON parse only if the
 * response's `content-type` says it's JSON — otherwise returns the raw
 * text. Returns `null` for an empty body (e.g. HEAD requests, 204s).
 */
async function parseBody<T>(response: Response, headers: Record<string, string>): Promise<T | null> {
  const text = await response.text().catch(() => "");
  if (!text) return null;

  if ((headers["content-type"] ?? "").includes("application/json")) {
    try {
      return JSON.parse(text) as T;
    } catch {
      // Malformed JSON from the server — fall back to raw text rather
      // than throwing, since a parse failure here is a server-content
      // problem, not a networking failure.
      return text as unknown as T;
    }
  }

  return text as unknown as T;
}

export const atlasHttp = {
  /**
   * Performs an HTTP request per Atlas's standard behavior: default
   * timeout/headers, redirect handling, timing, and normalized errors.
   * Every other method on `atlasHttp` (`get`, `post`, etc.) is a thin
   * convenience wrapper around this one.
   */
  async request<T = unknown>(httpRequest: HttpRequest): Promise<HttpResponse<T>> {
    const startedAt = performance.now();
    const { url, init } = buildRequest(httpRequest);
    const timeoutMs = httpRequest.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    let response: Response;
    try {
      response = await performFetch(url, init, timeoutMs);
    } catch (err) {
      throw normalizeError(err, url);
    }

    const headers = headersToRecord(response.headers);
    const body = await parseBody<T>(response, headers);

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: response.url || url,
      headers,
      body,
      durationMs: measureDuration(startedAt),
    };
  },

  async get<T = unknown>(
    url: string,
    options?: Partial<Omit<HttpRequest, "url" | "method" | "body">>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: "GET" });
  },

  async post<T = unknown>(
    url: string,
    body?: unknown,
    options?: Partial<Omit<HttpRequest, "url" | "method" | "body">>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: "POST", body });
  },

  async put<T = unknown>(
    url: string,
    body?: unknown,
    options?: Partial<Omit<HttpRequest, "url" | "method" | "body">>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: "PUT", body });
  },

  async patch<T = unknown>(
    url: string,
    body?: unknown,
    options?: Partial<Omit<HttpRequest, "url" | "method" | "body">>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: "PATCH", body });
  },

  async delete<T = unknown>(
    url: string,
    options?: Partial<Omit<HttpRequest, "url" | "method" | "body">>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: "DELETE" });
  },

  async head(
    url: string,
    options?: Partial<Omit<HttpRequest, "url" | "method" | "body">>,
  ): Promise<HttpResponse<null>> {
    return this.request<null>({ ...options, url, method: "HEAD" });
  },
};

// Re-exported for consumers that want to type a variable as an
// HttpMethod without a separate import from `@/types/http`.
export type { HttpMethod };
