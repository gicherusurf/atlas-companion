import type {
  Insight,
  CreateInsightInput,
  UpdateInsightInput,
  ListInsightsFilter,
  RuleResultInsightContext,
  InsightSummary,
} from "@/types/insight";
import type { RuleResult } from "@/types/rule";

// Atlas Insight Engine.
//
// Atlas's reasoning-output layer: it converts facts already established
// elsewhere in Atlas into standardized Insight objects. It does NOT
// evaluate rules, does NOT inspect pages, does NOT crawl, and does NOT
// generate AI responses — it only stores/retrieves conclusions, and
// transforms a Rule Engine `RuleResult` into an `Insight` using entirely
// generic language. It has no SEO-specific (or any department-specific)
// wording anywhere in this file.
//
// EVOLUTION: this file originally supported creating insights only from
// a fully-formed `CreateInsightInput` (i.e. a caller already knew the
// title/description/category/etc. it wanted). This revision adds the
// ability to generate an insight directly from a `RuleResult`:
//   - `ruleResultToInsight()`, a new, isolated, pure transformation
//     helper (RuleResult + context -> CreateInsightInput)
//   - `createInsight()` gains a second overload accepting
//     `(ruleResult, context)` in addition to its original
//     `(input: CreateInsightInput)` signature — existing callers are
//     completely unaffected
//   - `createInsights()`, a new batch method (RuleResult[] -> Insight[])
//   - `summarizeInsights()`, a new, real (non-stub) pure aggregation
//     function
//   - `updateInsight()`, a new generic patch method
// Every v1 method, field, and behavior is unchanged — see
// docs/architecture/insight-engine.md for the full writeup of this
// evolution.
//
// Design principle: the Insight Engine never decides HOW an engine reaches
// a conclusion — severity, category, and recommendation are entirely the
// producing module's call. This engine only standardizes storage and
// retrieval of whatever conclusion it's given, and (new) the mechanical
// transformation of a RuleResult into that standardized shape.
//
// Architecture: this file depends on nothing but its own types
// (`src/types/insight.ts`) and the `RuleResult` type it transforms
// (`src/types/rule.ts` — a type-only import, not a dependency on the Rule
// Engine's actual evaluation logic). It must never import from SEO,
// Marketing, Finance, the Crawler, Mission Control, or Knowledge Graph
// modules — those modules will depend on the Insight Engine, never the
// reverse.
//
// Follows the same architecture as the other Atlas services: a plain
// object of methods (no class), every method scoped by `businessId`, no
// mock data, `TODO(supabase)` markers instead of real persistence. Read
// methods return `[]`/`null` rather than throwing; write methods throw.

function notImplemented(action: string): never {
  throw new Error(`InsightEngine.${action} is not implemented yet — TODO(supabase): wire this up.`);
}

/**
 * Distinguishes a `RuleResult` from a `CreateInsightInput` at the one
 * call site (`createInsight()`) that accepts either. `RuleResult` is the
 * only one of the two shapes with both a `passed` boolean and an
 * `evaluatedAt` timestamp, so checking for those is an unambiguous,
 * dependency-free discriminator.
 */
function isRuleResult(input: CreateInsightInput | RuleResult): input is RuleResult {
  return typeof (input as RuleResult).passed === "boolean" && "evaluatedAt" in input;
}

/**
 * Transforms a Rule Engine `RuleResult` into a `CreateInsightInput`,
 * using entirely generic language derived from the result itself — this
 * function has no idea what department produced the underlying rule, and
 * must stay that way. `context` supplies the business/category/source
 * information a bare `RuleResult` doesn't carry (see
 * `RuleResultInsightContext` in `src/types/insight.ts` for why).
 *
 * Kept isolated and exported (rather than inlined into `createInsight`)
 * specifically so this transformation logic has exactly one place it
 * lives, and can be reused directly by `createInsights()` without
 * duplicating it.
 */
export function ruleResultToInsight(
  ruleResult: RuleResult,
  context: RuleResultInsightContext,
): CreateInsightInput {
  // RuleResult.message is already a generic, human-readable sentence
  // (built by the Rule Engine's own buildMessage()) in the shape
  // "{rule name} {passed|failed}: ...". Splitting on the first colon
  // gives a short, generic title without this engine needing to know
  // anything about what the rule was actually checking.
  const title = ruleResult.message.split(":")[0]?.trim() || ruleResult.message;

  return {
    businessId: context.businessId,
    category: context.category,
    source: context.source,
    severity: ruleResult.severity,
    title,
    summary: title,
    description: ruleResult.message,
    recommendation: ruleResult.recommendation,
    ruleId: ruleResult.ruleId,
    pageId: context.pageId,
    jobId: context.jobId,
    metadata: {
      actualValue: ruleResult.actualValue,
      expectedValue: ruleResult.expectedValue,
      matchedConditions: ruleResult.matchedConditions,
      executionTimeMs: ruleResult.executionTimeMs,
    },
  };
}

/**
 * Records a new insight, from either a fully-formed `CreateInsightInput`
 * (v1 usage, unchanged) or a `RuleResult` plus the context needed to
 * complete it (new usage). `status` starts as `"new"` either way.
 *
 * Declared as a standalone overloaded function (object literal method
 * shorthand doesn't support overload signatures) and assigned onto
 * `insightEngine.createInsight` below.
 */
