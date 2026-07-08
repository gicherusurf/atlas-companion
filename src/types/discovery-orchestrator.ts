// TODO: once a real persistence layer exists (see "persistResults" stage),
// verify these shapes still line up with whatever gets stored for a
// discovery run, and align via `supabase gen types typescript` if so.

/**
 * The six stages of the Website Discovery pipeline, in execution order.
 */
export type DiscoveryStageName =
  | "reachability"
  | "robots"
  | "sitemap"
  | "pageDiscovery"
  | "homepageMetadata"
  | "persistResults";

export type DiscoveryStageStatus = "pending" | "running" | "success" | "failed" | "skipped";

/**
 * The result of a single pipeline stage. `data` is intentionally untyped
 * here (each stage's real payload is the corresponding websiteDiscoveryService
 * return type) so this stays a generic envelope the orchestrator can log,
 * persist, and reason about uniformly.
 */
export interface DiscoveryStageResult {
  stage: DiscoveryStageName;
  status: DiscoveryStageStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  data: unknown | null;
  error: string | null;
}

export type DiscoveryRunStatus = "success" | "partial" | "failed";

/**
 * A hint for what the caller (UI, scheduler, etc.) should do next given how
 * the run went. Deliberately coarse-grained for now.
 */
export type NextRecommendedAction =
  | "none"
  | "check_website_reachability"
  | "check_robots_txt"
  | "check_sitemap"
  | "retry_page_discovery"
  | "review_homepage_metadata"
  | "retry_persist_results";

export interface DiscoveryRunResult {
  businessId: string;
  status: DiscoveryRunStatus;
  stages: DiscoveryStageResult[];
  completedStages: DiscoveryStageName[];
  failedStage: DiscoveryStageName | null;
  durationMs: number;
  nextRecommendedAction: NextRecommendedAction;
  startedAt: string;
  completedAt: string;
}
