# Atlas Insight Engine

## Purpose

The Insight Engine is Atlas's reasoning-output layer. It converts facts
already established elsewhere in Atlas — by Business Service, Website
Discovery, the Discovery Orchestrator, the Crawl Engine, the Page
Repository, the Metadata Extraction Engine, the Knowledge Graph Engine,
and every future department — into a single standardized shape:
the `Insight`.

It does **not** crawl websites, does **not** perform SEO analysis, and
does **not** generate AI responses. It has no opinion on how any
conclusion was reached. It only stores and retrieves conclusions that
other modules hand it.

## Evolution: Consuming Rule Results

The Insight Engine originally supported creating an insight only from a
fully-formed `CreateInsightInput` — a caller already knew the title,
description, category, and everything else it wanted to record. This
revision adds the ability to generate an `Insight` directly from a Rule
Engine `RuleResult`, as a purely additive capability.

**What's new:**

- **`ruleResultToInsight(ruleResult, context)`** — an isolated, exported,
  pure transformation function. It derives a generic title/description
  from `RuleResult.message` (which the Rule Engine already writes in
  plain, rule-name-based language) and carries over `severity`,
  `recommendation`, `ruleId`, `actualValue`/`expectedValue`, and
  `matchedConditions` — with zero department-specific wording anywhere in
  the function. `context` supplies what a bare `RuleResult` can't:
  `businessId`, `category`, and `source` — which is also *how* a
  department's identity gets attached to an insight, without the Insight
  Engine ever branching on "is this SEO or Marketing?" itself.
- **`createInsight()` gains a second overload**: `createInsight(ruleResult,
  context)`, alongside its original `createInsight(input:
  CreateInsightInput)`. Existing callers are completely unaffected — the
  original signature still exists, unchanged, and is still the first
  overload.
- **`createInsights(ruleResults, context)`** — new batch method, the
  plural counterpart, producing one insight per `RuleResult` via the same
  transformation.
- **`summarizeInsights(insights)`** — new, and a genuinely working pure
  function (not a `TODO(supabase)` stub, since it needs no persistence):
  given an array of `Insight`, it returns an `InsightSummary` rollup.
- **`updateInsight()`** — new generic patch method for non-status fields.
- **`Insight` gained three new optional fields**: `ruleId`, `jobId`, and
  `summary`. Every v1 field (`title`, `description`, `source`,
  `entityId`, etc.) is unchanged.

**What's unchanged:** `InsightSeverity`, `InsightCategory`, `InsightStatus`,
and every v1 method (`createInsight`'s original signature,
`listInsights`, `listInsightsByCategory`, `listCriticalInsights`,
`listOpenInsights`, `resolveInsight`, `dismissInsight`, `deleteInsight`)
behave exactly as they did before. This was verified concretely: a
runtime smoke test compiling and executing both `createInsight()`
overloads, `createInsights()`, `summarizeInsights()`, and every v1 read
method was run as part of this change, confirming identical v1 behavior
and correct new behavior, before this revision was committed.

## Transformation Flow

```
RuleResult                    RuleResultInsightContext
(ruleId, passed, severity,    (businessId, category, source,
 message, recommendation,      pageId?, jobId?)
 actualValue, expectedValue)
        │                              │
        └──────────────┬───────────────┘
                        ▼
              ruleResultToInsight()
     (pure, isolated, generic — no department wording)
                        │
                        ▼
              CreateInsightInput
                        │
                        ▼
          insightEngine.createInsight()
                        │
                        ▼
                    Insight
           (status starts as "new")
```

`ruleResultToInsight()` is deliberately a separate, exported function
rather than logic inlined into `createInsight()` — this is what "keep
transformation logic isolated" means in practice: the mapping from
"what a rule concluded" to "what an insight says" lives in exactly one
place, independently reviewable and reusable by `createInsights()`
without duplicating it.

## Responsibilities

- Provide one standardized `Insight` shape (title, description, category,
  severity, status, source, optional links to a `Page`, `KnowledgeEntity`,
  `Rule`, or `Job`, a recommendation, and free-form metadata) that every
  Atlas department reports through, instead of each department inventing
  its own findings format.
- Store insights and let them be queried by category, severity, status,
  or source (`listInsights`, `listInsightsByCategory`,
  `listCriticalInsights`, `listOpenInsights`), and summarized in bulk
  (`summarizeInsights`).
- Track an insight's lifecycle from `new` through `acknowledged` to a
  terminal state (`resolved` or `dismissed`), and patch non-status fields
  via `updateInsight`.
