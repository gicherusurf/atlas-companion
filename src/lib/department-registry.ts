import type {
  Department,
  RegisterDepartmentInput,
  ListDepartmentsFilter,
  DepartmentCapability,
  DepartmentAction,
  DepartmentResult,
} from "@/types/department";

// Atlas Department Registry.
//
// The single source of truth for every department available in Atlas.
// Mission Control, the Workflow Engine/Runner, and future AI Agents must
// NEVER import a department directly (e.g. `import { seoDepartment }
// from "@/lib/seo-department"`) — they ask this registry instead, and the
// registry returns the correct department (or, for execution, dispatches
// to it on the caller's behalf). This is what keeps Atlas loosely
// coupled: a new department can be added by registering it here, without
// changing a single line of the Workflow Runner, Mission Control, or any
// other consumer.
//
// DESIGN RULE: the registry owns metadata. Departments own execution. The
// registry itself never contains business logic and never executes a
// department's actual code — see `executeAction()` below for exactly
// what that means in practice.
//
// Architecture: this file imports nothing from SEO, Marketing, Finance,
// Sales, Publishing, Knowledge, Discovery, the Crawler, Metadata
// Extraction, the Rule Engine, the Insight Engine, or any other
// department — present or future. It depends only on its own types
// (`src/types/department.ts`). Departments will depend on registering
// themselves with this registry; this registry never depends on any of
// them.
//
// Follows the same architecture as the other Atlas services: a plain
// object of methods (no class), no mock departments, `TODO(department-registry)`
// markers instead of real storage/dispatch. Read methods return
// `[]`/`null`/`false`; write methods throw.

function notImplemented(action: string): never {
  throw new Error(
    `DepartmentRegistry.${action} is not implemented yet — TODO(department-registry): wire this up.`,
  );
}

