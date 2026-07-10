import { businessService } from "@/lib/business-service";
import { jobManager } from "@/lib/job-manager";
import { knowledgeGraphEngine } from "@/lib/knowledge-graph";
import { pageService } from "@/lib/page-service";
import { crawlService } from "@/lib/crawl-service";
import type {
  DashboardSummary,
  BusinessHealth,
  SystemStatus,
  QuickAction,
  ActivitySummary,
} from "@/types/mission-control";
import type { Job } from "@/types/job";

// Atlas Mission Control.
//
// The operating center of Atlas — think "CEO dashboard." Mission Control
// contains NO business logic of its own. It only:
//   1. reads current state from existing modules (Business Service, Job
//      Manager, Knowledge Graph Engine, Page Repository, Crawl Engine) to
//      assemble a dashboard, and
//   2. coordinates multi-step workflows across those modules for its
//      action methods (startDiscovery, startCrawl, refreshKnowledge,
//      runSeoAudit, generateContent) — none of which are wired up yet.
//
// Mission Control depends on Business Service, Job Manager, Event Bus,
// Discovery Orchestrator, and Knowledge Graph Engine. None of those
// modules depend on Mission Control — dependencies only point downward,
// from Mission Control into the modules it coordinates, never the
// reverse.
//
// Read methods below call real existing read methods on other services
// (which today safely return empty/null, since nothing is persisted yet)
// rather than fabricating placeholder data of their own — so what this
// dashboard shows is genuinely "the current state of the system," even
// though that state is currently empty. Two exceptions are called out
// explicitly below: Website Discovery and the Discovery Orchestrator
// currently expose only action methods (discoverWebsite(), run(), etc.),
// with no "what happened last time" query yet — so `website` and
// `discovery` summaries default to "unknown" rather than calling (and
// triggering) an action method just to render a dashboard.

function notImplemented(action: string): never {
  throw new Error(
    `MissionControl.${action} is not implemented yet — TODO(orchestration): wire this up.`,
  );
}

