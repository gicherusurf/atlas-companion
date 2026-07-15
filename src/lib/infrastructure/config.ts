import { ConfigurationError } from "@/lib/infrastructure/errors";

// Atlas Infrastructure — Configuration.
//
// Reads every environment variable Atlas needs exactly ONCE, at module
// load, into one strongly typed `config` object — no other file should
// read `import.meta.env` directly (that's what "no duplicated utilities"
// means here: one place owns environment access, everything else
// consumes the typed result).
//
// Required variables throw a clear `ConfigurationError` immediately on
// load if missing, rather than failing confusingly deep inside whatever
// service first happens to touch them.

export type AtlasEnvironment = "development" | "staging" | "production";

export interface AtlasConfig {
  environment: AtlasEnvironment;
  supabase: {
    url: string;
    anonKey: string;
  };
}

function readEnv(key: string): string | undefined {
  const value = (import.meta.env as unknown as Record<string, string | undefined>)[key];
  return value && value.length > 0 ? value : undefined;
}

function requireEnv(key: string): string {
  const value = readEnv(key);
  if (!value) {
    throw new ConfigurationError(`Missing required environment variable: ${key}`, { key });
  }
  return value;
}

function resolveEnvironment(): AtlasEnvironment {
  // Vite sets `import.meta.env.MODE` automatically (e.g. "development" in
  // `vite dev`, "production" in `vite build`). "staging" is expected to
  // come from a custom Vite mode (`vite build --mode staging`) once one
  // is configured — falling back to "development" for anything else
  // keeps this from throwing over an unrecognized mode string.
  const mode = import.meta.env.MODE;
  if (mode === "production") return "production";
  if (mode === "staging") return "staging";
  return "development";
}

/**
 * Atlas's one, validated, typed configuration object. Read once at
 * module load — if a required variable is missing, this throws
 * immediately (a clear startup error) rather than letting some
 * downstream service fail confusingly later.
 */
export const config: AtlasConfig = {
  environment: resolveEnvironment(),
  supabase: {
    url: requireEnv("VITE_SUPABASE_URL"),
    anonKey: requireEnv("VITE_SUPABASE_ANON_KEY"),
  },
};

// --- Future extensibility -------------------------------------------------
//
// Future feature flags: expected to live as an additional
// `config.features` object (e.g. `{ enableSeoAudit: boolean }`), read
// from env vars or a remote config service the same way `supabase` is
// read above — not scattered as ad-hoc `import.meta.env.VITE_FF_X` reads
// throughout the codebase.
//
// Future multiple environments: `AtlasEnvironment` already anticipates
// "staging" as a distinct environment from "development"/"production" —
// once a staging Vite mode and corresponding env vars exist, no change
// to this file's shape is needed, only to `resolveEnvironment()`'s mode
// detection and whichever env vars differ per environment.
//
// Future runtime configuration: today, `config` is entirely static once
// read (module load time, from build-time-injected Vite env vars). A
// future revision might support runtime-refreshable configuration (e.g.
// polling a remote config endpoint via `atlasHttp`) for values that
// should change without a redeploy — that would live alongside this
// static `config` object, not replace it, since Supabase credentials
// will always need to be known before a single request can be made.
