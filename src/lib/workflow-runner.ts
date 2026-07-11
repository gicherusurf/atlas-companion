import type { WorkflowExecution, WorkflowStep } from "@/types/workflow";

// Atlas Workflow Runner.
//
// Where the actual step-by-step execution mechanics of a Workflow will
// live — as opposed to `workflow-engine.ts`, which only manages workflow
// lifecycle (create/pause/resume/cancel/query). None of these methods
// execute anything yet: every one throws with a `TODO(workflow-runner)`
// comment describing exactly how it will eventually integrate with Job
// Manager, the Event Bus, Mission Control, and Departments.
//
// This file has no imports from any Department (SEO, Marketing, Finance,
// etc.) — a WorkflowStep only names a department and action as plain
// strings (see `src/types/workflow.ts`); the Workflow Runner is expected
// to dispatch to whichever department a step names via a registry/lookup
// mechanism once implemented, never via a direct import of that
// department's code. This keeps the "Workflow Engine imports nothing from
// Departments; Departments never import Workflow Engine" rule intact even
// at execution time, not just at the type level.

function notImplemented(action: string): never {
  throw new Error(
    `WorkflowRunner.${action} is not implemented yet — TODO(workflow-runner): wire this up.`,
  );
}

export const workflowRunner = {
  /**
   * Runs an entire workflow from its current position to completion (or
   * to its first failure), executing steps in `order`, respecting each
   * step's `dependsOn`.
   *
   * Future integration:
   * - **Job Manager** — each step (or the workflow run as a whole) is a
   *   natural candidate to be tracked as a real Job via
   *   `jobManager.createJob()`/`startJob()`/`completeJob()`/`failJob()`,
   *   so workflow progress is visible the same way any other async work
   *   in Atlas is.
   * - **Event Bus** — publish a `WorkflowStarted`-style event when a run
   *   begins, and a completion/failure event when it ends, so other
   *   modules can react without polling.
   * - **Mission Control** — workflow status is expected to surface on the
   *   dashboard the same way Job Manager's jobs already do (see
   *   `RunningJobs` in `src/components/mission-control/`).
   * - **Departments** — each step's `department`/`action` pair is
   *   resolved through a registry (not a direct import) to the actual
   *   department method to call — e.g. `{ department: "SEO", action:
   *   "runMetadataAudit" }` eventually resolving to
   *   `seoAuditEngine.runMetadataAudit(businessId)`.
   */
  async run(_workflowId: string): Promise<WorkflowExecution> {
    // TODO(workflow-runner): loop over the workflow's steps in `order`,
    // skipping any whose `dependsOn` aren't all "completed" yet (or
    // failing the run, depending on desired semantics), calling
    // runStep() for each and stopping at the first failure (fail-fast,
    // matching the Discovery Orchestrator's pattern).
    return notImplemented("run");
  },

  /**
   * Executes a single workflow step by resolving its `department`/
   * `action` to a real department method and invoking it.
   *
   * Future integration:
   * - **Job Manager** — a step's execution is a natural unit to wrap in
   *   its own Job, so a single step's progress/failure is independently
   *   trackable, not just the workflow as a whole.
   * - **Event Bus** — publish a step-started event before invoking the
   *   department action, and a step-completed/failed event after.
   * - **Mission Control** — surface which step of which workflow is
   *   currently running, for a business.
   * - **Departments** — this is the method that actually calls into a
   *   Department (e.g. `seoDepartment.runAudit()`), via a registry
   *   lookup keyed by `step.department` + `step.action` rather than a
   *   direct import, so the Workflow Runner never needs to know which
   *   departments exist at compile time.
   */
  async runStep(_workflowId: string, _stepId: string): Promise<WorkflowStep> {
    // TODO(workflow-runner): look up the step, resolve its
    // department/action via a registry, invoke it (respecting `timeout`),
    // and call completeStep()/failStep() based on the outcome.
    return notImplemented("runStep");
  },

  /**
   * Marks a step as `"skipped"` without executing it — e.g. because its
   * dependencies failed, or an operator chose to skip it.
   *
   * Future integration:
   * - **Job Manager** — no Job is created for a skipped step.
   * - **Event Bus** — publish a step-skipped event so downstream
   *   consumers (e.g. an analytics view of workflow runs) can
   *   distinguish "skipped" from "never reached."
   * - **Mission Control** — display skipped steps distinctly from
   *   completed/failed ones.
   * - **Departments** — not invoked at all for a skipped step.
   */
  async skipStep(_workflowId: string, _stepId: string): Promise<WorkflowStep> {
    // TODO(workflow-runner): supabase.from("workflow_steps").update({ status: "skipped" })
    //   .eq("id", stepId).eq("workflow_id", workflowId).select().single()
    return notImplemented("skipStep");
  },

  /**
   * Re-attempts a previously failed step, provided it hasn't exceeded its
   * `retryLimit`.
   *
   * Future integration:
   * - **Job Manager** — mirrors `jobManager.retryJob()`'s semantics
   *   (reject/no-op once attempts are exhausted); a retried step likely
   *   creates a new Job attempt rather than reusing the failed one.
   * - **Event Bus** — publish a step-retrying event.
   * - **Mission Control** — surface retry count/remaining attempts for a
   *   step.
   * - **Departments** — re-invokes the same department/action as the
   *   original attempt, via runStep().
   */
  async retryStep(_workflowId: string, _stepId: string): Promise<WorkflowStep> {
    // TODO(workflow-runner): verify the step's retry count is below
    // retryLimit, then delegate back to runStep() for another attempt.
    return notImplemented("retryStep");
  },

  /**
   * Marks a step as `"completed"`, recording whatever result the
   * department action produced.
   *
   * Future integration:
   * - **Job Manager** — mirrors `jobManager.completeJob()`.
   * - **Event Bus** — publish a step-completed event; if this was the
   *   workflow's last step, this is also where the overall workflow's
   *   completion should be triggered.
   * - **Mission Control** — reflected in workflow progress.
   * - **Departments** — this method is called BY run()/runStep() after a
   *   department action succeeds; it never calls into a department
   *   itself.
   */
  async completeStep(_workflowId: string, _stepId: string, _result?: unknown): Promise<WorkflowStep> {
    // TODO(workflow-runner): supabase.from("workflow_steps").update({
    //   status: "completed",
    //   metadata: { ...existingMetadata, result },
    // }).eq("id", stepId).eq("workflow_id", workflowId).select().single()
    return notImplemented("completeStep");
  },

  /**
   * Marks a step as `"failed"`, recording the error. Depending on the
   * workflow's semantics, this may also transition the overall workflow
   * to `"failed"` (fail-fast), matching the Discovery Orchestrator's
   * established pattern.
   *
   * Future integration:
   * - **Job Manager** — mirrors `jobManager.failJob()`.
   * - **Event Bus** — publish a step-failed (and, if fail-fast, a
   *   workflow-failed) event.
   * - **Mission Control** — surface the failed step and error to the
   *   operator.
   * - **Departments** — this method is called BY run()/runStep() after a
   *   department action throws or times out; it never calls into a
   *   department itself.
   */
  async failStep(_workflowId: string, _stepId: string, _error: string): Promise<WorkflowStep> {
    // TODO(workflow-runner): supabase.from("workflow_steps").update({
    //   status: "failed",
    //   metadata: { ...existingMetadata, error },
    // }).eq("id", stepId).eq("workflow_id", workflowId).select().single()
    return notImplemented("failStep");
  },
};
