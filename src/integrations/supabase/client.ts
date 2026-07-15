import { createClient } from "@supabase/supabase-js";
import { config } from "@/lib/infrastructure/config";

// Atlas's canonical Supabase client.
//
// This is the ONLY Supabase client Atlas should ever create. Every
// service that needs Supabase — Page Repository today; Business Service,
// Job Manager, the Insight Engine, the Rule Engine, and others in the
// future, once their own TODO(supabase) markers are implemented — must
// import `supabase` from this file (or from the Infrastructure Layer's
// `@/lib/infrastructure/supabase`, which re-exports this exact instance)
// rather than calling `createClient()` again elsewhere. Do not create a
// second client.
//
// PROVENANCE: this file did not exist anywhere in the repository prior
// to Page Repository's production implementation, which made a real
// client a hard requirement — this was verified by inspecting every file
// visible in this conversation, not assumed. Location follows this
// project's established convention for a Lovable-generated Vite +
// Supabase app (`src/integrations/supabase/`, confirmed via this repo's
// own AGENTS.md). The Atlas Infrastructure Layer
// (`src/lib/infrastructure/`) later reused this same client rather than
// creating a second one — see `src/lib/infrastructure/supabase.ts`'s own
// comment for why it's a re-export, not a new `createClient()` call.
//
// Configuration (the Supabase URL and anon key) is owned by
// `src/lib/infrastructure/config.ts`, not read directly here — that's
// the one place in Atlas that reads `import.meta.env`, and it throws a
// clear `ConfigurationError` at load time if either value is missing,
// rather than this file silently falling back to an empty string.
export const supabase = createClient(config.supabase.url, config.supabase.anonKey);
