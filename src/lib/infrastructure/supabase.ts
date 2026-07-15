// Atlas Infrastructure — Database (Supabase).
//
// Atlas's canonical Supabase client already exists at
// `src/integrations/supabase/client.ts` — created during the Page
// Repository sprint, following this project's Lovable-generated-app
// convention for where a Supabase client lives, and confirmed (by
// inspecting the repository) to be the only `createClient()` call
// anywhere in Atlas.
//
// Per this Infrastructure Layer's own rule — "if a shared client already
// exists, reuse it; do not create another" — this file does NOT call
// `createClient()` a second time. It re-exports that one client so that
// code written against the Infrastructure Layer's expected structure
// (`@/lib/infrastructure/supabase`) and code written against the
// client's original location (`@/integrations/supabase/client`, e.g.
// `page-service.ts`) are guaranteed to resolve to the exact same object.
// There is, and must remain, only ONE Supabase client in this codebase.
//
// Do not add a second `createClient()` call anywhere in Atlas. If a
// future module needs Supabase, import `supabase` from here or from
// `@/integrations/supabase/client` directly — both are the same
// instance.
export { supabase } from "@/integrations/supabase/client";