export const departmentRegistry = {
  /**
   * Purpose:
   * Registers a new department's metadata with Atlas, making it
   * discoverable to Mission Control, the Workflow Engine, and future AI
   * Agents without any of them importing the department's code.
   *
   * Future implementation:
   * TODO(department-registry): persist the department record (e.g.
   * `supabase.from("departments").insert(input).select().single()`),
   * validate that `input.name` is unique among registered departments,
   * and validate that every `DepartmentCapability.action` within
   * `input.capabilities` is unique within that department.
   *
   * Failure cases:
   * Should reject if a department with the same `name` is already
   * registered, or if `capabilities` contains duplicate `action` values.
   */
  async registerDepartment(_input: RegisterDepartmentInput): Promise<Department> {
    return notImplemented("registerDepartment");
  },

  /**
   * Purpose:
   * Removes a department's metadata from the registry, making it no
   * longer discoverable or executable through this registry.
   *
   * Future implementation:
   * TODO(department-registry): `supabase.from("departments").delete().eq("id", departmentId)`.
   * Should NOT cascade-delete any execution history (e.g. past
   * DepartmentResults, if those are ever persisted) — unregistering a
   * department is about discoverability going forward, not erasing what
   * it already did.
   *
   * Failure cases:
   * Should no-op (or reject, depending on desired strictness) if
   * `departmentId` doesn't match any registered department, rather than
   * silently succeeding in a way that hides a caller's mistake.
   */
  async unregisterDepartment(_departmentId: string): Promise<void> {
    return notImplemented("unregisterDepartment");
  },

  /**
   * Purpose:
   * Fetches a single department's metadata by id, for a caller that
   * already knows which department it wants (e.g. Mission Control
   * rendering a specific department's health card).
   *
   * Future implementation:
   * TODO(department-registry): `supabase.from("departments").select("*").eq("id", departmentId).maybeSingle()`.
   *
   * Failure cases:
   * Returns `null` if no department with that id is registered — this is
   * an expected, non-exceptional outcome, not an error.
   */
  async getDepartment(_departmentId: string): Promise<Department | null> {
    return null;
  },

  /**
   * Purpose:
   * Lists every registered department, optionally filtered by status —
   * e.g. so Mission Control can list only `"active"` departments, or an
   * admin view can list `"experimental"` ones separately.
   *
   * Future implementation:
   * TODO(department-registry): `supabase.from("departments").select("*").match(filter ?? {}).order("name")`.
   *
   * Failure cases:
   * Returns `[]` if no departments are registered, or none match
   * `filter` — never throws for "no results."
   */
  async listDepartments(_filter?: ListDepartmentsFilter): Promise<Department[]> {
    return [];
  },

  /**
   * Purpose:
   * A cheap existence check for a department, without fetching its full
   * metadata — useful for a caller that only needs to know "can I use
   * this department?" before deciding whether to build a full
   * `DepartmentAction`.
   *
   * Future implementation:
   * TODO(department-registry): a lighter-weight existence query than
   * `getDepartment()`, e.g. `supabase.from("departments").select("id", { count: "exact", head: true }).eq("id", departmentId)`.
   *
   * Failure cases:
   * Returns `false` for an unregistered (or unrecognized) department id —
   * never throws.
   */
  async hasDepartment(_departmentId: string): Promise<boolean> {
    return false;
  },

  /**
   * Purpose:
   * Invokes one capability of one department on the caller's behalf, so
   * Mission Control, the Workflow Runner, and future AI Agents never
   * need to import or directly call a department themselves. This is the
   * ONLY method on this registry that represents "doing work" rather
   * than "describing what's available" — and even this method does not
   * perform that work itself (see below).
   *
   * Future implementation:
   * TODO(department-registry): this method must NOT call a department
   * directly (e.g. it must never contain `import { seoAuditEngine } from
   * "@/lib/seo-audit-engine"`). Execution is expected to flow through a
   * separate resolver/dispatcher, in this order:
   *   1. resolve department — look up `action.department` in the
   *      registry to confirm it exists and is `"active"`
   *   2. validate action — confirm `action.action` matches one of that
   *      department's registered `DepartmentCapability.action` values
   *   3. forward request — hand `action.payload`/`businessId`/`jobId`/
   *      `metadata` to the resolved department's real implementation via
   *      the dispatcher (not a direct import here)
   *   4. return result — wrap whatever the department returned (or
   *      threw) into a standardized `DepartmentResult`, timing the call
   *      for `durationMs`
   * No switch statement over department names is intended here, even
   * once implemented — dispatch should be a lookup (e.g. into a registry
   * map populated by each department's own registration), not a
   * hardcoded branch per department.
   *
   * Failure cases:
   * Should produce a `DepartmentResult` with `success: false` and a
   * populated `error` — rather than throwing — for: an unknown
   * `department`, an unknown `action` for a known department, a
   * `disabled`/`deprecated` department, or the underlying department
   * implementation itself throwing. Today, since none of that dispatch
   * exists yet, this method throws unconditionally.
   */
  async executeAction(_action: DepartmentAction): Promise<DepartmentResult> {
    return notImplemented("executeAction");
  },

  /**
   * Purpose:
   * Lists every capability across every registered department — e.g. for
   * a future Workflow Engine UI letting an operator pick which action a
   * new WorkflowStep should invoke, without needing to know which
   * department it belongs to ahead of time.
   *
   * Future implementation:
   * TODO(department-registry): flatten `capabilities` across every
   * registered department (optionally filtered to `"active"` ones), most
   * likely implemented as a query joining departments to their
   * capabilities rather than fetching every department and flattening in
   * memory.
   *
   * Failure cases:
   * Returns `[]` if no departments (or no departments with any
   * capabilities) are registered.
   */
  async listCapabilities(): Promise<DepartmentCapability[]> {
    return [];
  },

  /**
   * Purpose:
   * Fetches a single capability by id — e.g. so a WorkflowStep referring
   * to a capability by id can display its name/description without the
   * caller needing to fetch and search through a whole Department record.
   *
   * Future implementation:
   * TODO(department-registry): `supabase.from("department_capabilities").select("*").eq("id", capabilityId).maybeSingle()`,
   * assuming capabilities are eventually normalized into their own table
   * rather than only ever nested inside a `Department` record.
   *
   * Failure cases:
   * Returns `null` if no capability with that id exists — expected and
   * non-exceptional, not an error.
   */
  async getCapability(_capabilityId: string): Promise<DepartmentCapability | null> {
    return null;
  },
};
