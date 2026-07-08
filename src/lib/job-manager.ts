import type {
  Job,
  CreateJobInput,
  UpdateJobInput,
  ListJobsFilter,
} from "@/types/job";

// Atlas Job Manager.
//
// A generic service for tracking asynchronous work across every Atlas
// department (Website Discovery, SEO Audit, Content Generation, Publishing,
// Keyword Research, Competitor Analysis, Marketing, Finance, Sales, and any
// future department). Follows the same architecture as `business-service.ts`
// and `website-discovery-service.ts`:
//   - a plain object of async methods (no class)
//   - every method scoped by `businessId`
//   - TODO(supabase) markers instead of persistence: list/get return
//     empty/null, mutations throw, until a real `jobs` table exists
//   - no mock data, no queues, no workers, no frontend
//
// Job Manager is intentionally domain-agnostic: it has no knowledge of SEO,
// website discovery, or any other module. Those modules will create and
// drive jobs through this service; this file must never import from them.

function notImplemented(action: string): never {
  throw new Error(`JobManager.${action} is not implemented yet — TODO(supabase): wire this up.`);
}

export const jobManager = {
  /**
   * Enqueues a new job in "queued" status for a business.
   */
  async createJob(_input: CreateJobInput): Promise<Job> {
    // TODO(supabase): supabase.from("jobs").insert({
    //   business_id: input.businessId,
    //   category: input.category,
    //   type: input.type,
    //   priority: input.priority ?? "normal",
    //   status: "queued",
    //   progress: 0,
    //   current_stage: null,
    //   attempts: 0,
    //   max_attempts: input.maxAttempts ?? 3,
    //   initiated_by: input.initiatedBy,
    //   assigned_agent: input.assignedAgent ?? null,
    //   metadata: input.metadata ?? {},
    // }).select().single()
    return notImplemented("createJob");
  },

  /**
   * Fetches a single job by id, scoped to the business it belongs to.
   */
  async getJob(_businessId: string, _jobId: string): Promise<Job | null> {
    // TODO(supabase): supabase.from("jobs").select("*")
    //   .eq("id", jobId).eq("business_id", businessId).maybeSingle()
    return null;
  },

  /**
   * Lists jobs for a business, optionally filtered by category, type, or
   * status.
   */
  async listJobs(_businessId: string, _filter?: ListJobsFilter): Promise<Job[]> {
    // TODO(supabase): supabase.from("jobs").select("*")
    //   .eq("business_id", businessId)
    //   .match(filter ?? {})
    //   .order("created_at", { ascending: false })
    return [];
  },

  /**
   * Patches non-lifecycle fields on a job (progress, currentStage,
   * priority, assignedAgent, metadata). Use startJob/completeJob/failJob/
   * cancelJob/retryJob for status transitions instead.
   */
  async updateJob(_businessId: string, _jobId: string, _input: UpdateJobInput): Promise<Job> {
    // TODO(supabase): supabase.from("jobs").update(input)
    //   .eq("id", jobId).eq("business_id", businessId).select().single()
    return notImplemented("updateJob");
  },

  /**
   * Transitions a queued (or retrying) job to "running" and stamps
   * startedAt.
   */
  async startJob(_businessId: string, _jobId: string): Promise<Job> {
    // TODO(supabase): supabase.from("jobs").update({
    //   status: "running",
    //   started_at: new Date().toISOString(),
    // }).eq("id", jobId).eq("business_id", businessId).select().single()
    return notImplemented("startJob");
  },

  /**
   * Marks a job "completed", attaching its result and stamping
   * completedAt/durationMs.
   */
  async completeJob(_businessId: string, _jobId: string, _result: unknown): Promise<Job> {
    // TODO(supabase): fetch the job for startedAt, then:
    // supabase.from("jobs").update({
    //   status: "completed",
    //   progress: 100,
    //   result,
    //   completed_at: new Date().toISOString(),
    //   duration_ms: /* completedAt - startedAt */,
    // }).eq("id", jobId).eq("business_id", businessId).select().single()
    return notImplemented("completeJob");
  },

  /**
   * Marks a job "failed", attaching an error message and stamping
   * completedAt/durationMs.
   */
  async failJob(_businessId: string, _jobId: string, _error: string): Promise<Job> {
    // TODO(supabase): fetch the job for startedAt, then:
    // supabase.from("jobs").update({
    //   status: "failed",
    //   error,
    //   completed_at: new Date().toISOString(),
    //   duration_ms: /* completedAt - startedAt */,
    // }).eq("id", jobId).eq("business_id", businessId).select().single()
    return notImplemented("failJob");
  },

  /**
   * Cancels a job. Should reject/no-op once the real implementation exists
   * if the job is already in a terminal state (completed/failed/cancelled).
   */
  async cancelJob(_businessId: string, _jobId: string): Promise<Job> {
    // TODO(supabase): guard against cancelling a job already in a terminal
    // state, then:
    // supabase.from("jobs").update({
    //   status: "cancelled",
    //   completed_at: new Date().toISOString(),
    // }).eq("id", jobId).eq("business_id", businessId).select().single()
    return notImplemented("cancelJob");
  },

  /**
   * Re-queues a failed job for another attempt (status -> "retrying", then
   * eventually "queued"), incrementing attempts. Should reject/no-op once
   * `attempts >= maxAttempts`.
   */
  async retryJob(_businessId: string, _jobId: string): Promise<Job> {
    // TODO(supabase): fetch the job, verify attempts < maxAttempts, then:
    // supabase.from("jobs").update({
    //   status: "retrying",
    //   attempts: job.attempts + 1,
    //   error: null,
    //   started_at: null,
    //   completed_at: null,
    //   duration_ms: null,
    // }).eq("id", jobId).eq("business_id", businessId).select().single()
    return notImplemented("retryJob");
  },

  /**
   * Permanently deletes a job record.
   */
  async deleteJob(_businessId: string, _jobId: string): Promise<void> {
    // TODO(supabase): supabase.from("jobs").delete()
    //   .eq("id", jobId).eq("business_id", businessId)
    return notImplemented("deleteJob");
  },
};
