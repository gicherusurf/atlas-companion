// TODO(workflow): once a real persistence layer exists, align this shape
// with the DB schema (e.g. via `supabase gen types typescript`) instead
// of hand-maintaining it.

export type WorkflowStatus =
  | "draft"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type WorkflowStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

/**
 * A single step within a Workflow. A step names a department and an
 * action on that department to invoke (e.g. department: "SEO", action:
 * "runMetadataAudit") — the Workflow Engine itself has no knowledge of
 * what that action does; it only sequences and tracks steps.
 */
export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  /** Which Department executes this step, e.g. "SEO", "Marketing". */
  department: string;
  /** The action on that department to invoke, e.g. "runMetadataAudit". */
  action: string;
  status: WorkflowStepStatus;
  /** Position in the workflow's sequence. Lower runs first. */
  order: number;
  /** IDs of steps that must be "completed" before this step can run. */
  dependsOn: string[];
  /** Maximum time (ms) this step is allowed to run before being considered failed. */
  timeout: number;
  /** How many times this step may be retried after failing. */
  retryLimit: number;
  metadata: Record<string, unknown>;
}

/**
 * A reusable, ordered sequence of steps across one or more Departments,
 * scoped to a business. A Workflow is a definition — see
 * `WorkflowExecution` for the record of actually running one.
 */
export interface Workflow {
  id: string;
  businessId: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields needed to create a new workflow. `id`, `status` (starts as
 * `"draft"`), timestamps are set by the service. Each supplied step
 * should have `status: "pending"`.
 */
export type CreateWorkflowInput = Omit<
  Workflow,
  "id" | "status" | "startedAt" | "completedAt" | "createdAt" | "updatedAt"
>;

/**
 * Optional filters for listWorkflows().
 */
export interface ListWorkflowsFilter {
  status?: WorkflowStatus;
}

/**
 * The live execution state of a single Workflow run — as opposed to
 * `Workflow` itself, which is the (potentially reusable) definition.
 */
export interface WorkflowExecution {
  workflowId: string;
  /** The step currently running, or null if none is (e.g. not started, paused, or finished). */
  currentStep: string | null;
  /** IDs of steps that have finished successfully, in completion order. */
  completedSteps: string[];
  /** The step that caused the workflow to fail, or null if it hasn't failed. */
  failedStep: string | null;
  status: WorkflowStatus;
  durationMs: number | null;
  startedAt: string | null;
  completedAt: string | null;
}
