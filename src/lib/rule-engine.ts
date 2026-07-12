import type {
  Rule,
  RuleCondition,
  RuleConditionResult,
  RuleResult,
  RuleEvaluation,
  RuleCategory,
  RuleOperator,
  RuleOperatorInput,
  RuleOperatorAlias,
  RuleValidationResult,
  CreateRuleInput,
  UpdateRuleInput,
  ListRulesFilter,
} from "@/types/rule";

// Atlas Rule Engine.
//
// Evaluates supplied facts against reusable business rules. It does NOT
// discover data, does NOT crawl, does NOT extract metadata, and does NOT
// perform SEO analysis — it only compares whatever facts it's given
// against a Rule's configured condition(s), using plain JavaScript
// comparisons. No AI.
//
// EVOLUTION (v1 -> multi-condition): this file originally supported only
// single-condition rules (`field`/`operator`/`expectedValue` directly on
// `Rule`), dispatched via a switch statement. This revision adds:
//   - multi-condition rules (`Rule.conditions`), evaluated with AND
//     semantics — every condition must pass for the rule to pass
//   - two new operators (`startsWith`, `endsWith`)
//   - snake_case operator aliases, normalized via `normalizeRuleOperator()`
//   - dispatch via `evaluateOperator()` against an operator lookup map,
//     replacing the old switch statement (no giant switch, per the
//     engineering requirement for this revision)
//   - `validateRule()`, a new method
//   - `matchedConditions`/`executionTimeMs` added to `RuleResult`
// Every v1 public method, field, and enum value is still here, unchanged
// in behavior. A rule built the old way (no `conditions`, camelCase
// operator) evaluates to the exact same RuleResult it always did — see
// docs/architecture/rule-engine.md for the full writeup of this
// evolution.
//
// Architecture: the dependency direction is
//   Rule Engine -> Insight Engine -> Mission Control
// never the reverse. This file must never import from Mission Control,
// the Crawler, the Metadata Engine, the Knowledge Graph, or any
// department (SEO, Marketing, Finance, Sales, Content, Analytics). Future
// departments call INTO the Rule Engine (supplying rules + facts) and are
// expected to turn failed RuleResults into Insights via the Insight
// Engine themselves — the Rule Engine does not call the Insight Engine
// on a department's behalf, since it has no department-specific judgment
// about what should become an insight.
//
// Follows the same architecture as the other Atlas services: a plain
// object of methods (no class), no mock data, `TODO(supabase)` markers
// instead of real persistence for the rule catalog (createRule,
// updateRule, deleteRule, getRule, listRules, listRulesByCategory). Rules
// are NOT businessId-scoped (see `src/types/rule.ts`) — they're reusable
// definitions; only `evaluateRules()`'s output (`RuleEvaluation`) is tied
// to a specific business, via the businessId the caller supplies.

function notImplemented(action: string): never {
  throw new Error(`RuleEngine.${action} is not implemented yet — TODO(supabase): wire this up.`);
}

// --- Operator comparisons -----------------------------------------------
// Each comparison is a small, focused, independently testable function.
// `evaluateOperator()` below is the only place that dispatches between
// them, via a lookup map — no switch statement.

function compareEquals(actual: unknown, expected: unknown): boolean {
  return actual === expected;
}

function compareNotEquals(actual: unknown, expected: unknown): boolean {
  return actual !== expected;
}

function compareGreaterThan(actual: unknown, expected: unknown): boolean {
  return typeof actual === "number" && typeof expected === "number" && actual > expected;
}

function compareGreaterThanOrEqual(actual: unknown, expected: unknown): boolean {
  return typeof actual === "number" && typeof expected === "number" && actual >= expected;
}

function compareLessThan(actual: unknown, expected: unknown): boolean {
  return typeof actual === "number" && typeof expected === "number" && actual < expected;
}

function compareLessThanOrEqual(actual: unknown, expected: unknown): boolean {
  return typeof actual === "number" && typeof expected === "number" && actual <= expected;
}

function compareContains(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }
  if (Array.isArray(actual)) {
    return actual.includes(expected);
  }
  return false;
}

function compareNotContains(actual: unknown, expected: unknown): boolean {
  return !compareContains(actual, expected);
}

/** NEW operator. */
function compareStartsWith(actual: unknown, expected: unknown): boolean {
  return typeof actual === "string" && typeof expected === "string" && actual.startsWith(expected);
}

/** NEW operator. */
function compareEndsWith(actual: unknown, expected: unknown): boolean {
  return typeof actual === "string" && typeof expected === "string" && actual.endsWith(expected);
}

function compareExists(actual: unknown): boolean {
  return actual !== undefined && actual !== null;
}

function compareMissing(actual: unknown): boolean {
  return !compareExists(actual);
}

function compareRegex(actual: unknown, expected: unknown): boolean {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  try {
    return new RegExp(expected).test(actual);
  } catch {
    // An invalid regex pattern in the expected value fails the rule
    // rather than throwing, so one malformed rule can't break a whole
    // evaluateRules() pass.
    return false;
  }
}

// --- Operator registry (no switch statement) -----------------------------

