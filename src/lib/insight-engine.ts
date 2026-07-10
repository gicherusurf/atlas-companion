import type {
  Insight,
  CreateInsightInput,
  ListInsightsFilter,
} from "@/types/insight";

// Atlas Insight Engine.
//
// Atlas's reasoning-output layer: it converts facts already established
// elsewhere in Atlas into standardized Insight objects. It does NOT crawl,
// does NOT perform SEO analysis, and does NOT generate AI responses — it
// only stores and retrieves the conclusions other modules reach. Every
// future Atlas department (SEO Audit, Content Engine, Marketing Engine,
// Finance Engine, etc.) is expected to publish its findings through this
// engine rather than inventing its own insight storage; Mission Control is
// expected to read from here rather than from each department directly.
//
// Design principle: the Insight Engine never decides HOW an engine reaches
// a conclusion — severity, category, and recommendation are entirely the
// producing module's call. This engine only standardizes storage and
// retrieval of whatever conclusion it's given.
//
// Architecture: this file depends on nothing but its own types
// (`src/types/insight.ts`). It must never import from SEO, Marketing,
// Finance, the Crawler, Mission Control, or Knowledge Graph modules —
// those modules will depend on the Insight Engine, never the reverse.
//
// Follows the same architecture as the other Atlas services: a plain
// object of methods (no class), every method scoped by `businessId`, no
// mock data, `TODO(supabase)` markers instead of real persistence. Read
// methods return `[]`/`null` rather than throwing; write methods throw.

function notImplemented(action: string): never {
  throw new Error(`InsightEngine.${action} is not implemented yet — TODO(supabase): wire this up.`);
}

export const insightEngine = {
  /**
   * Records a new insight. `status` starts as `"new"`.
   */
  async createInsight(_input: CreateInsightInput): Promise<Insight> {
    // TODO(supabase): supabase.from("insights").insert({
    //   ...input,
    //   status: "new",
    // }).select().single()
    return notImplemented("createInsight");
  },

  /**
   * Fetches a single insight by id, scoped to the business it belongs to.
   */
  async getInsight(_businessId: string, _insightId: string): Promise<Insight | null> {
    // TODO(supabase): supabase.from("insights").select("*")
    //   .eq("id", insightId).eq("business_id", businessId).maybeSingle()
    return null;
  },

  /**
   * Lists insights for a business, optionally filtered by category,
   * severity, status, or source.
   */
  async listInsights(_businessId: string, _filter?: ListInsightsFilter): Promise<Insight[]> {
    // TODO(supabase): supabase.from("insights").select("*")
    //   .eq("business_id", businessId)
    //   .match(filter ?? {})
    //   .order("created_at", { ascending: false })
    return [];
  },

  /**
   * Lists insights for a business within a single category.
   */
  async listInsightsByCategory(businessId: string, category: Insight["category"]): Promise<Insight[]> {
    // TODO(supabase): thin wrapper over listInsights — kept as its own
    // method since "list by category" is a common enough query pattern
    // (e.g. Mission Control's per-department sections) to warrant a
    // dedicated, self-documenting method name.
    return this.listInsights(businessId, { category });
  },

  /**
   * Lists every "critical" severity insight for a business, across all
   * categories.
   */
  async listCriticalInsights(businessId: string): Promise<Insight[]> {
    // TODO(supabase): thin wrapper over listInsights filtered to
    // severity: "critical" — kept as its own method since surfacing
    // critical insights is a first-class Mission Control concern.
    return this.listInsights(businessId, { severity: "critical" });
  },

  /**
   * Lists insights for a business that are still actionable — i.e. not
   * yet resolved or dismissed ("new" or "acknowledged").
   */
  async listOpenInsights(_businessId: string): Promise<Insight[]> {
    // TODO(supabase): supabase.from("insights").select("*")
    //   .eq("business_id", businessId)
    //   .in("status", ["new", "acknowledged"])
    //   .order("created_at", { ascending: false })
    //
    // Not implemented as a call to listInsights() with a single `status`
    // filter, since "open" spans two status values ("new" AND
    // "acknowledged") and ListInsightsFilter.status only accepts one.
    return [];
  },

  /**
   * Marks an insight as resolved.
   */
  async resolveInsight(_businessId: string, _insightId: string): Promise<Insight> {
    // TODO(supabase): supabase.from("insights").update({ status: "resolved" })
    //   .eq("id", insightId).eq("business_id", businessId).select().single()
    return notImplemented("resolveInsight");
  },

  /**
   * Marks an insight as dismissed (acknowledged as not worth acting on).
   */
  async dismissInsight(_businessId: string, _insightId: string): Promise<Insight> {
    // TODO(supabase): supabase.from("insights").update({ status: "dismissed" })
    //   .eq("id", insightId).eq("business_id", businessId).select().single()
    return notImplemented("dismissInsight");
  },

  /**
   * Permanently deletes an insight record.
   */
  async deleteInsight(_businessId: string, _insightId: string): Promise<void> {
    // TODO(supabase): supabase.from("insights").delete()
    //   .eq("id", insightId).eq("business_id", businessId)
    return notImplemented("deleteInsight");
  },
};
