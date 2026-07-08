// TODO: once Supabase tables exist, generate/align these with the DB schema
// (e.g. via `supabase gen types typescript`) instead of hand-maintaining them.

/**
 * Which Atlas department a job belongs to. Generic on purpose — Job
 * Manager itself has no department-specific logic; this is just a label
 * consumers use to filter/group their own jobs.
 */
export type JobCategory =
  | "SEO"
  | "MARKETING"
  | "SALES"
  | "FINANCE"
  | "CONTENT"
  | "KNOWLEDGE"
  | "SYSTEM";

/**
 * The specific kind of work a job represents. Extend this union as new
 * async workloads are introduced across Atlas.
 */
export type JobType =
  | "website-discovery"
  | "seo-audit"
  | "keyword-research"
  | "competitor-analysis"
  | "content-generation"
  | "publishing";

export type JobPriority = "low" | "normal" | "high" | "critical";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying";

/**
 * What triggered a job's creation.
 */
export type JobInitiator = "user" | "system" | "workflow" | "ai-agent" | "schedule";

/**
 * A unit of trackable async work, scoped to a business. Job Manager is
 * completely generic: it knows nothing about SEO, website discovery, or
 * any other domain — it only manages lifecycle (queued -> running ->
 * completed/failed/cancelled, with retries). Domain modules (Website
 * Discovery, SEO Audit, etc.) are consumers of this type and service, not
 * the other way around.
 */
export interface Job {
  id: string;
  businessId: string;
  category: JobCategory;
  type: JobType;
  priority: JobPriority;
  status: JobStatus;
  /** 0-100. Left to the caller to update via updateJob() as work progresses. */
  progress: number;
  /** Free-form label for what the job is currently doing, e.g. "Fetching sitemap". */
  currentStage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  /** Wall-clock duration once completed/failed/cancelled; null while in flight. */
  durationMs: number | null;
  attempts: number;
  maxAttempts: number;
  initiatedBy: JobInitiator;
  /** Identifier of the agent (human or AI) actively working the job, if any. */
  assignedAgent: string | null;
  result: unknown | null;
  error: string | null;
  /** Arbitrary domain-specific data the consumer wants attached to the job. */
  metadata: Record<string, unknown>;
}

/**
 * Fields required to enqueue a new job. Lifecycle fields (status, progress,
 * timestamps, attempts, result, error) are set by the service, not the
 * caller.
 */
export interface CreateJobInput {
  businessId: string;
  category: JobCategory;
  type: JobType;
  priority?: JobPriority;
  maxAttempts?: number;
  initiatedBy: JobInitiator;
  assignedAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fields that can be patched on a job outside of a lifecycle transition
 * (e.g. progress ticks, reassigning an agent). Status changes go through
 * the dedicated lifecycle methods (startJob, completeJob, failJob,
 * cancelJob, retryJob) instead.
 */
export type UpdateJobInput = Partial<
  Pick<Job, "progress" | "currentStage" | "priority" | "assignedAgent" | "metadata">
>;

/**
 * Optional filters for listJobs().
 */
export interface ListJobsFilter {
  category?: JobCategory;
  type?: JobType;
  status?: JobStatus;
}