type OperatorEvaluator = (actual: unknown, expected: unknown) => boolean;

const OPERATOR_REGISTRY: Record<RuleOperator, OperatorEvaluator> = {
  equals: compareEquals,
  notEquals: compareNotEquals,
  greaterThan: compareGreaterThan,
  greaterThanOrEqual: compareGreaterThanOrEqual,
  lessThan: compareLessThan,
  lessThanOrEqual: compareLessThanOrEqual,
  contains: compareContains,
  notContains: compareNotContains,
  startsWith: compareStartsWith,
  endsWith: compareEndsWith,
  exists: compareExists,
  missing: compareMissing,
  regex: compareRegex,
};

/**
 * Maps a snake_case operator alias onto its canonical camelCase
 * `RuleOperator`. Both naming conventions are accepted anywhere an
 * operator is specified; this is the one place that reconciles them.
 */
const OPERATOR_ALIASES: Record<RuleOperatorAlias, RuleOperator> = {
  not_equals: "notEquals",
  greater_than: "greaterThan",
  greater_than_or_equal: "greaterThanOrEqual",
  less_than: "lessThan",
  less_than_or_equal: "lessThanOrEqual",
  not_contains: "notContains",
  starts_with: "startsWith",
  ends_with: "endsWith",
  matches_regex: "regex",
  not_exists: "missing",
};

/**
 * Normalizes either operator spelling (camelCase `RuleOperator` or a
 * snake_case `RuleOperatorAlias`) to its canonical `RuleOperator` form.
 * Exported as a compatibility helper — a future rule-authoring UI or
 * importer can call this directly to normalize rules before storing them.
 */
export function normalizeRuleOperator(operator: RuleOperatorInput): RuleOperator {
  return operator in OPERATOR_ALIASES ? OPERATOR_ALIASES[operator as RuleOperatorAlias] : (operator as RuleOperator);
}

/**
 * Looks up and runs the comparison function for a given operator (in
 * either naming convention) against an actual/expected value pair. This
 * is the operator dispatcher — a lookup into `OPERATOR_REGISTRY`, never a
 * switch statement, so adding a new operator later means adding one map
 * entry, not a new branch.
 */
function evaluateOperator(operator: RuleOperatorInput, actual: unknown, expected: unknown): boolean {
  const canonical = normalizeRuleOperator(operator);
  const evaluator = OPERATOR_REGISTRY[canonical];
  return evaluator(actual, expected);
}

/**
 * Resolves a Rule down to the list of conditions it should be evaluated
 * against — its `conditions` array if present and non-empty (new,
 * multi-condition path), otherwise its legacy `field`/`operator`/
 * `expectedValue` triple as a single implied condition (v1 path). Returns
 * an empty array for a rule that defines neither, which `evaluateRule()`
 * treats as a reportable misconfiguration rather than a crash.
 */
function resolveConditions(rule: Rule): RuleCondition[] {
  if (rule.conditions && rule.conditions.length > 0) {
    return rule.conditions;
  }
  if (rule.field !== undefined && rule.operator !== undefined) {
    return [{ field: rule.field, operator: rule.operator, value: rule.expectedValue }];
  }
  return [];
}

/**
 * Builds a short, human-readable explanation of a rule's outcome. Single
 * condition: identical wording to v1's message format, so existing
 * consumers reading `RuleResult.message` see no change for legacy rules.
 * Multiple conditions: a per-condition summary.
 */
function buildMessage(rule: Rule, conditionResults: RuleConditionResult[], passed: boolean): string {
  const verb = passed ? "passed" : "failed";

  if (conditionResults.length === 1) {
    const c = conditionResults[0];
    if (c.operator === "exists" || c.operator === "missing") {
      return `${rule.name} ${verb}: expected "${c.field}" to ${
        c.operator === "exists" ? "exist" : "be missing"
      } (actual: ${JSON.stringify(c.actualValue)}).`;
    }
    return `${rule.name} ${verb}: expected "${c.field}" ${c.operator} ${JSON.stringify(
      c.expectedValue,
    )}, got ${JSON.stringify(c.actualValue)}.`;
  }

  const summary = conditionResults
    .map(
      (c) =>
        `${c.field} ${c.operator} ${JSON.stringify(c.expectedValue)} => ${c.passed ? "ok" : "FAILED"}`,
    )
    .join("; ");
  return `${rule.name} ${verb} (${conditionResults.length} conditions): ${summary}`;
}

