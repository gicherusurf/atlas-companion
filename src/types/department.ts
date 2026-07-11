// TODO(department-registry): once a real persistence layer exists, align
// this shape with the DB schema (e.g. via `supabase gen types
// typescript`) instead of hand-maintaining it.

export type DepartmentStatus = "active" | "disabled" | "experimental" | "deprecated";

/**
 * A single action a Department exposes — e.g. the SEO Department
 * exposing a "runMetadataAudit" capability. The Department Registry
 * stores this as metadata only; it has no knowledge of what `action`
 * actually does when invoked.
 */
export interface DepartmentCapability {
  id: string;
  name: string;
  description: string;
  /** The action identifier a DepartmentAction.action must match to invoke this capability. */
  action: string;
  version: string;
  metadata: Record<string, unknown>;
}

/**
 * Metadata describing a Department registered with Atlas. This is
 * intentionally metadata-only — the Department Registry never imports,
 * calls, or otherwise executes a Department's actual code. A Department
 * registers a description of itself here; its real implementation lives
 * entirely in its own module (e.g. `seo-department.ts`), which the
 * registry has no import of.
 */
export interface Department {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  status: DepartmentStatus;
  capabilities: DepartmentCapability[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Fields needed to register a new department. `id`, timestamps are set
 * by the registry.
 */
export type RegisterDepartmentInput = Omit<Department, "id" | "createdAt" | "updatedAt">;

/**
 * A request to invoke one department capability, as passed to
 * `departmentRegistry.executeAction()`. Callers (Mission Control, the
 * Workflow Runner, future AI Agents) build one of these instead of
 * importing and calling a department directly.
 */
export interface DepartmentAction {
  /** The Department.id (or Department.name) to invoke. */
  department: string;
  /** Must match a DepartmentCapability.action registered under that department. */
  action: string;
  payload: Record<string, unknown>;
  businessId: string;
  /** The Job (see `src/types/job.ts`) this action is being executed on behalf of, if any. */
  jobId?: string;
  metadata: Record<string, unknown>;
}

/**
 * The outcome of executing a DepartmentAction.
 */
export interface DepartmentResult {
  success: boolean;
  department: string;
  action: string;
  result: unknown;
  error?: string;
  durationMs: number;
}

/**
 * Optional filters for listDepartments().
 */
export interface ListDepartmentsFilter {
  status?: DepartmentStatus;
}
