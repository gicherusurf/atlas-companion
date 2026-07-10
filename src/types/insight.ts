// TODO(supabase): once a real persistence layer exists, align this shape
// with the DB schema (e.g. via `supabase gen types typescript`) instead
// of hand-maintaining it.

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
  category: InsightCategory;
  severity: InsightSeverity;
  status: InsightStatus;
  source: InsightSource;
  /** The Page (see `src/types/page.ts`) this insight relates to, if any. */
  pageId?: string;
  /** The KnowledgeEntity (see `src/types/knowledge.ts`) this insight relates to, if any. */
  entityId?: string;
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
 * Optional filters for listInsights().
 */
export interface ListInsightsFilter {
  category?: InsightCategory;
  severity?: InsightSeverity;
  status?: InsightStatus;
  source?: InsightSource;
}
