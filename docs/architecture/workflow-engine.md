# Atlas Workflow Engine

## Purpose

The Workflow Engine orchestrates work across Atlas. It performs **no
business logic of its own** — it coordinates modules that already exist.
The division of responsibility is strict and deliberate:

- **Mission Control starts workflows.** A human operator (or, later, an
  AI Agent) decides a workflow should run; Mission Control is the
  entry point for that decision.
- **The Workflow Engine orchestrates.** It sequences steps, respects
  dependencies between them, tracks status, and handles failure —
  without knowing or caring what any individual step actually does.
- **Departments execute.** The real work — running an SEO audit,
  generating content, evaluating a rule — happens inside whichever
  Department a step names. The Workflow Engine never contains that logic
  itself.

## Architecture

Two files, mirroring the same split established by
`discovery-orchestrator.ts` / `website-discovery-service.ts` and
`seo-department.ts` / `seo-audit-engine.ts`:

- **`workflow-engine.ts`** (`workflowEngine`) — the lifecycle/CRUD layer:
  `createWorkflow`, `runWorkflow`, `pauseWorkflow`, `resumeWorkflow`,
  `cancelWorkflow`, `getWorkflow`, `listWorkflows`, `deleteWorkflow`.
- **`workflow-runner.ts`** (`workflowRunner`) — the actual step-execution
  mechanics: `run`, `runStep`, `skipStep`, `retryStep`, `completeStep`,
  `failStep`. `workflowEngine.runWorkflow()` is expected to delegate to
  `workflowRunner.run()` once both are implemented.

**A `WorkflowStep` names a department and action as plain strings** (e.g.
`{ department: "SEO", action: "runMetadataAudit" }`), not as a direct
import. This is the mechanism that keeps the architecture rule real at
runtime, not just at the type level: the Workflow Engine and Workflow
Runner are expected to resolve a step's department/action through a
registry or lookup table, never through `import { seoAuditEngine } from
"@/lib/seo-audit-engine"` inside this module. **The Workflow Engine
imports nothing from Departments; Departments never import the Workflow
Engine.** Neither file in this module imports from any Department today,
and that must remain true even once execution is implemented.

## Workflow Lifecycle

A `Workflow` moves through seven statuses:

1. **draft** — being authored; not yet ready to run.
2. **ready** — fully defined and eligible to be started.
3. **running** — `workflowEngine.runWorkflow()` has been called and steps
   are executing.
4. **paused** — execution suspended after the current step finishes;
   resumable via `resumeWorkflow()`.
5. **completed** — every step finished successfully.
6. **failed** — a step failed and the workflow did not recover (see Step
   Lifecycle below).
7. **cancelled** — explicitly stopped via `cancelWorkflow()`, regardless
   of whether it was running or paused.

`getWorkflow()` and `listWorkflows()` provide read access at any point in
this lifecycle; `deleteWorkflow()` removes a definition permanently.

## Step Lifecycle

Each `WorkflowStep` independently moves through five statuses: **pending
→ running → completed**, or **pending → running → failed**, with
**skipped** available as an alternative to running a step at all (e.g.
because a dependency failed, or an operator explicitly chose to skip it).

Steps declare `dependsOn` — the IDs of other steps that must reach
`"completed"` before they're eligible to run. This is what lets a
workflow express real dependency graphs (not just a flat sequence)
without the Workflow Engine needing to understand *why* one step depends
on another.

Failure handling follows the same fail-fast discipline established by the
Discovery Orchestrator: a failed step is expected to halt the overall
workflow (transitioning it to `"failed"`) rather than silently continuing
to later steps, unless a future revision explicitly introduces
softer-failure semantics. `retryStep()` is the sanctioned way to attempt
a failed step again, bounded by that step's `retryLimit`.

## Relationship with Job Manager

The Workflow Engine does not replace Job Manager — it is expected to sit
on top of it. Each step (or, depending on granularity, the workflow run
as a whole) is a natural candidate to be tracked as a real `Job`:
`workflowRunner.runStep()` is documented to eventually call
`jobManager.createJob()` / `startJob()` / `completeJob()` / `failJob()`
around a department action, the same way any other async work in Atlas
is tracked. This isn't implemented yet — see the `TODO(workflow-runner)`
comments in `workflow-runner.ts` for exactly where this integration
belongs.

## Relationship with Event Bus

Workflow and step transitions are expected to be published as events —
a workflow starting, a step completing or failing, a workflow reaching a
terminal state — so other modules (a future Scheduler, an AI Agent,
Mission Control) can react without polling `workflowEngine.getWorkflow()`
repeatedly. No publishing is wired up yet; every relevant method's
documentation names the specific event it should eventually emit.

## Relationship with Mission Control

Mission Control is the intended **starting point** for workflows — a
Quick Action, or a future "Workflows" section, calling
`workflowEngine.createWorkflow()` then `runWorkflow()`. It is also the
intended **display surface** for workflow progress, the same way
`RunningJobs` (`src/components/mission-control/RunningJobs.tsx`) already
displays Job Manager's jobs — a workflow's `currentStep`,
`completedSteps`, and `failedStep` (from `WorkflowExecution`) are shaped
specifically to make that kind of display straightforward once wired up.
Mission Control never orchestrates workflow steps itself; it only starts
workflows and reads their status.

## Future AI Agent Integration

An AI Agent (per `docs/vision/atlas-platform-v2.md`'s AI Agents section)
is expected to interact with the Workflow Engine the same way Mission
Control does — as a starter and observer of workflows, never as a
bypass around it. An agent deciding "this business needs a full SEO
review" would create and run a workflow composed of existing Department
steps, rather than calling Department methods directly and managing
sequencing itself. This keeps agent-initiated work exactly as observable
and auditable as human-initiated work, consistent with the "Agents never
bypass the platform" principle.

## Future Scheduler Integration

A future Scheduler (see "Planned kernel modules" in
`docs/architecture/atlas-kernel.md`) is expected to be a third starter of
workflows alongside Mission Control and AI Agents — e.g. "run this
workflow every Monday at 9am" — by calling the exact same
`workflowEngine.createWorkflow()` / `runWorkflow()` methods on a timer,
rather than the Workflow Engine needing any built-in scheduling concept
of its own. This is precisely why `runWorkflow()` doesn't take a "why"
or "who triggered this" parameter beyond what's already trackable via
Job Manager's `initiatedBy` field once that integration exists — the
Workflow Engine stays agnostic about *who* starts a workflow, whether
that's a human, an agent, or a scheduled timer.
