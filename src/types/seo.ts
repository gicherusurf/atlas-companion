// TODO(supabase): once a real persistence layer exists, align this shape
// with the DB schema (e.g. via `supabase gen types typescript`) instead
// of hand-maintaining it.

/**
 * The kind of SEO audit being run. `overall` aggregates every other type
 * into a single audit rather than representing a distinct check of its
 * own.
 */
export type SeoAuditType =
  | "technical"
  | "metadata"
  | "links"
  | "content"
  | "structure"
  | "performance"
  | "indexability"
  | "overall";

export type SeoAuditStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export type SeoIssueSeverity = "info" | "low" | "medium" | "high" | "critical";

/**
 * A single SEO problem found on a business (optionally, a specific page)
 * during an audit. An `SeoIssue` is the SEO Department's own record of a
 * finding — `ruleId` and `insightId` optionally link it back to the
 * `RuleResult` that detected it (`src/types/rule.ts`) and the standardized
 * `Insight` it was promoted into (`src/types/insight.ts`), once those
 * integrations exist.
 */
export interface SeoIssue {
  id: string;
  businessId: string;
  /** The Page (see `src/types/page.ts`) this issue was found on, if page-specific. */
  pageId?: string;
  auditType: SeoAuditType;
  severity: SeoIssueSeverity;
  title: string;
  description: string;
  recommendation: string;
  /** The Rule Engine rule (see `src/types/rule.ts`) that detected this issue, if any. */
  ruleId?: string;
  /** The Insight Engine insight (see `src/types/insight.ts`) this issue was promoted into, if any. */
  insightId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Aggregate counts for a single SeoAudit, summarizing its `issues` array
 * and how much of the business's page set was covered.
 */
export interface SeoAuditSummary {
  totalPages: number;
  pagesAudited: number;
  issuesFound: number;
  criticalIssues: number;
  warnings: number;
  passedChecks: number;
  failedChecks: number;
}

/**
 * A single SEO audit run for a business: its lifecycle status, every
 * issue it found, and a summary rollup of those issues.
 */
export interface SeoAudit {
  id: string;
  businessId: string;
  status: SeoAuditStatus;
  auditType: SeoAuditType;
  startedAt: string | null;
  completedAt: string | null;
  issues: SeoIssue[];
  summary: SeoAuditSummary;
}

/**
 * Fields needed to start a new audit. `id`, `status`, timestamps,
 * `issues`, and `summary` are set/computed by the service.
 */
export type RunAuditInput = {
  businessId: string;
  auditType: SeoAuditType;
};

/**
 * Optional filters for listAudits().
 */
export interface ListAuditsFilter {
  auditType?: SeoAuditType;
  status?: SeoAuditStatus;
}