- Transform a Rule Engine `RuleResult` into an `Insight` using entirely
  generic language (`ruleResultToInsight`) — this is the one place the
  Insight Engine does anything beyond pure storage, and even this stays
  free of department-specific knowledge; `context` is what supplies that.
- Remain completely ignorant of *how* any conclusion was reached. Severity
  ("is this critical or just informational?"), category, and the
  recommendation text are entirely the producing module's judgment call —
  the Insight Engine never second-guesses or recomputes them, and it does
  NOT evaluate rules or inspect pages itself — it only consumes a
  `RuleResult` someone else already produced.

## Architecture

This file depends only on its own types (`src/types/insight.ts`) and,
type-only, on `RuleResult` from `src/types/rule.ts` — a type-only import
has no runtime dependency on the Rule Engine's actual evaluation logic,
only on the shape of the data it produces. The Insight Engine must never
import from SEO, Marketing, Finance, the Crawler, Mission Control, or
Knowledge Graph modules — those modules depend on the Insight Engine,
never the reverse.

## Relationship with Mission Control

Mission Control is intended to read insights from here rather than from
each department directly (see `docs/architecture/atlas-kernel.md` for
Mission Control's own architecture). Concretely:

- Mission Control's dashboard `insights` field (see
  `src/types/mission-control.ts`) is meant to be populated by
  `insightEngine.listOpenInsights()` and/or `listCriticalInsights()`,
  once this engine has real persistence.
- Business Health and System Status cards can eventually derive their
  severity from open insights in the relevant category, rather than the
  static placeholders they show today.
- This is a one-way dependency: Mission Control depends on the Insight
  Engine, never the reverse. The Insight Engine has no import of, or
  knowledge of, Mission Control.

## Relationship with future departments

Every future department is expected to be a **producer** of insights,
never a consumer of another department's insight-generation logic:

- An SEO Audit Engine finds a missing meta description on a page → calls
  `insightEngine.createInsight()` with `category: "SEO"`,
  `source: "SeoAudit"`, `pageId` set, and its own judgment on `severity`
  and `recommendation` — either by constructing a `CreateInsightInput`
  directly, or, if the finding came from evaluating a Rule Engine rule,
  by calling `createInsight(ruleResult, context)` (or
  `createInsights(ruleResults, context)` for several at once) and letting
  `ruleResultToInsight()` do the mechanical translation.
- A Marketing Engine notices an underperforming campaign → creates a
  `category: "MARKETING"` insight.
- A Finance Engine flags a cash-flow risk → creates a `category:
  "FINANCE"` insight.

The Insight Engine has zero imports from any of these modules — they will
depend on it, never the other way around. This keeps the reasoning
*output* format shared and consistent, without coupling the Insight
Engine to any department's internal logic.

## Future Persistence

No persistence layer exists yet — every write method
(`createInsight`, `createInsights`, `updateInsight`, `resolveInsight`,
`dismissInsight`, `deleteInsight`) throws a `TODO(supabase)` error naming
the exact intended Supabase query; every read method
(`getInsight`, `listInsights`, and the category/critical/open variants)
returns an empty/`null` default rather than throwing. `summarizeInsights`
is the one exception — it needs no persistence at all, since it operates
on whatever `Insight[]` the caller already has in hand (e.g. from a prior
`listInsights()` call), so it's fully functional today. Once a real
`insights` table exists, every `TODO(supabase)` comment already documents
the specific query it should be replaced with — no method's public
signature is expected to change when that lands.

## Future AI integration

The Insight Engine is a natural landing point for AI-generated
conclusions once Atlas AI Agents exist:

- An agent reasoning over a business's Knowledge Graph, crawled pages, or
  Business DNA could produce `Insight` records the same way any
  rule-based engine does — the shape doesn't change based on whether a
  human-written heuristic or an LLM produced the conclusion.
- `metadata` on an `Insight` is intentionally free-form, so an AI-produced
  insight can carry additional context (e.g. the prompt, model, or
  supporting excerpts used to reach it) without requiring a schema change.
- Because insights are already standardized and queryable by severity and
  category, a future "Insight Engine v2" or ranking layer could
  prioritize which insights an AI agent surfaces to a user first, without
  needing to know which department or agent produced each one.

None of this AI integration exists yet — it's the direction this engine
is deliberately shaped to grow into, not a current capability.

## Future Vision

```
SEO Engine          Marketing Engine       Finance Engine
    │                      │                      │
    ▼                      ▼                      ▼
creates SEO           creates Marketing      creates Financial
  Insights               Insights               Insights
    │                      │                      │
    └──────────────────────┼──────────────────────┘
                           ▼
                    Insight Engine
                           │
                           ▼
                    Mission Control
                  reads all Insights
```
