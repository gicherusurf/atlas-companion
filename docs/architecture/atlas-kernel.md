# Atlas Kernel

This document describes the core, domain-agnostic modules that make up the
"kernel" of Atlas — the foundation every department (SEO, Marketing, Sales,
Finance, Content, Knowledge, etc.) is built on top of. Domain modules are
consumers of the kernel; the kernel must never depend on them.

## Modules

### Business DNA

The foundational identity of a business within Atlas: company profile
(name, website, industry, description, mission, vision, locale metadata),
products, markets, and strategic competitors.

- **Types:** `src/types/business.ts`
- **Service:** `src/lib/business-service.ts` (`businessService`)
- **UI:** `src/routes/_authenticated/business-dna.tsx`,
  `src/components/business/*`

Atlas is multi-business: a single organization can own more than one
business, each with its own Business DNA. Every method on `businessService`
is scoped by `businessId` (e.g. `getBusiness(businessId)`,
`listProducts(businessId)`), and `BusinessProfile.organizationId` links a
business back to its owning org. The current UI only manages one
selected business at a time (via a placeholder `CURRENT_BUSINESS_ID`) —
organization/business switching is not yet implemented, but the service
layer doesn't need to change when it is.

The **strategic business competitors** tracked here are a distinct concept
from the SEO/Market Intelligence "Competitors" module (search competitors,
keyword rankings, backlinks) — the two are intentionally not merged.

### Website Discovery Service

The first backend service for the Website Discovery Engine (Epic 2 /
Sprint 1). Discovers what exists at a business's website.

- **Types:** `src/types/website-discovery.ts`
- **Service:** `src/lib/website-discovery-service.ts`
  (`websiteDiscoveryService`)

Exposes four methods, each scoped by `businessId`:
`discoverWebsite` (reachability, redirects, HTTPS, status, timing),
`discoverRobotsTxt` (existence, content, sitemap URLs),
`discoverSitemap` (existence, URL list, URL count), and
`discoverHomepage` (title, meta description, canonical URL, language, H1,
Open Graph tags).

No real crawling is implemented yet. Every method throws with a
`TODO(crawl)` comment describing exactly what the real implementation
should do — there is no mock data standing in for real results.

### Discovery Orchestrator

Coordinates the Website Discovery pipeline as a strict, ordered sequence:

```
Reachability → Robots → Sitemap → Page Discovery → Homepage Metadata → Persist Results
```

- **Types:** `src/types/discovery-orchestrator.ts`
- **Service:** `src/lib/discovery-orchestrator.ts` (`discoveryOrchestrator`)

`discoveryOrchestrator.run(businessId)` walks the pipeline **fail-fast**:
the first failed stage stops execution, and every stage after it is
recorded as `"skipped"` rather than attempted. The four stages backed by
`websiteDiscoveryService` call it directly; **Page Discovery** and
**Persist Results** don't have a backing service yet (`TODO(page-discovery-service)`
and `TODO(persistence-layer)` respectively) but are represented in the
pipeline so its shape is already correct.

The orchestrator returns a `DiscoveryRunResult`: overall `status`
(`success` / `partial` / `failed`), `completedStages`, `failedStage`,
total `durationMs`, and a `nextRecommendedAction` hint derived from which
stage failed (e.g. `reachability` failing → `check_website_reachability`).

This module **only orchestrates** — it contains no crawling logic itself.

### Job Manager

A generic service for tracking asynchronous work across every Atlas
department — not specific to SEO. Every future department (SEO Audit,
Content Generation, Publishing, Keyword Research, Competitor Analysis,
Marketing, Finance, Sales, etc.) is expected to use it for lifecycle
tracking rather than inventing its own.

- **Types:** `src/types/job.ts`
- **Service:** `src/lib/job-manager.ts` (`jobManager`)

A `Job` carries: `id`, `businessId`, `category` (`SEO` / `MARKETING` /
`SALES` / `FINANCE` / `CONTENT` / `KNOWLEDGE` / `SYSTEM`), `type`
(`website-discovery`, `seo-audit`, `keyword-research`,
`competitor-analysis`, `content-generation`, `publishing`), `priority`
(`low` / `normal` / `high` / `critical`), `status` (`queued` / `running` /
`completed` / `failed` / `cancelled` / `retrying`), `progress`,
`currentStage`, timestamps, `attempts` / `maxAttempts`, `initiatedBy`
(`user` / `system` / `workflow` / `ai-agent` / `schedule`),
`assignedAgent`, `result`, `error`, and free-form `metadata`.

