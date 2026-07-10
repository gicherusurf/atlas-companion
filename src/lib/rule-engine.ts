import type {
  Rule,
  RuleResult,
  RuleEvaluation,
  RuleCategory,
  CreateRuleInput,
  UpdateRuleInput,
  ListRulesFilter,
} from "@/types/rule";

// Atlas Rule Engine.
//
// Evaluates supplied facts against reusable business rules. It does NOT
// discover data, does NOT crawl, does NOT extract metadata, and does NOT
// perform SEO analysis — it only compares whatever facts it's given
// against a Rule's configured field/operator/expectedValue, using plain
// JavaScript comparisons. No AI.
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
// `evaluateRule()` below is the only place that dispatches between them.

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
    // An invalid regex pattern in `expectedValue` fails the rule rather
    // than throwing, so one malformed rule can't break a whole
    // evaluateRules() pass.
    return false;
  }
}

/**
 * Builds a short, human-readable explanation of a rule's outcome.
 */
function buildMessage(rule: Rule, actualValue: unknown, passed: boolean): string {
  const verb = passed ? "passed" : "failed";
  if (rule.operator === "exists" || rule.operator === "missing") {
    return `${rule.name} ${verb}: expected "${rule.field}" to ${
      rule.operator === "exists" ? "exist" : "be missing"
    } (actual: ${JSON.stringify(actualValue)}).`;
  }
  return `${rule.name} ${verb}: expected "${rule.field}" ${rule.operator} ${JSON.stringify(
    rule.expectedValue,
  )}, got ${JSON.stringify(actualValue)}.`;
}

export const ruleEngine = {
  /**
   * Evaluates a single Rule against a supplied facts object using plain
   * JavaScript comparisons — no AI, no external calls.
   */
  evaluateRule(rule: Rule, facts: Record<string, unknown>): RuleResult {
    const actualValue = facts[rule.field];
    let passed: boolean;

    switch (rule.operator) {
      case "equals":
        passed = compareEquals(actualValue, rule.expectedValue);
        break;
      case "notEquals":
        passed = compareNotEquals(actualValue, rule.expectedValue);
        break;
      case "greaterThan":
        passed = compareGreaterThan(actualValue, rule.expectedValue);
        break;
      case "greaterThanOrEqual":
        passed = compareGreaterThanOrEqual(actualValue, rule.expectedValue);
        break;
      case "lessThan":
        passed = compareLessThan(actualValue, rule.expectedValue);
        break;
      case "lessThanOrEqual":
        passed = compareLessThanOrEqual(actualValue, rule.expectedValue);
        break;
      case "contains":
        passed = compareContains(actualValue, rule.expectedValue);
        break;
      case "notContains":
        passed = compareNotContains(actualValue, rule.expectedValue);
        break;
      case "exists":
        passed = compareExists(actualValue);
        break;
      case "missing":
        passed = compareMissing(actualValue);
        break;
      case "regex":
        passed = compareRegex(actualValue, rule.expectedValue);
        break;
    }

    return {
      ruleId: rule.id,
      passed,
      severity: rule.severity,
      message: buildMessage(rule, actualValue, passed),
      recommendation: rule.recommendation,
      actualValue,
      expectedValue: rule.expectedValue,
      evaluatedAt: new Date().toISOString(),
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