export const ruleEngine = {
  /**
   * Evaluates a single Rule against a supplied facts object using plain
   * JavaScript comparisons — no AI, no external calls. Supports both
   * legacy single-condition rules and new multi-condition rules
   * transparently; the caller doesn't need to know which kind of rule
   * it's passing in.
   */
  evaluateRule(rule: Rule, facts: Record<string, unknown>): RuleResult {
    const start = performance.now();
    const conditions = resolveConditions(rule);
    const evaluatedAt = new Date().toISOString();

    if (conditions.length === 0) {
      // Misconfigured rule (neither legacy field/operator nor
      // conditions[] is set) — never crash; report it as a failing,
      // clearly-explained result instead.
      return {
        ruleId: rule.id,
        passed: false,
        severity: rule.severity,
        message: `${rule.name} could not be evaluated: no conditions are defined (neither legacy field/operator nor conditions[] is set).`,
        recommendation: rule.recommendation,
        actualValue: undefined,
        expectedValue: undefined,
        evaluatedAt,
        matchedConditions: [],
        executionTimeMs: Math.round(performance.now() - start),
      };
    }

    const matchedConditions: RuleConditionResult[] = conditions.map((condition) => {
      const actualValue = facts[condition.field];
      return {
        field: condition.field,
        operator: normalizeRuleOperator(condition.operator),
        passed: evaluateOperator(condition.operator, actualValue, condition.value),
        actualValue,
        expectedValue: condition.value,
      };
    });

    const passed = matchedConditions.every((c) => c.passed);
    const representative = matchedConditions.find((c) => !c.passed) ?? matchedConditions[0];

    return {
      ruleId: rule.id,
      passed,
      severity: rule.severity,
      message: buildMessage(rule, matchedConditions, passed),
      recommendation: rule.recommendation,
      actualValue: representative.actualValue,
      expectedValue: representative.expectedValue,
      evaluatedAt,
      matchedConditions,
      executionTimeMs: Math.round(performance.now() - start),
    };
  },

  /**
   * Evaluates a set of Rules against a business's facts in one pass,
   * aggregating the results. Only rules with `status: "enabled"` are
   * evaluated — `"disabled"` and `"draft"` rules are skipped entirely.
   */
  evaluateRules(businessId: string, rules: Rule[], facts: Record<string, unknown>): RuleEvaluation {
    const results = rules
      .filter((rule) => rule.status === "enabled")
      .map((rule) => this.evaluateRule(rule, facts));

    const failedResults = results.filter((r) => !r.passed);

    return {
      businessId,
      passed: results.filter((r) => r.passed).length,
      failed: failedResults.length,
      warnings: failedResults.filter((r) => r.severity !== "critical").length,
      critical: failedResults.filter((r) => r.severity === "critical").length,
      results,
      evaluatedAt: new Date().toISOString(),
    };
  },

  /**
   * NEW: validates a Rule's structure — independent of any facts — to
   * catch misconfiguration before it's stored: no conditions defined,
   * an unrecognized operator, or an invalid regex pattern. Synchronous
   * and pure, like `evaluateRule`/`evaluateRules`, since it needs no
   * persistence.
   */
  validateRule(rule: Rule): RuleValidationResult {
    const errors: string[] = [];

    if (!rule.name?.trim()) {
      errors.push("Rule must have a non-empty name.");
    }

    const conditions = resolveConditions(rule);
    if (conditions.length === 0) {
      errors.push(
        "Rule must define either field/operator/expectedValue (legacy) or a non-empty conditions[] array.",
      );
    }

    for (const condition of conditions) {
      if (!condition.field?.trim()) {
        errors.push('A condition is missing a "field".');
        continue;
      }

      const canonical = normalizeRuleOperator(condition.operator);
      if (!(canonical in OPERATOR_REGISTRY)) {
        errors.push(`Condition on "${condition.field}" uses an unrecognized operator: "${condition.operator}".`);
        continue;
      }

      if (canonical === "regex" && typeof condition.value === "string") {
        try {
          new RegExp(condition.value);
        } catch {
          errors.push(`Condition on "${condition.field}" has an invalid regex pattern: "${condition.value}".`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Adds a new rule to the catalog.
   */
  async createRule(_input: CreateRuleInput): Promise<Rule> {
    // TODO(supabase): supabase.from("rules").insert(input).select().single()
    return notImplemented("createRule");
  },

  /**
   * Updates an existing rule's fields.
   */
  async updateRule(_ruleId: string, _input: UpdateRuleInput): Promise<Rule> {
    // TODO(supabase): supabase.from("rules").update(input).eq("id", ruleId).select().single()
    return notImplemented("updateRule");
  },

  /**
   * Permanently deletes a rule from the catalog.
   */
  async deleteRule(_ruleId: string): Promise<void> {
    // TODO(supabase): supabase.from("rules").delete().eq("id", ruleId)
    return notImplemented("deleteRule");
  },

  /**
   * Fetches a single rule by id.
   */
  async getRule(_ruleId: string): Promise<Rule | null> {
    // TODO(supabase): supabase.from("rules").select("*").eq("id", ruleId).maybeSingle()
    return null;
  },

  /**
   * Lists rules in the catalog, optionally filtered by category, status,
   * or severity.
   */
  async listRules(_filter?: ListRulesFilter): Promise<Rule[]> {
    // TODO(supabase): supabase.from("rules").select("*").match(filter ?? {}).order("name")
    return [];
  },

  /**
   * Lists rules in the catalog within a single category.
   */
  async listRulesByCategory(category: RuleCategory): Promise<Rule[]> {
    // Thin wrapper over listRules — kept as its own method since "rules
    // for this department" is a common, self-documenting query pattern
    // future departments (SEO, Marketing, Finance, etc.) will reach for.
    return this.listRules({ category });
  },
};