export const missionControl = {
  /**
   * Assembles the full Mission Control dashboard for a business by
   * reading current state from every module it coordinates.
   */
  async getDashboard(businessId: string): Promise<DashboardSummary> {
    const [business, jobs, knowledgeGraph, pages, crawlPages] = await Promise.all([
      businessService.getBusiness(businessId),
      jobManager.listJobs(businessId),
      knowledgeGraphEngine.buildKnowledgeGraph(businessId),
      pageService.listPages(businessId),
      crawlService.listPages(businessId),
    ]);

    const runningJobs = jobs.filter((j) => j.status === "running");
    const queuedJobs = jobs.filter((j) => j.status === "queued" || j.status === "retrying");
    const failedJobs = jobs.filter((j) => j.status === "failed");

    // TODO(orchestration): Website Discovery Service currently only
    // exposes discoverWebsite() (an action, not a query) — there's no
    // "last known website status" to read yet. Once Discovery Orchestrator
    // runs are persisted (its "Persist Results" stage), read the latest
    // result here instead of defaulting to "unknown".
    const website = { status: "unknown" as const, reachable: null, lastCheckedAt: null };

    // TODO(orchestration): same situation as `website` — the Discovery
    // Orchestrator's run() is an action with no persisted run history to
    // query yet. Read the latest DiscoveryRunResult here once that exists.
    const discovery = { status: "unknown" as const, lastRunStatus: null, lastRunAt: null };

    const crawlFailed = crawlPages.filter((p) => p.crawlStatus === "failed").length;
    const crawlCrawled = crawlPages.filter((p) => p.crawlStatus === "crawled").length;
    const crawl = {
      status: crawlPages.length === 0 ? ("unknown" as const) : ("healthy" as const),
      pagesDiscovered: crawlPages.length,
      pagesCrawled: crawlCrawled,
      pagesFailed: crawlFailed,
    };

    const knowledge = {
      status: knowledgeGraph.entities.length === 0 ? ("unknown" as const) : ("healthy" as const),
      pageCount: pages.length,
      entityCount: knowledgeGraph.entities.length,
      relationshipCount: knowledgeGraph.relationships.length,
      productCount: knowledgeGraph.entities.filter((e) => e.type === "Product").length,
      serviceCount: knowledgeGraph.entities.filter((e) => e.type === "Service").length,
      locationCount: knowledgeGraph.entities.filter((e) => e.type === "Location").length,
    };

    const system = await this.getSystemStatus();

    // TODO(orchestration): AI Agents (SEO, Marketing, Content, Research,
    // Finance) don't exist as real modules yet — every agent reports
    // "offline" until each has a real implementation to query.
    const agents = [
      { id: "seo-agent", name: "SEO Agent", status: "offline" as const },
      { id: "marketing-agent", name: "Marketing Agent", status: "offline" as const },
      { id: "content-agent", name: "Content Agent", status: "offline" as const },
      { id: "research-agent", name: "Research Agent", status: "offline" as const },
      { id: "finance-agent", name: "Finance Agent", status: "offline" as const },
    ];

    const activity = await this.getRecentActivity(businessId);

    return {
      business: { businessId, businessName: business?.companyName ?? null },
      website,
      discovery,
      crawl,
      knowledge,
      jobs: {
        runningCount: runningJobs.length,
        queuedCount: queuedJobs.length,
        failedCount: failedJobs.length,
        jobs,
      },
      activity,
      system,
      insights: [], // TODO(orchestration): populate once an Insight Engine exists to generate these
      agents,
      lastUpdated: new Date().toISOString(),
    };
  },

  /**
   * Rolls up a single business's health across every layer Mission
   * Control can currently observe.
   */
  async getBusinessHealth(businessId: string): Promise<BusinessHealth> {
    const dashboard = await this.getDashboard(businessId);

    const statuses = [
      dashboard.website.status,
      dashboard.discovery.status,
      dashboard.crawl.status,
      dashboard.knowledge.status,
    ];
    const overallHealth = statuses.includes("critical")
      ? ("critical" as const)
      : statuses.includes("warning")
        ? ("warning" as const)
        : statuses.every((s) => s === "unknown")
          ? ("unknown" as const)
          : ("healthy" as const);

    return {
      businessId,
      businessName: dashboard.business.businessName,
      websiteStatus: dashboard.website.status,
      discoveryStatus: dashboard.discovery.status,
      crawlStatus: dashboard.crawl.status,
      knowledgeStatus: dashboard.knowledge.status,
      overallHealth,
    };
  },

  /**
   * Reports the health of Atlas's own Kernel/Discovery/Knowledge layers
   * (as opposed to a single business's data). Placeholder healthy states
   * for now, per Sprint scope — none of these layers have real
   * self-diagnostics yet.
   */
  async getSystemStatus(): Promise<SystemStatus> {
    // TODO(orchestration): once Job Manager and Event Bus have real
    // persistence/telemetry, derive these from actual signals (e.g. job
    // failure rates, event delivery errors) instead of a static "healthy".
    return {
      kernel: "healthy",
      discoveryLayer: "healthy",
      knowledgeLayer: "healthy",
      eventBus: "healthy",
      jobManager: "healthy",
      overall: "healthy",
    };
  },

  /**
   * Returns the fixed set of quick actions Mission Control offers. This is
   * static UI configuration, not business data — the actual work each
   * action performs is not implemented yet (see the corresponding methods
   * below).
   */
  async getQuickActions(): Promise<QuickAction[]> {
    return [
      {
        id: "add-business",
        title: "Add Business",
        description: "Register a new business under this organization.",
        icon: "Plus",
        enabled: true,
        action: "add-business",
      },
      {
        id: "run-discovery",
        title: "Run Discovery",
        description: "Check reachability, robots.txt, sitemap, and homepage metadata.",
        icon: "Radar",
        enabled: true,
        action: "run-discovery",
      },
      {
        id: "run-crawl",
        title: "Run Crawl",
        description: "Discover every page on the business's website.",
        icon: "Globe",
        enabled: true,
        action: "run-crawl",
      },
      {
        id: "refresh-knowledge",
        title: "Refresh Knowledge",
        description: "Rebuild the Knowledge Graph from the latest crawled pages.",
        icon: "Network",
        enabled: true,
        action: "refresh-knowledge",
      },
      {
        id: "run-seo-audit",
        title: "Run SEO Audit",
        description: "Analyze crawled pages for SEO issues.",
        icon: "SearchCheck",
        enabled: true,
        action: "run-seo-audit",
      },
      {
        id: "generate-content",
        title: "Generate Content",
        description: "Draft new content based on Knowledge Graph insights.",
        icon: "PenLine",
        enabled: true,
        action: "generate-content",
      },
    ];
  },

  /**
   * Returns the Recent Activity timeline for a business.
   */
  async getRecentActivity(_businessId: string): Promise<ActivitySummary> {
    // TODO(orchestration): the Event Bus (src/lib/event-bus.ts) is
    // synchronous pub/sub only — it has no event history/store, so there
    // is nothing to query yet. Once an Event Store exists (see "Planned
    // kernel modules" in docs/architecture/atlas-kernel.md), read this
    // business's recent events from it here instead of returning empty.
    return { items: [] };
  },

  /**
   * Starts a Website Discovery run for a business.
   */
  async startDiscovery(_businessId: string): Promise<Job> {
    // TODO(orchestration): this should
    //   1. jobManager.createJob({ businessId, category: "SEO", type: "website-discovery", initiatedBy: "user" })
    //   2. eventBus.publish({ name: "JobCreated", category: "SEO", source: "MissionControl", businessId, payload: { jobId, category: "SEO", type: "website-discovery" } })
    //   3. jobManager.startJob(businessId, jobId)
    //   4. call discoveryOrchestrator.run(businessId), then
    //      jobManager.completeJob(...)/failJob(...) based on the result,
    //      and eventBus.publish("DiscoveryCompleted" | "DiscoveryFailed")
    return notImplemented("startDiscovery");
  },

  /**
   * Starts a Crawl Engine run for a business.
   */
  async startCrawl(_businessId: string, _seedUrl: string): Promise<Job> {
    // TODO(orchestration): this should
    //   1. jobManager.createJob({ businessId, category: "SEO", type: "website-discovery", initiatedBy: "user" })
    //      (or a dedicated "crawl" JobType, once JobType is extended for it)
    //   2. eventBus.publish("JobCreated", ...)
    //   3. jobManager.startJob(...)
    //   4. crawlService.startCrawl({ businessId, seedUrl }), then
    //      jobManager.completeJob(...)/failJob(...) and
    //      eventBus.publish("JobCompleted" | "JobFailed")
    return notImplemented("startCrawl");
  },

  /**
   * Rebuilds a business's Knowledge Graph from its current pages.
   */
  async refreshKnowledge(_businessId: string): Promise<Job> {
    // TODO(orchestration): this should
    //   1. jobManager.createJob({ businessId, category: "KNOWLEDGE", type: ..., initiatedBy: "user" })
    //      (JobType currently has no "knowledge-refresh" value yet — add
    //      one when this is actually wired up)
    //   2. eventBus.publish("JobCreated", ...)
    //   3. jobManager.startJob(...)
    //   4. for each page from pageService.listPages(businessId): call
    //      knowledgeGraphEngine.extractEntities/extractRelationships, then
    //      knowledgeGraphEngine.mergeEntities to fold results in
    //   5. jobManager.completeJob(...) / failJob(...) and
    //      eventBus.publish("JobCompleted" | "JobFailed")
    return notImplemented("refreshKnowledge");
  },

  /**
   * Runs an SEO audit for a business.
   */
  async runSeoAudit(_businessId: string): Promise<Job> {
    // TODO(orchestration): there is no SEO Audit Engine yet (see "Planned
    // SEO modules" in docs/architecture/atlas-kernel.md — "Technical Audit
    // Engine" / "Insight Engine"). Once it exists, this should
    //   1. jobManager.createJob({ businessId, category: "SEO", type: "seo-audit", initiatedBy: "user" })
    //   2. eventBus.publish("JobCreated", ...)
    //   3. jobManager.startJob(...)
    //   4. call the SEO Audit Engine over pages from pageService.listPages(businessId)
    //   5. jobManager.completeJob(...)/failJob(...) and publish accordingly
    return notImplemented("runSeoAudit");
  },

  /**
   * Generates content for a business.
   */
  async generateContent(_businessId: string): Promise<Job> {
    // TODO(orchestration): there is no Content Engine yet (see "Planned
    // SEO modules" — "Content Engine" — in
    // docs/architecture/atlas-kernel.md). Once it exists, this should
    //   1. jobManager.createJob({ businessId, category: "CONTENT", type: "content-generation", initiatedBy: "user" })
    //   2. eventBus.publish("JobCreated", ...)
    //   3. jobManager.startJob(...)
    //   4. call the Content Engine, informed by knowledgeGraphEngine.buildKnowledgeGraph(businessId)
    //   5. jobManager.completeJob(...)/failJob(...) and publish accordingly
    return notImplemented("generateContent");
  },
};