`jobManager` exposes `createJob`, `getJob`, `listJobs`, `updateJob`,
`startJob`, `completeJob`, `failJob`, `cancelJob`, `retryJob`, and
`deleteJob` — all scoped by `businessId`. It is intentionally
domain-agnostic: it has zero imports from any domain module, and it does
not execute jobs itself (e.g. it never calls `discoveryOrchestrator.run()`
directly) — it only tracks lifecycle state. A future worker/queue is
expected to create a job, mark it `running`, do the actual work, then call
`completeJob`/`failJob` with the outcome.

No persistence exists yet: list/get methods return empty/`null`, mutating
methods throw, all marked with `TODO(supabase)` comments showing the exact
intended query.

### Event Bus

The generic, in-process communication layer between Atlas modules. Modules
publish events instead of calling each other directly — e.g. `JobManager`
publishes `JobCompleted` rather than knowing who cares about it, and
whichever module needs to react subscribes instead.

- **Types:** `src/types/event.ts`
- **Service:** `src/lib/event-bus.ts` (`eventBus` singleton)

An `AtlasEvent<TName>` carries `id`, `name`, `category` (`SYSTEM` /
`BUSINESS` / `SEO` / `MARKETING` / `CONTENT` / `FINANCE` / `KNOWLEDGE` /
`WORKFLOW`), `source` (`BusinessService` / `JobManager` /
`DiscoveryOrchestrator` / `WebsiteDiscoveryService` / `WorkflowEngine` /
`AIAgent` / `MissionControl`), `businessId`, optional `jobId`, `payload`,
`timestamp`, and a `version`. `AtlasEventPayloadMap` gives strong,
per-event payload typing for Atlas's common events (`BusinessCreated`,
`BusinessUpdated`, `BusinessDeleted`, `JobCreated`, `JobStarted`,
`JobCompleted`, `JobFailed`, `DiscoveryStarted`, `DiscoveryCompleted`,
`DiscoveryFailed`) while still allowing any module to publish custom event
names beyond that set.

`eventBus` exposes `publish`, `subscribe` (returns an unsubscribe
function), `unsubscribe`, `subscribeCategory`, and `clear`. It runs fully
in-process — no Supabase, Redis, queues, or WebSockets — backed by plain
`Map`/`Set` structures, and one subscriber throwing never breaks delivery
to the others.

> **Note:** the type is named `AtlasEvent` rather than the plainer `Event`,
> specifically to avoid shadowing the global DOM `Event` type, which would
> create confusing type errors in any file that also handles browser
> events.

The Event Bus itself has no domain-specific logic and doesn't currently
have any publishers wired up — `BusinessService`, `JobManager`, and
`DiscoveryOrchestrator` don't yet call `eventBus.publish()` anywhere. That
wiring is a natural next step, not yet done.

## Conventions across the kernel

- **Plain objects, not classes**, for every service (`businessService`,
  `websiteDiscoveryService`, `discoveryOrchestrator`, `jobManager`) — with
  the single exception of `eventBus`, which is a singleton instance of an
  internal class (`AtlasEventBus`), exported pre-instantiated so it's
  still consumed the same way as the others.
- **Scoped by `businessId`** everywhere multi-business correctness
  matters, in line with Business DNA's multi-business architecture.
- **No mock data.** Until real persistence/crawling exists, read methods
  return empty results (`[]` / `null`) and write methods throw, each with
  a `TODO(supabase)` / `TODO(crawl)` comment describing exactly what the
  real implementation should do.
- **Strong typing throughout**, including generics where they earn their
  keep (e.g. `AtlasEvent<TName>` resolving to the correct payload type
  per event name).
- **Modules don't reach into each other's domains.** The kernel modules
  (Job Manager, Event Bus) have zero imports from domain modules (SEO,
  discovery), and domain modules are expected to depend on the kernel, not
  the other way around.

## What's not built yet

- Real Supabase persistence for any of the above (Business DNA, Jobs,
  Discovery results).
- Real crawling/HTTP logic in `websiteDiscoveryService`.
- The "Page Discovery" and "Persist Results" stages of the Discovery
  Orchestrator (no backing service exists for either yet).
- Any module actually publishing to, or subscribing from, the Event Bus.
- Organization/business switching UI (Business DNA's multi-business
  architecture is ready for it; the UI still hardcodes a single business).
