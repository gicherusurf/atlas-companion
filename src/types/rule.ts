// TODO(supabase): once a real persistence layer exists, align this shape
// with the DB schema (e.g. via `supabase gen types typescript`) instead
// of hand-maintaining it.

/**
 * Which area of the business a rule relates to. Mirrors
 * `InsightCategory` (`src/types/insight.ts`) so a rule's category maps
 * directly onto the category of the insight it eventually produces.
 */
export type RuleCategory =
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

export type RuleSeverity = "info" | "low" | "medium" | "high" | "critical";

/**
 * Whether a rule is actively evaluated. `evaluateRules()` only evaluates
 * rules with status `"enabled"` — `"disabled"` and `"draft"` rules are
 * skipped.
 */
export type RuleStatus = "enabled" | "disabled" | "draft";

/**
 * The comparison a rule performs between a fact's actual value and the
 * rule's `expectedValue`. `exists` and `missing` ignore `expectedValue`
 * entirely — they only check whether the fact is present.
 */
export type RuleOperator =
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual"
  | "contains"
  | "notContains"
  | "exists"
  | "missing"
  | "regex";

/**
 * A reusable, business-agnostic rule definition: "check fact `field`
 * against `expectedValue` using `operator`." Rules are NOT scoped to a
 * single business — the same rule (e.g. "titleLength greaterThan 60") is
 * evaluated against whatever facts a caller supplies for whichever
 * business it's currently reasoning about. This is what "reusable
 * business rules" means: the rule is reusable, the facts are per-business.
 */
export interface Rule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  severity: RuleSeverity;
  status: RuleStatus;
  /** The key to read off the supplied facts object, e.g. "titleLength". */
  field: string;
  operator: RuleOperator;
  /** Ignored when `operator` is `exists` or `missing`. */
  expectedValue: unknown;
  recommendation: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type CreateRuleInput = Omit<Rule, "id" | "createdAt" | "updatedAt">;
export type UpdateRuleInput = Partial<Omit<Rule, "id" | "createdAt" | "updatedAt">>;

/**
 * Optional filters for listRules().
 */
export interface ListRulesFilter {
  category?: RuleCategory;
  status?: RuleStatus;
  severity?: RuleSeverity;
}

/**
 * The outcome of evaluating a single Rule against a set of facts.
 */
export interface RuleResult {
  ruleId: string;
  passed: boolean;
  severity: RuleSeverity;
  message: string;
  recommendation: string;
  actualValue: unknown;
  expectedValue: unknown;
  evaluatedAt: string;
}

/**
 * The aggregated outcome of evaluating a set of Rules against a
 * business's facts in one pass.
 */
export interface RuleEvaluation {
  businessId: string;
  /** Count of RuleResults where `passed` is true. */
  passed: number;
  /** Count of RuleResults where `passed` is false. */
  failed: number;
  /** Count of failed RuleResults whose severity is NOT "critical". */
  warnings: number;
  /** Count of failed RuleResults whose severity IS "critical". */
  critical: number;
  results: RuleResult[];
  evaluatedAt: string;
}

/**
 * A lightweight summary of the rule catalog itself (not an evaluation
 * outcome) — e.g. for a future Mission Control or rule-management UI.
 */
export interface RuleEngineSummary {
  totalRules: number;
  enabledRules: number;
  disabledRules: number;
  lastUpdated: string;
}
