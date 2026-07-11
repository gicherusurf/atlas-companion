import type {
  Workflow,
  CreateWorkflowInput,
  ListWorkflowsFilter,
  WorkflowExecution,
} from "@/types/workflow";

// Atlas Workflow Engine.
//
// Orchestrates work across Atlas. It performs NO business logic of its
// own — it coordinates existing modules. Mission Control starts
// workflows; Departments execute the actual work each step names; the
// Workflow Engine only tracks execution (sequencing steps, respecting
// dependencies, recording status) — analogous to how the Discovery
// Orchestrator coordinates Website Discovery Service without containing
// discovery logic itself.
//
// This file (`workflow-engine.ts`) is the lifecycle/CRUD layer: creating,
// starting, pausing, resuming, cancelling, and querying workflows. The
// actual step-by-step execution mechanics live in `workflow-runner.ts`,
// which this file's `runWorkflow()` is expected to delegate to once
// implemented.
//
// Architecture: the Workflow Engine imports nothing from any Department
// (SEO, Marketing, Finance, etc.), and no Department imports the Workflow
// Engine. A WorkflowStep names a department and action as plain strings
// (see `src/types/workflow.ts`) — the Workflow Engine never imports a
// department's code to "know" what an action does; it only sequences and
// tracks steps by name. Mission Control is the intended caller that
// starts workflows; the Workflow Engine coordinates; Departments execute.
//
// Follows the same architecture as the other Atlas services: a plain
// object of methods (no class), no mock workflows, `TODO(workflow)`
// markers instead of real persistence. Read methods return `[]`/`null`;
// write methods throw.

function notImplemented(action: string): never {
  throw new Error(`WorkflowEngine.${action} is not implemented yet — TODO(workflow): wire this up.`);
}

export const workflowEngine = {
  /**
   * Creates a new workflow definition for a business, in `"draft"`
   * status.
   */
  async createWorkflow(_input: CreateWorkflowInput): Promise<Workflow> {
    // TODO(workflow): supabase.from("workflows").insert({
    //   ...input,
    //   status: "draft",
    // }).select().single()
    return notImplemented("createWorkflow");
  },

  /**
   * Starts executing a workflow. Intended to delegate the actual
   * step-by-step execution to `workflowRunner.run()`, after transitioning
   * the workflow to `"running"` and stamping `startedAt`.
   */
  async runWorkflow(_workflowId: string): Promise<WorkflowExecution> {
    // TODO(workflow):
    //   1. supabase.from("workflows").update({ status: "running", started_at: new Date().toISOString() }).eq("id", workflowId)
    //   2. delegate to workflowRunner.run(workflowId) for actual step
    //      execution (see workflow-runner.ts)
    return notImplemented("runWorkflow");
  },

  /**
   * Pauses a running workflow after its current step finishes, without
   * marking it failed or cancelled.
   */
  async pauseWorkflow(_workflowId: string): Promise<Workflow> {
    // TODO(workflow): supabase.from("workflows").update({ status: "paused" })
    //   .eq("id", workflowId).select().single()
    return notImplemented("pauseWorkflow");
  },

  /**
   * Resumes a paused workflow from wherever it left off.
   */
  async resumeWorkflow(_workflowId: string): Promise<WorkflowExecution> {
    // TODO(workflow): supabase.from("workflows").update({ status: "running" })
    //   .eq("id", workflowId), then delegate back to workflowRunner.run()
    //   to continue from the first non-completed step.
    return notImplemented("resumeWorkflow");
  },

  /**
   * Cancels a workflow, regardless of whether it's running or paused.
   */
  async cancelWorkflow(_workflowId: string): Promise<Workflow> {
    // TODO(workflow): supabase.from("workflows").update({
    //   status: "cancelled",
    //   completed_at: new Date().toISOString(),
    // }).eq("id", workflowId).select().single()
    return notImplemented("cancelWorkflow");
  },

  /**
   * Fetches a single workflow by id, scoped to the business it belongs
   * to.
   */
  async getWorkflow(_businessId: string, _workflowId: string): Promise<Workflow | null> {
    // TODO(workflow): supabase.from("workflows").select("*")
    //   .eq("id", workflowId).eq("business_id", businessId).maybeSingle()
    return null;
  },

  /**
   * Lists workflows for a business, optionally filtered by status.
   */
  async listWorkflows(_businessId: string, _filter?: ListWorkflowsFilter): Promise<Workflow[]> {
    // TODO(workflow): supabase.from("workflows").select("*")
    //   .eq("business_id", businessId)
    //   .match(filter ?? {})
    //   .order("created_at", { ascending: false })
    return [];
  },

  /**
   * Permanently deletes a workflow definition.
   */
  async deleteWorkflow(_businessId: string, _workflowId: string): Promise<void> {
    // TODO(workflow): supabase.from("workflows").delete()
    //   .eq("id", workflowId).eq("business_id", businessId)
    return notImplemented("deleteWorkflow");
  },
};
