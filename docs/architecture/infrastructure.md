# Atlas Infrastructure Layer

## Purpose

The Infrastructure Layer is Atlas's shared foundation for configuration,
persistence, networking, logging, and error handling — the small set of
concerns every other module needs, none of which should be reimplemented
per-module. It contains no business logic and no domain knowledge: it
has zero imports from Mission Control, the Workflow Engine, any
Department, the Knowledge Graph, or Business DNA.

This layer's guiding rule, stated plainly: **there must only ever be one
of each shared resource.** One Supabase client. One HTTP client. One
configuration object. Every module reuses these; none creates its own.

## Directory Structure

```
src/lib/infrastructure/
    errors.ts      — AtlasError and its subclasses (no dependencies)
    config.ts       — typed, validated environment configuration
    supabase.ts     — re-exports Atlas's one Supabase client
    http.ts         — re-exports atlasHttp + safeGet/safePost wrappers
    logger.ts       — scoped logging (no dependencies)

src/integrations/supabase/
    client.ts       — Atlas's actual, one Supabase client (createClient call lives here)

supabase/migrations/
    ..._create_pages_table.sql
```

Dependency graph (no cycles): `errors.ts` and `logger.ts` depend on
nothing. `config.ts` depends only on `errors.ts`. `supabase.ts` re-exports
`@/integrations/supabase/client`, which depends on `config.ts`. `http.ts`
depends on `errors.ts` and the pre-existing `@/lib/http-client.ts`.

## Configuration

`config.ts` reads every environment variable Atlas needs exactly **once**,
at module load, into one typed `AtlasConfig` object — no other file
should read `import.meta.env` directly. A required variable that's
missing throws a `ConfigurationError` immediately at load time (a clear
startup failure), rather than letting some downstream service fail
confusingly the first time it happens to need that value. This was
verified concretely: a real (browser-executed) test confirmed
`config.ts` throws a properly-named, properly-messaged
`ConfigurationError` — naming the specific missing variable — when
`VITE_SUPABASE_URL` is absent.

`AtlasEnvironment` already distinguishes `"development"` /
`"staging"` / `"production"`, anticipating multiple environments before
any environment-specific behavior beyond Supabase credentials exists.
Feature flags and runtime-refreshable configuration are documented,
not yet implemented — see the "Future extensibility" comment block at
the bottom of `config.ts` itself for exactly where each would plug in.

## Supabase

**Atlas has exactly one Supabase client, and this task did not create a
second one.** Before this sprint, `src/integrations/supabase/client.ts`
already existed — created during the Page Repository sprint, which made
a real client a hard requirement, and confirmed (by inspecting every
file visible across this project's history) to be the only
`createClient()` call anywhere in the codebase.

`src/lib/infrastructure/supabase.ts` does not call `createClient()`
again — it re-exports that exact instance, so code written against
either import path (`@/lib/infrastructure/supabase` or
`@/integrations/supabase/client`, which `page-service.ts` already uses)
resolves to the same object. This was verified concretely, not just
asserted by comment: a real test imported both modules and confirmed
`supabaseInfraMod.supabase === clientMod.supabase` via strict object
identity.

`client.ts` itself was updated (its export shape unchanged) to read its
URL and anon key from `config.supabase` rather than reading
`import.meta.env` directly — eliminating what would otherwise have been
duplicated environment-reading logic between the client and the new
config layer.

**Do not add a second `createClient()` call anywhere in Atlas.** If a
future module needs Supabase, it imports `supabase` from one of these
two files.

## HTTP

Atlas already has a full HTTP Client (`src/lib/http-client.ts`,
`atlasHttp`) from an earlier sprint — timeout via a real
`AbortController`, JSON parsing, structured `HttpError`, and documented
seams for future retry/rate-limiting/Edge Function support (see
`docs/architecture/http-client.md`). `src/lib/infrastructure/http.ts`
does not reimplement any of that; it re-exports `atlasHttp` and adds
`safeGet`/`safePost` — two thin, never-throwing wrappers around
`atlasHttp.get`/`.post` for callers who prefer a
`{ ok, data, error }` result over `try`/`catch`. No networking logic of
its own lives in this file.

Verified concretely: a real local HTTP server was used to confirm
`safeGet`/`safePost` both succeed against a reachable endpoint (data
populated, error `null`) and fail gracefully — `ok: false`, a populated
`error`, never a thrown exception — against a genuinely unreachable host.

## Logging

`logger.ts` provides `debug`/`info`/`warn`/`error` methods with
consistent formatting (`[timestamp] [LEVEL] [scope] message`), plus
`createLogger(scope)` for module-scoped loggers (e.g.
`createLogger("PageService")`) so every log line self-identifies its
source without repeating the scope on every call. It has zero
dependencies, deliberately — logging must never be a reason some other
module fails to load. Every log line passes through one `emit()`
function, which is the single, explicit integration point documented
for future Sentry/OpenTelemetry/Cloud Logging support — verified to
never throw across all four levels and a scoped logger, in a real test.

## Errors

`errors.ts` defines `AtlasError` (the base class) and four subclasses —
`PersistenceError`, `NetworkError`, `ValidationError`,
`ConfigurationError` — each carrying `message`, `code` (a stable,
machine-readable identifier), and `details` (arbitrary structured
context). Verified concretely: each subclass's `instanceof` chain
(`instanceof AtlasError`, `instanceof Error`), `.name`, `.code`, and
`.details` were confirmed correct in a real test, not just asserted by
comment.

## Future Telemetry

`logger.ts`'s `emit()` function is the intended single integration point
for Sentry (error-level logs also calling `Sentry.captureException`),
OpenTelemetry (every log level also exporting a log record), or Cloud
Logging — a future revision touches that one function, not every call
site across Atlas.

## Future Authentication

No authentication layer exists yet. The natural extension point is
`config.ts` (an authenticated Supabase client needs the same
`config.supabase` values already centralized there) and `http.ts`'s
`RequestOptions` (which already accepts custom `headers`, the seam an
`authorization` header would attach through) — see
`docs/architecture/http-client.md`'s own "Future Authentication" section
for the same reasoning applied to `atlasHttp` directly, which `http.ts`
re-exports.
