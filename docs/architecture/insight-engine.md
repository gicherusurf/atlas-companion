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

## Responsibilities

- Provide one standardized `Insight` shape (title, description, category,
  severity, status, source, optional links to a `Page` or
  `KnowledgeEntity`, a recommendation, and free-form metadata) that every
  Atlas department reports through, instead of each department inventing
  its own findings format.
- Store insights and let them be queried by category, severity, status,
  or source (`listInsights`, `listInsightsByCategory`,
  `listCriticalInsights`, `listOpenInsights`).
- Track an insight's lifecycle from `new` through `acknowledged` to a
  terminal state (`resolved` or `dismissed`).
- Remain completely ignorant of *how* any conclusion was reached. Severity
  ("is this critical or just informational?"), category, and the
  recommendation text are entirely the producing module's judgment call —
  the Insight Engine never second-guesses or recomputes them.

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
  and `recommendation`.
- A Marketing Engine notices an underperforming campaign → creates a
  `category: "MARKETING"` insight.
- A Finance Engine flags a cash-flow risk → creates a `category:
  "FINANCE"` insight.

The Insight Engine has zero imports from any of these modules — they will
depend on it, never the other way around. This keeps the reasoning
*output* format shared and consistent, without coupling the Insight
Engine to any department's internal logic.

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
