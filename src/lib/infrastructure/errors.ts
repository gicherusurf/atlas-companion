// Atlas Infrastructure — Error Helpers.
//
// A small, shared error hierarchy every Atlas module can throw and catch
// consistently, instead of each module inventing its own ad-hoc `Error`
// subclass or throwing plain strings. Every Atlas error carries a
// `message` (human-readable), a `code` (machine-readable, stable
// identifier — useful for logging/telemetry/client-side handling), and
// `details` (arbitrary structured context).
//
// This file has no imports — it's the base of the Infrastructure Layer's
// dependency graph, not a consumer of anything else in it.

export type AtlasErrorDetails = Record<string, unknown>;

/**
 * The base class every other Atlas error extends. Prefer one of the more
 * specific subclasses below where it fits; fall back to `AtlasError`
 * itself only when none of them apply.
 */
export class AtlasError extends Error {
  readonly code: string;
  readonly details: AtlasErrorDetails;

  constructor(message: string, code: string, details: AtlasErrorDetails = {}) {
    super(message);
    this.name = "AtlasError";
    this.code = code;
    this.details = details;
    // Restores the correct prototype chain when compiling to targets
    // where extending built-in Error otherwise breaks `instanceof`.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A database/storage operation failed (Supabase, or any future persistence backend). */
export class PersistenceError extends AtlasError {
  constructor(message: string, details: AtlasErrorDetails = {}) {
    super(message, "PERSISTENCE_ERROR", details);
    this.name = "PersistenceError";
  }
}

/** An HTTP request failed outright (network failure, timeout, CORS) — mirrors `HttpError` in `src/types/http.ts`. */
export class NetworkError extends AtlasError {
  constructor(message: string, details: AtlasErrorDetails = {}) {
    super(message, "NETWORK_ERROR", details);
    this.name = "NetworkError";
  }
}

/** Input failed validation before an operation was attempted. */
export class ValidationError extends AtlasError {
  constructor(message: string, details: AtlasErrorDetails = {}) {
    super(message, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

/** Required configuration (an environment variable, a setting) was missing or invalid at startup. */
export class ConfigurationError extends AtlasError {
  constructor(message: string, details: AtlasErrorDetails = {}) {
    super(message, "CONFIGURATION_ERROR", details);
    this.name = "ConfigurationError";
  }
}
