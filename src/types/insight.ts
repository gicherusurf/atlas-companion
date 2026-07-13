import type { RuleResult } from "@/types/rule";

// TODO(supabase): once a real persistence layer exists, align this shape
// with the DB schema (e.g. via `supabase gen types typescript`) instead
// of hand-maintaining it.
//
// EVOLUTION NOTE: this file originally supported creating insights only
// from a fully-formed `CreateInsightInput`. This revision adds the
// ability to generate an `Insight` directly from a `RuleResult` (see
// `RuleResultInsightContext`, `ruleResultToInsight()` in
// `insight-engine.ts`) as a purely additive capability — every v1 field
// and type here is unchanged in meaning. See
// docs/architecture/insight-engine.md for the full writeup.

export type InsightSeverity = "info" | "low" | "medium" | "high" | "critical";

/**
 * Which area of the business an insight relates to. Mirrors the spirit of
 * `EventCategory` in `src/types/event.ts`, but for insights rather than
 * events.
 */
export type InsightCategory =
  | "BUSINESS"
  | "WEBSITE"
  | "DISCOVERY"
  | "CRAWL"
  | "SEO"
  | "CONTENT"
  | "MARKETING"
  | "SALES"
  | "FINANCE"
  | "KNOWLEDGE"
  | "SYSTEM";

export type InsightStatus = "new" | "acknowledged" | "resolved" | "dismissed";

/**
 * The Atlas module that produced an insight. Extend this union as new
 * departments are introduced.
 */
export type InsightSource =
  | "BusinessService"
  | "WebsiteDiscovery"
  | "DiscoveryOrchestrator"
  | "CrawlEngine"
  | "PageRepository"
  | "MetadataExtractor"
  | "KnowledgeGraph"
  | "SeoAudit"
  | "ContentEngine"
  | "MarketingEngine"
  | "FinanceEngine"
  | "MissionControl";

/**
 * A standardized business insight: a conclusion some Atlas module has
 * reached, along with a recommendation, ready for Mission Control (or any
 * other consumer) to display uniformly regardless of which department
 * produced it.
 *
 * The Insight Engine only stores and retrieves insights — it never
 * decides *how* an engine reaches a conclusion. Deciding what counts as
 * "high severity" or what the recommendation should say is entirely the
 * producing module's responsibility (SEO Audit, Marketing Engine, Finance
 * Engine, etc.); this type just standardizes the shape they all report in.
 */
export interface Insight {
  id: string;
  businessId: string;
  title: string;
  description: string;
  /** NEW: an optional shorter render of the insight, for compact display contexts (e.g. Mission Control cards). Falls back to `title` if not supplied. */
  summary?: string;
  category: InsightCategory;
  severity: InsightSeverity;
  status: InsightStatus;
  source: InsightSource;
  /** NEW: the Rule (see `src/types/rule.ts`) whose RuleResult produced this insight, if any. */
  ruleId?: string;
  /** The Page (see `src/types/page.ts`) this insight relates to, if any. */
  pageId?: string;
  /** The KnowledgeEntity (see `src/types/knowledge.ts`) this insight relates to, if any. */
  entityId?: string;
  /** NEW: the Job (see `src/types/job.ts`) this insight was produced during, if any. */
  jobId?: string;
  recommendation: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields needed to create a new insight. `status` starts as `"new"`;
 * `id`, `createdAt`, and `updatedAt` are set by the service.
 */
export type CreateInsightInput = Omit<Insight, "id" | "status" | "createdAt" | "updatedAt">;

/**
 * Fields that can be patched on an existing insight. NEW method
 * (`updateInsight`) — identity (`id`/`businessId`) and timestamps are not
 * patchable this way; status transitions have their own dedicated
 * methods (`resolveInsight`, `dismissInsight`) rather than going through
 * this generic patch.
 */
export type UpdateInsightInput = Partial<
  Omit<Insight, "id" | "businessId" | "status" | "createdAt" | "updatedAt">
>;

/**
 * Optional filters for listInsights().
 */
export interface ListInsightsFilter {
  category?: InsightCategory;
  severity?: InsightSeverity;
  status?: InsightStatus;
  source?: InsightSource;
}

/**
 * NEW: the context a caller must supply alongside a `RuleResult` to
 * generate a complete `Insight` from it. A `RuleResult` alone doesn't
 * carry a `businessId`, `category`, or `source` — those are supplied by
 * whichever department is doing the evaluation, which is also what keeps
 * the transformation itself free of department-specific knowledge: the
 * Insight Engine never decides "this is an SEO thing," the caller does,
 * by passing `category: "SEO"` (etc.) in this context.
 */
export interface RuleResultInsightContext {
  businessId: string;
  category: InsightCategory;
  source: InsightSource;
  pageId?: string;
  jobId?: string;
}

/**
 * NEW: a rollup of insight counts, e.g. for a Mission Control summary
 * card. Severity buckets reconcile this summary's four-bucket vocabulary
 * (`critical`/`errors`/`warnings`/`info`) with `InsightSeverity`'s five
 * values, without changing `InsightSeverity` itself — see
 * `summarizeInsights()` in `insight-engine.ts` for the exact mapping.
 */
export interface InsightSummary {
  total: number;
  critical: number;
  errors: number;
  warnings: number;
  info: number;
  resolved: number;
}

// Re-exported so consumers of `ruleResultToInsight()` don't need a
// separate import from `@/types/rule` just to reference the parameter
// type.
export type { RuleResult };
