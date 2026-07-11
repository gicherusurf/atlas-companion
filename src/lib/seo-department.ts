import type { SeoAudit, RunAuditInput, ListAuditsFilter } from "@/types/seo";

// Atlas SEO Department.
//
// SEO is Atlas's first Department — it is NOT a standalone application.
// It owns SEO-specific orchestration only: starting, tracking, and
// managing the lifecycle of SEO audits. It consumes data already
// produced elsewhere in Atlas (Business Service, Website Discovery, the
// Crawl Engine, the Page Repository, the Metadata Extraction Engine, the
// Knowledge Graph, the Rule Engine, and the Insight Engine) rather than
// re-deriving any of it itself.
//
// The actual audit *logic* (what makes a page's metadata good or bad,
// what counts as a broken link, etc.) lives in
// `src/lib/seo-audit-engine.ts`, not here. This file is the thin
// lifecycle/orchestration layer on top of it — analogous to how
// `discovery-orchestrator.ts` coordinates `website-discovery-service.ts`
// without containing any discovery logic of its own.
//
// Architecture: the SEO Department may consume the Page Repository,
// Metadata Extraction Engine, Knowledge Graph, Rule Engine, Insight
// Engine, Job Manager, Event Bus, and Mission Control's coordination —
// but must never be imported BY any of those modules. The dependency
// direction is one-way: those modules were all built before the SEO
// Department and have zero knowledge of it.
//
// Follows the same architecture as the other Atlas services: a plain
// object of methods (no class), no mock data, `TODO(supabase)` markers
// instead of real persistence. Read methods return `[]`/`null`; write
// methods throw.

function notImplemented(action: string): never {
  throw new Error(`SeoDepartment.${action} is not implemented yet — TODO(supabase): wire this up.`);
}

export const seoDepartment = {
  /**
   * Starts a new SEO audit for a business. Intended to eventually create
   * a Job (via Job Manager), publish a JobCreated event, and delegate the
   * actual audit work to `seoAuditEngine` based on `auditType` — none of
   * that orchestration is wired up yet.
   */
  async runAudit(_input: RunAuditInput): Promise<SeoAudit> {
    // TODO(supabase): supabase.from("seo_audits").insert({
    //   business_id: input.businessId,
    //   audit_type: input.auditType,
    //   status: "pending",
    // }).select().single()
    return notImplemented("runAudit");
  },

  /**
   * Fetches a single audit by id, scoped to the business it belongs to.
   */
  async getAudit(_businessId: string, _auditId: string): Promise<SeoAudit | null> {
    // TODO(supabase): supabase.from("seo_audits").select("*")
    //   .eq("id", auditId).eq("business_id", businessId).maybeSingle()
    return null;
  },

  /**
   * Lists audits for a business, optionally filtered by audit type or
   * status.
   */
  async listAudits(_businessId: string, _filter?: ListAuditsFilter): Promise<SeoAudit[]> {
    // TODO(supabase): supabase.from("seo_audits").select("*")
    //   .eq("business_id", businessId)
    //   .match(filter ?? {})
    //   .order("started_at", { ascending: false })
    return [];
  },

  /**
   * Cancels an in-progress audit.
   */
  async cancelAudit(_businessId: string, _auditId: string): Promise<SeoAudit> {
    // TODO(supabase): supabase.from("seo_audits").update({
    //   status: "cancelled",
    //   completed_at: new Date().toISOString(),
    // }).eq("id", auditId).eq("business_id", businessId).select().single()
    return notImplemented("cancelAudit");
  },

  /**
   * Permanently deletes an audit record.
   */
  async deleteAudit(_businessId: string, _auditId: string): Promise<void> {
    // TODO(supabase): supabase.from("seo_audits").delete()
    //   .eq("id", auditId).eq("business_id", businessId)
    return notImplemented("deleteAudit");
  },
};
