# Atlas SEO Department

## Purpose

The SEO Department is Atlas's first Department — the first proof that
the platform's department model, described in
`docs/vision/atlas-platform-v2.md`, actually works for a real domain. It
is not a standalone application bolted onto Atlas; it is a consumer of
platform layers that already exist, adding SEO-specific orchestration
and judgment on top of them.

## Responsibilities

- Own the lifecycle of SEO audits for a business: starting one, tracking
  its status, listing past audits, cancelling one in progress, and
  deleting audit records (`seo-department.ts`).
- Own the actual SEO-specific logic of *what* an audit checks — metadata,
  technical health, links, content, structure, performance, and
  indexability (`seo-audit-engine.ts`) — none of which is implemented yet,
  but all of which is scoped and documented.
- Translate SEO-specific findings into the platform's standardized
  shapes: `RuleResult`s via the Rule Engine, and `Insight`s via the
  Insight Engine, rather than inventing its own findings format.
- Report its own health and audit activity to Mission Control, the same
  way every department is expected to.

The SEO Department does **not** crawl, does not extract metadata, does
not build the Knowledge Graph, and does not evaluate rules using its own
logic — it consumes all of that from the modules that already do those
jobs.

## Architecture

Two files, two responsibilities:

- **`seo-department.ts`** (`seoDepartment`) — the thin orchestration/
  lifecycle layer: `runAudit`, `getAudit`, `listAudits`, `cancelAudit`,
  `deleteAudit`. Analogous to how `discovery-orchestrator.ts` coordinates
  `website-discovery-service.ts` without containing discovery logic
  itself.
- **`seo-audit-engine.ts`** (`seoAuditEngine`) — the actual per-audit-type
  logic: `runMetadataAudit`, `runTechnicalAudit`, `runLinkAudit`,
  `runContentAudit`, `runStructureAudit`, `runPerformanceAudit`,
  `runIndexabilityAudit`, and `runOverallAudit` (which aggregates the
  other seven).

The dependency direction is strictly one-way: the SEO Department may
consume the Page Repository, Metadata Extraction Engine, Knowledge
Graph, Rule Engine, Insight Engine, Job Manager, Event Bus, and Mission
Control's coordination — but none of those modules import from, or have
any knowledge of, the SEO Department. They were all built before it and
remain unaware of it, exactly as the Department Contract requires.

## Audit Types

| Audit Type | What it will check |
|---|---|
| `metadata` | Titles, meta descriptions, canonical URLs, headings, Open Graph/Twitter Card tags |
| `technical` | Reachability, HTTPS, response status/timing, robots.txt, sitemap |
| `links` | Broken links, link depth, internal linking patterns |
| `content` | Word count, heading usage, thin content |
| `structure` | Heading hierarchy, duplicate H1s, site/page organization |
| `performance` | Response time, image/resource counts |
| `indexability` | Robots directives, canonical correctness, crawlability |
| `overall` | Aggregates every audit type above into one SeoAudit |

`overall` is not a distinct check of its own — it's the composition of
the other seven, exactly as `runOverallAudit()`'s documentation
describes.

## Lifecycle

1. `seoDepartment.runAudit({ businessId, auditType })` is called (today:
   throws `TODO(supabase)`; eventually: creates a `SeoAudit` record with
   `status: "pending"`).
2. The audit transitions to `status: "running"` once the corresponding
   `seoAuditEngine` method(s) begin executing.
3. Each relevant `seoAuditEngine.run*Audit()` method reads facts from its
   documented upstream modules, evaluates rules, and produces `SeoIssue`s.
4. On completion, the `SeoAudit` transitions to `status: "completed"`
   (or `"failed"`), with `issues` populated and a computed
   `SeoAuditSummary`.
5. `seoDepartment.cancelAudit()` can move a `"pending"` or `"running"`
   audit to `status: "cancelled"` instead.
6. `seoDepartment.getAudit()` / `listAudits()` provide read access to past
   and current audits; `deleteAudit()` removes a record permanently.

None of steps 2–4 are implemented yet — every `seoAuditEngine` method
throws with a `TODO(seo-engine)` comment today. The lifecycle above is
the intended shape once they are.

## Dependencies

The SEO Department is a consumer of:

- **Page Repository** — the pages an audit runs against.
- **Metadata Extraction Engine** — the structured facts (title, headings,
  Open Graph, word count, etc.) audits evaluate.
- **Crawl Engine** — page depth, parent URL, and discovery source, for
  link/structure audits.
- **Website Discovery Service** — reachability, HTTPS, robots.txt,
  sitemap facts, for technical/indexability audits.
- **Knowledge Graph** — business entity context that may inform future,
  more sophisticated audits (e.g. content relevance to known Products).
- **Job Manager** — tracking audit runs as real, lifecycle-managed Jobs.
- **Event Bus** — publishing audit start/completion events.
- **Mission Control** — surfacing audit status and results.

It depends on nothing that doesn't already exist elsewhere in Atlas —
per "no hardcoded SEO rules" and "no mock data," the SEO Department adds
no new facts of its own; it only reasons over what's already there.

## Relationship with Rule Engine

The SEO Department owns SEO-specific *rule definitions* (e.g.
"titleLength lessThanOrEqual 60"), registered through
`ruleEngine.createRule()` — the Rule Engine itself ships with zero
predefined SEO rules (see `docs/architecture/rule-engine.md`). Each
`seoAuditEngine.run*Audit()` method is expected to call
`ruleEngine.evaluateRules()` with its own category's rules and the facts
it has gathered, then translate failed `RuleResult`s into `SeoIssue`s.
The Rule Engine has no knowledge that the SEO Department exists; the
dependency runs one way.

## Relationship with Insight Engine

Not every `SeoIssue` need become an `Insight` — the SEO Department, not
the Insight Engine, decides which findings are significant enough to
surface as a standardized, cross-department-visible conclusion.
`SeoIssue.insightId` links an issue back to the `Insight` it was promoted
into, once that promotion logic is implemented. The Insight Engine
remains unaware of SEO as a concept; it only stores whatever `Insight`
shape it's given, tagged with `category: "SEO"` and `source: "SeoAudit"`.

## Relationship with Mission Control

Mission Control's dashboard already reserves a "SEO" Business Health card
(currently always `"unknown"`, since no SEO module existed to report real
status — see `src/routes/_authenticated/mission-control.tsx`). Once the
SEO Department is wired up, that card is expected to reflect real audit
status and open SEO insights, read the same way Mission Control reads
every other layer: by asking, never by computing SEO judgment itself.

## Future Roadmap

- Implement `runMetadataAudit()` first, as the simplest audit type with
  the most directly available facts (Metadata Extraction Engine output
  requires no additional upstream work).
- Register the SEO Department's first rule set via `ruleEngine.createRule()`
  once a persistence layer exists for rules.
- Wire `seoDepartment.runAudit()` to actually create a Job via Job
  Manager and publish `JobCreated`/`JobCompleted` events via the Event
  Bus.
- Implement the remaining six audit types, each following the same
  fact-gathering → rule-evaluation → issue/insight pattern established by
  `runMetadataAudit()`.
- Wire Mission Control's "SEO" health card and a future "Run SEO Audit"
  Quick Action (already present as a placeholder — see
  `src/lib/mission-control.ts`'s `runSeoAudit()`) through to
  `seoDepartment.runAudit()`.
