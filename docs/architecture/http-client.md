# Atlas HTTP Client

## Purpose

The Atlas HTTP Client (`atlasHttp`) is the single networking layer every
Atlas department and service is meant to use. No module should call
`fetch()` directly once migrated to it — `website-discovery-service.ts`
is the first consumer, refactored in the same sprint this client was
introduced.

Centralizing networking this way means timeout behavior, default
headers, redirect handling, timing, and error normalization are defined
**once**, correctly, and every current and future caller inherits them
for free — rather than each service reimplementing (and potentially
getting slightly wrong) its own `fetch()` wrapper, the way
`website-discovery-service.ts` briefly did before this client existed.

## Architecture

`atlasHttp` is a Kernel-level module, alongside Job Manager and the Event
Bus: it has zero imports from any department, and no department should
ever need to reach around it to call `fetch()` itself.

Two files:

- **`src/types/http.ts`** — `HttpMethod`, `HttpRequest`, `HttpResponse<T>`,
  `HttpError`.
- **`src/lib/http-client.ts`** — the `atlasHttp` object
  (`request`/`get`/`post`/`put`/`patch`/`delete`/`head`) plus five small,
  independent internal helpers: `mergeHeaders`, `buildRequest`,
  `performFetch`, `measureDuration`, `normalizeError` (plus two minor
  supporting ones, `headersToRecord` and `parseBody`, needed to shape the
  response but not significant enough to warrant their own top-level
  design discussion).

`request()` is the one real implementation; `get`, `post`, `put`,
`patch`, `delete`, and `head` are thin wrappers that just fix the
`method` (and, where relevant, `body`) before calling it — no duplicated
logic between them.

## Request Lifecycle

1. A caller builds an `HttpRequest` (directly, or via `get()`/`post()`/
   etc.).
2. `buildRequest()` merges the caller's headers over Atlas's defaults
   (`accept: */*`, `user-agent: Atlas/0.3`) and serializes `body` (a
   string is sent as-is; anything else is JSON-encoded, with a
   `content-type: application/json` header added unless the caller
   already set one).
3. `performFetch()` issues the actual `fetch()` call, racing it against
   an `AbortController` timeout.
4. On success, the response's headers are flattened to a plain object
   (`headersToRecord()`), and its body is read and — if `content-type`
   says JSON — parsed (`parseBody()`).
5. The caller receives a fully-formed `HttpResponse<T>`: `ok`, `status`,
   `statusText`, the final `url` (after redirects), `headers`, `body`,
   and `durationMs`.

## Error Handling

`atlasHttp` draws a firm line between two categories of "the request
didn't go well," and callers are expected to handle them differently:

- **The server responded, just not successfully** (a 404, a 500, etc.).
  This is **not** an error as far as `atlasHttp` is concerned — it
  resolves normally with `HttpResponse.ok: false` and a real `status`
  code. The caller decides what a non-2xx status means for its own
  purposes.
- **The request never completed at all** — DNS failure, no network,
  CORS rejection, or a timeout. This **is** treated as an error:
  `atlasHttp` throws a structured `HttpError` (`message`, `status: null`,
  `url`, `cause`, `retryable`). The raw `TypeError` or `DOMException`
  Fetch would have thrown is captured in `cause` for debugging, but never
  propagated directly — this is what "never expose raw fetch exceptions"
  means in practice. Consumers (like `website-discovery-service.ts`) are
  expected to narrow a caught exception with a type guard (e.g.
  `isHttpError()`) before treating it as an expected "unreachable"
  outcome, rather than assuming every thrown value is one of these.

## Timeout Strategy

Every request has a timeout, enforced with a real `AbortController` (not
just a `Promise.race`, which wouldn't actually cancel the in-flight
`fetch()`). The default is **10,000ms** (`DEFAULT_TIMEOUT_MS`), overridable
per-request via `HttpRequest.timeoutMs`. A timeout firing aborts the
underlying request and surfaces as an `HttpError` with `message:
"Request timed out"` and `retryable: true`.

## Future Retry Strategy

`HttpError.retryable` already exists specifically so a future retry layer
has a real signal to act on — it doesn't need to itself decide whether a
given exception is worth retrying, since `normalizeError()` has already
made that call (network failures and timeouts: `retryable: true`;
anything else: `retryable: false`). The intended integration point is a
thin wrapper around `atlasHttp.request()` — not a rewrite of it — that
catches an `HttpError`, checks `.retryable`, and re-issues the same
`HttpRequest` with backoff, up to some configured attempt limit. None of
that exists yet; today, a retryable failure simply throws once.

## Future Rate Limiting

No rate limiting exists yet. The intended integration point is
`buildRequest()` or a new pre-flight step in `request()` — before calling
`performFetch()`, a future rate limiter could check (and, if needed,
queue/delay) the outgoing request based on its target host or the
calling module's own budget. Because every Atlas HTTP call is already
funneled through this one `request()` method, adding rate limiting later
touches this one file, not every caller.

## Future Edge Functions

The `TODO(edge-function)` comments throughout
`website-discovery-service.ts` mark exactly where this applies to that
consumer, but the underlying need is general: Atlas runs in the browser,
so any target site without permissive CORS headers is unreachable via a
direct client-side `fetch()`, regardless of how well `atlasHttp` itself
is built. The intended fix is a Supabase Edge Function (or equivalent)
that performs the actual request server-side and returns a clean result
— at which point, callers change is which **URL** they pass to
`atlasHttp.get()` (pointing at the edge function instead of the target
site directly), not their calling code's shape. `atlasHttp` itself may
eventually also run server-side inside such a function, using the same
`request()`/`buildRequest()`/`normalizeError()` logic unchanged.

## Future Authentication

No authentication support exists yet. `HttpRequest.headers` already
provides the seam for it — a caller (or a future thin wrapper analogous
to a "retrying client") could merge in an `authorization` header before
calling `atlasHttp.request()`. A more centralized future approach might
add an optional credentials/auth-provider concept to `buildRequest()`
itself, so authenticated requests to Atlas's own future API (per the
"API" enterprise feature in `docs/vision/atlas-platform-v2.md`) don't
require every caller to manually attach a token. Neither approach is
implemented yet.