async function createInsight(input: CreateInsightInput): Promise<Insight>;
async function createInsight(ruleResult: RuleResult, context: RuleResultInsightContext): Promise<Insight>;
async function createInsight(
  input: CreateInsightInput | RuleResult,
  context?: RuleResultInsightContext,
): Promise<Insight> {
  const resolvedInput: CreateInsightInput = isRuleResult(input)
    ? ruleResultToInsight(input, context as RuleResultInsightContext)
    : input;

  // TODO(supabase): supabase.from("insights").insert({
  //   ...resolvedInput,
  //   status: "new",
  // }).select().single()
  return notImplemented("createInsight");
}

export const insightEngine = {
  createInsight,

  /**
   * NEW: records one insight per RuleResult in one call — the batch
   * counterpart to `createInsight(ruleResult, context)`. All insights
   * share the same `context` (one business, one category/source per
   * call); evaluate rules across multiple categories separately if
   * needed.
   */
  async createInsights(ruleResults: RuleResult[], context: RuleResultInsightContext): Promise<Insight[]> {
    return Promise.all(ruleResults.map((ruleResult) => this.createInsight(ruleResult, context)));
  },

  /**
   * NEW: computes a rollup of insight counts. Pure and synchronous (like
   * the Rule Engine's `evaluateRule`/`evaluateRules`) — it operates on
   * whatever `Insight[]` the caller supplies (e.g. the result of
   * `listInsights(businessId)`) rather than fetching internally, so it's
   * usable and testable without persistence.
   *
   * Severity bucket mapping (reconciling this summary's four buckets
   * with InsightSeverity's five values, without changing InsightSeverity
   * itself): `critical` -> "critical", `errors` -> "high", `warnings` ->
   * "medium" or "low", `info` -> "info". `resolved` counts by `status`,
   * independent of severity.
   */
  summarizeInsights(insights: Insight[]): InsightSummary {
    return {
      total: insights.length,
      critical: insights.filter((i) => i.severity === "critical").length,
      errors: insights.filter((i) => i.severity === "high").length,
      warnings: insights.filter((i) => i.severity === "medium" || i.severity === "low").length,
      info: insights.filter((i) => i.severity === "info").length,
      resolved: insights.filter((i) => i.status === "resolved").length,
    };
  },

  /**
   * Fetches a single insight by id, scoped to the business it belongs to.
   */
  async getInsight(_businessId: string, _insightId: string): Promise<Insight | null> {
    // TODO(supabase): supabase.from("insights").select("*")
    //   .eq("id", insightId).eq("business_id", businessId).maybeSingle()
    return null;
  },

  /**
   * Lists insights for a business, optionally filtered by category,
   * severity, status, or source.
   */
  async listInsights(_businessId: string, _filter?: ListInsightsFilter): Promise<Insight[]> {
    // TODO(supabase): supabase.from("insights").select("*")
    //   .eq("business_id", businessId)
    //   .match(filter ?? {})
    //   .order("created_at", { ascending: false })
    return [];
  },

  /**
   * Lists insights for a business within a single category.
   */
  async listInsightsByCategory(businessId: string, category: Insight["category"]): Promise<Insight[]> {
    // TODO(supabase): thin wrapper over listInsights — kept as its own
    // method since "list by category" is a common enough query pattern
    // (e.g. Mission Control's per-department sections) to warrant a
    // dedicated, self-documenting method name.
    return this.listInsights(businessId, { category });
  },

  /**
   * Lists every "critical" severity insight for a business, across all
   * categories.
   */
  async listCriticalInsights(businessId: string): Promise<Insight[]> {
    // TODO(supabase): thin wrapper over listInsights filtered to
    // severity: "critical" — kept as its own method since surfacing
    // critical insights is a first-class Mission Control concern.
    return this.listInsights(businessId, { severity: "critical" });
  },

  /**
   * Lists insights for a business that are still actionable — i.e. not
   * yet resolved or dismissed ("new" or "acknowledged").
   */
  async listOpenInsights(_businessId: string): Promise<Insight[]> {
    // TODO(supabase): supabase.from("insights").select("*")
    //   .eq("business_id", businessId)
    //   .in("status", ["new", "acknowledged"])
    //   .order("created_at", { ascending: false })
    //
    // Not implemented as a call to listInsights() with a single `status`
    // filter, since "open" spans two status values ("new" AND
    // "acknowledged") and ListInsightsFilter.status only accepts one.
    return [];
  },

  /**
   * NEW: patches non-status fields on an existing insight (e.g.
   * correcting a title, attaching a pageId after the fact). Status
   * transitions go through `resolveInsight`/`dismissInsight` instead.
   */
  async updateInsight(_businessId: string, _insightId: string, _input: UpdateInsightInput): Promise<Insight> {
    // TODO(supabase): supabase.from("insights").update(input)
    //   .eq("id", insightId).eq("business_id", businessId).select().single()
    return notImplemented("updateInsight");
  },

  /**
   * Marks an insight as resolved.
   */
  async resolveInsight(_businessId: string, _insightId: string): Promise<Insight> {
    // TODO(supabase): supabase.from("insights").update({ status: "resolved" })
    //   .eq("id", insightId).eq("business_id", businessId).select().single()
    return notImplemented("resolveInsight");
  },

  /**
   * Marks an insight as dismissed (acknowledged as not worth acting on).
   */
  async dismissInsight(_businessId: string, _insightId: string): Promise<Insight> {
    // TODO(supabase): supabase.from("insights").update({ status: "dismissed" })
    //   .eq("id", insightId).eq("business_id", businessId).select().single()
    return notImplemented("dismissInsight");
  },

  /**
   * Permanently deletes an insight record.
   */
  async deleteInsight(_businessId: string, _insightId: string): Promise<void> {
    // TODO(supabase): supabase.from("insights").delete()
    //   .eq("id", insightId).eq("business_id", businessId)
    return notImplemented("deleteInsight");
  },
};
