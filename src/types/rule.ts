// TODO(supabase): once a real persistence layer exists, align this shape
// with the DB schema (e.g. via `supabase gen types typescript`) instead
// of hand-maintaining it.
//
// EVOLUTION NOTE (v1 -> multi-condition): this file originally shipped
// with single-condition rules only (a rule directly carried one
// `field`/`operator`/`expectedValue` triple). This revision adds
// multi-condition support (`RuleCondition`, `Rule.conditions`) as a
// purely additive capability — every v1 field is still here, unchanged
// in meaning, and every v1 rule object still satisfies this type exactly
// as before. See docs/architecture/rule-engine.md for the full writeup.

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
 * The canonical set of comparisons a condition can perform between a
 * fact's actual value and an expected value. `exists` and `missing`
 * ignore the expected value entirely — they only check whether the fact
 * is present.
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
  | "startsWith"
  | "endsWith"
  | "exists"
  | "missing"
  | "regex";

/**
 * Alternate, snake_case spellings for operators that already exist above
 * under a camelCase name. These are NOT distinct operators — they're
 * aliases some rule authors (e.g. a future rule-authoring UI, or rules
 * imported from an external/JSON-oriented source) may prefer to write.
 * `normalizeRuleOperator()` in `rule-engine.ts` maps each of these onto
 * its canonical `RuleOperator` before evaluation. `"equals"` and
 * `"contains"` need no alias since they're already spelled the same in
 * both conventions.
 */
export type RuleOperatorAlias =
  | "not_equals"
  | "greater_than"
  | "greater_than_or_equal"
  | "less_than"
  | "less_than_or_equal"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "matches_regex"
  | "not_exists";

/**
 * Either spelling is accepted anywhere a condition's operator is
 * specified. Only the canonical `RuleOperator` form is ever stored back
 * as the "real" value (see `normalizeRuleOperator()`).
 */
export type RuleOperatorInput = RuleOperator | RuleOperatorAlias;

/**
 * NEW: one condition within a multi-condition rule (see
 * `Rule.conditions`). `value` is this revision's name for what a
 * single-condition rule calls `expectedValue` on `Rule` itself — both
 * mean "the value this condition's `field` is compared against."
 */
export interface RuleCondition {
  field: string;
  operator: RuleOperatorInput;
  /** Ignored when `operator` is `exists`/`missing` (or their aliases). */
  value: unknown;
}

/**
 * The outcome of evaluating a single RuleCondition against facts. Part
 * of `RuleResult.matchedConditions` — see below.
 */
export interface RuleConditionResult {
  field: string;
  /** Always the canonical (camelCase) spelling, regardless of which convention the condition was written in. */
  operator: RuleOperator;
  passed: boolean;
  actualValue: unknown;
  expectedValue: unknown;
}

/**
 * A reusable, business-agnostic rule definition. Rules are NOT scoped to
 * a single business — the same rule (e.g. "titleLength greaterThan 60")
 * is evaluated against whatever facts a caller supplies for whichever
 * business it's currently reasoning about.
 *
 * A rule is evaluated one of two ways:
 *   - **Legacy (v1), single-condition:** via `field`/`operator`/
 *     `expectedValue` directly on the rule. Unchanged since this type's
 *     original version — existing rules built this way keep working
 *     exactly as they did before.
 *   - **Multi-condition (new):** via `conditions`, when present and
 *     non-empty. All conditions must pass (AND semantics) for the rule
 *     to pass. This lets one rule express something like "titleLength
 *     greaterThan 60 AND canonicalUrl exists" that couldn't be
 *     represented as a single condition before.
 *
 * A rule should define one or the other, not neither — `validateRule()`
 * flags a rule that defines neither as invalid, and `evaluateRule()`
 * reports (rather than throws for) that same problem at evaluation time,
 * per "never crash."
 */
export interface Rule {
  id: string;
  name: string;
  description: string;
  category: RuleCategory;
  severity: RuleSeverity;
  status: RuleStatus;
  /** Legacy (v1) single-condition field. Optional so multi-condition rules aren't forced to redundantly fill this in — see `conditions` below. */
  field?: string;
  /** Legacy (v1) single-condition operator. Accepts either naming convention (see `RuleOperatorInput`). */
  operator?: RuleOperatorInput;
  /** Legacy (v1) single-condition expected value. */
  expectedValue?: unknown;
  /** NEW: multi-condition support. See the class-level doc above. */
  conditions?: RuleCondition[];
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
 * The outcome of evaluating a single Rule against a set of facts. Every
 * field that existed before this revision (`ruleId` through
 * `evaluatedAt`) is unchanged in meaning — `actualValue`/`expectedValue`
 * reflect the single legacy condition for a v1-style rule, or the first
 * FAILED condition (or the first condition, if all passed) for a
 * multi-condition rule, so old code reading just these two fields still
 * gets a sensible single value either way.
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
  /** NEW: per-condition breakdown. A single-item array for legacy single-condition rules, mirroring actualValue/expectedValue above. */
  matchedConditions?: RuleConditionResult[];
  /** NEW: wall-clock time this single evaluation took, in milliseconds. */
  executionTimeMs?: number;
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

/**
 * NEW: the outcome of `ruleEngine.validateRule()` — whether a Rule
 * definition is well-formed (has conditions to evaluate, uses recognized
 * operators, has valid regex patterns where relevant) independent of
 * evaluating it against any actual facts.
 */
export interface RuleValidationResult {
  valid: boolean;
  errors: string[];
}
