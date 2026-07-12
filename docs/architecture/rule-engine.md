# Atlas Rule Engine

## Purpose

The Rule Engine evaluates supplied facts against reusable business rules,
using plain JavaScript comparisons. It does **not** discover data, does
**not** crawl, does **not** extract metadata, and does **not** perform any
SEO, Marketing, Finance, Sales, or Content analysis itself. It has no
opinion on what facts mean — it only checks whether a fact matches what a
rule expects, and reports the outcome.

## Evolution: v1 to Multi-Condition Rules

The Rule Engine originally shipped supporting **single-condition rules
only** — a rule carried exactly one `field`/`operator`/`expectedValue`
triple, evaluated via a switch statement over `RuleOperator`. This
section documents what changed and, just as importantly, what didn't.

**What's new, purely additive:**

- **Multi-condition rules.** A `Rule` may now carry an optional
  `conditions: RuleCondition[]` array. When present and non-empty, the
  rule is evaluated with AND semantics — every condition must pass for
  the rule to pass. This is what lets one rule express something like
  "titleLength lessThanOrEqual 60 AND canonicalUrl exists" that a
  single-condition rule couldn't represent.
- **Two new operators:** `startsWith` and `endsWith`, alongside the
  original eleven.
- **snake_case operator aliases.** Some rule authors (an external rule
  source, a future rule-authoring UI following REST/JSON naming
  conventions) may prefer `not_equals` over `notEquals`. Both are
  accepted everywhere an operator appears; `normalizeRuleOperator()`
  (exported from `rule-engine.ts`) maps any alias to its canonical
  camelCase form before evaluation. Only the canonical form is ever
  treated as "the" operator internally — aliases are a compatibility
  layer, not a second parallel implementation.
- **`evaluateOperator()`**, a proper dispatcher function backed by a
  `Record<RuleOperator, ...>` lookup map (`OPERATOR_REGISTRY`), replacing
  the original switch statement. Adding a future operator now means one
  new map entry, not a new `case`.
- **`validateRule()`**, a new method that checks a rule's structure
  (has conditions to evaluate, uses a recognized operator, has a valid
  regex pattern where relevant) independent of evaluating it against any
  facts.
- **`RuleResult.matchedConditions` and `RuleResult.executionTimeMs`**,
  two new optional fields giving a per-condition breakdown and timing
  information that wasn't previously available.

**What's unchanged, and guaranteed to stay working:**

- Every v1 field — `field`, `operator`, `expectedValue` on `Rule` itself,
  and `actualValue`/`expectedValue`/`evaluatedAt` on `RuleResult` — still
  exists, with identical meaning. A rule built the old way, with no
  `conditions` array, evaluates through exactly the same logic path
  (`resolveConditions()` falls back to treating `field`/`operator`/
  `expectedValue` as a single implied condition) and produces a
  `RuleResult` with the same `message` wording as before.
- Every v1 method signature — `evaluateRule(rule, facts)`,
  `evaluateRules(businessId, rules, facts)`, `createRule`, `updateRule`,
  `deleteRule`, `getRule`, `listRules`, `listRulesByCategory` — is
  unchanged.
- `RuleCategory`, `RuleSeverity`, and `RuleStatus` are untouched. This
  revision deliberately did not introduce alternate vocabularies for
  these (e.g. an `"active"` status alongside `"enabled"`) — only the
  operator-naming and single-vs-multi-condition concerns were in scope
  for this evolution.
- A rule that defines neither `conditions` nor a legacy `field`/
  `operator` pair does not crash `evaluateRule()` — it returns a
  `RuleResult` with `passed: false` and an explanatory message, and
  `validateRule()` flags it as invalid before it ever reaches evaluation.

This was verified concretely, not just asserted: a runtime smoke test
(legacy single-condition rules, new multi-condition rules, operator
aliases, and `validateRule()`, all evaluated against real facts) was
compiled and executed as part of this change, confirming identical
behavior for v1-style rules and correct behavior for the new
capabilities, before this revision was committed.

## Responsibilities

- Define a reusable `Rule` shape: a name, description, category,
  severity, status, either a `field`/`operator`/`expectedValue` triple
  (legacy, single-condition) or a `conditions` array (multi-condition),
  and a `recommendation` to surface if the rule fails.
- Evaluate a single rule against a facts object (`evaluateRule`), or a
  whole set of rules at once (`evaluateRules`), aggregating pass/fail/
  warning/critical counts.
- Maintain a catalog of rules (`createRule`, `updateRule`, `deleteRule`,
  `getRule`, `listRules`, `listRulesByCategory`) that any department can
  query and reuse.
- Support thirteen comparison operators (`equals`, `notEquals`,
  `greaterThan`, `greaterThanOrEqual`, `lessThan`, `lessThanOrEqual`,
  `contains`, `notContains`, `startsWith`, `endsWith`, `exists`,
  `missing`, `regex` — plus snake_case aliases for each, see "Evolution"
  above) using only plain JavaScript comparisons — no AI, no external
  calls.

## Architecture

Rules are **not** scoped to a single business — the same rule definition
(e.g. "titleLength greaterThan 60") is reusable across every business.
Only the *output* of an evaluation (`RuleEvaluation`) is tied to a
specific business, via the `businessId` the caller supplies to
`evaluateRules()`.

The dependency direction is strictly one-way:

```
Rule Engine → Insight Engine → Mission Control
```

Never the reverse. The Rule Engine has zero imports from Mission Control,
the Crawl Engine, the Metadata Extraction Engine, the Knowledge Graph
Engine, or any department module (SEO, Marketing, Finance, Sales,
Content, Analytics). Those modules are expected to call *into* the Rule
Engine — supplying it rules and facts — never the other way around.

## Rule lifecycle

A `Rule` moves through three statuses:

- **draft** — being authored/tuned, not yet evaluated in practice.
- **enabled** — actively evaluated by `evaluateRules()`.
- **disabled** — retired or paused; skipped by `evaluateRules()` without
  needing to delete the rule outright.

`evaluateRules()` silently skips any rule that isn't `"enabled"` — a
`draft` or `disabled` rule passed into `evaluateRules()` simply doesn't
contribute a `RuleResult`, rather than erroring.

## Relationship with Insight Engine

The Rule Engine produces `RuleResult`s; it does **not** create `Insight`s
itself, and has no import of `src/lib/insight-engine.ts`. That
translation is deliberately left to whichever department is calling the
Rule Engine:

1. A department (e.g. a future SEO Audit Engine) gathers facts about a
   business (e.g. from the Page Repository / Metadata Extraction Engine).
2. It calls `ruleEngine.evaluateRules(businessId, rules, facts)`.
3. For each failed `RuleResult` it judges worth surfacing, **the
   department itself** calls `insightEngine.createInsight()` — deciding
   things like whether a single failed rule warrants an insight on its
   own, or whether several related failures should be rolled into one.

This keeps the Rule Engine a pure evaluator: it never decides what
counts as noteworthy enough to become a persisted `Insight` — that
judgment belongs to the department with domain context.

## Relationship with future departments

Every future department — SEO, Marketing, Finance, Sales, Content,
Knowledge — is expected to be a **consumer** of the Rule Engine, supplying
its own rules and its own facts:

- An SEO Audit Engine might define rules like "titleLength lessThanOrEqual
  60" or "metaDescription exists" and evaluate them against a page's
  `ExtractedMetadata`.
- A Finance Engine might define a rule like "cashRunwayMonths
  greaterThanOrEqual 6" and evaluate it against that business's financial
  facts.
- A Content Engine might check "wordCount greaterThan 300" before
  considering a draft complete.

None of these department-specific rules live inside the Rule Engine
itself — per "no hardcoded SEO rules," the engine ships with zero rules
predefined. Departments own their own rule definitions and register them
through `createRule`.

## Relationship with AI Agents

The Rule Engine is deliberately "dumb" on purpose: comparisons are plain
JavaScript, with no AI involved in evaluating a rule. This is a feature,
not a gap to fill in later — deterministic, explainable pass/fail
outcomes are exactly what make `RuleResult`s trustworthy inputs for
anything built on top of them, AI included:

- A future AI Agent could *propose* new rules (e.g. suggesting "add a
  rule: `canonicalUrl exists`" after reviewing a business's pages), which
  a human or another agent then registers via `createRule` — the Rule
  Engine's job stays limited to evaluating whatever rules it's given.
- An AI Agent reasoning over *why* a business is unhealthy could use
  `RuleResult.message` and `recommendation` as grounded, factual inputs,
  rather than needing to re-derive "is this title too long?" itself.

## Example evaluation flow

```
Facts
  titleLength = 82

Rule
  field: "titleLength"
  operator: "lessThanOrEqual"
  expectedValue: 60

        │
        ▼
  evaluateRule()
        │
        ▼
  RuleResult { passed: false, severity: ... }
        │
        ▼
   SEO Department
  (decides this is worth surfacing)
        │
        ▼
   Insight Engine
  insightEngine.createInsight()
        │
        ▼
   Mission Control
   reads the Insight
```
