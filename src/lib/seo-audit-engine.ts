import type { SeoIssue, SeoAudit } from "@/types/seo";

// Atlas SEO Audit Engine.
//
// Where the actual SEO audit logic will live — as opposed to
// `seo-department.ts`, which only manages audit lifecycle (starting,
// tracking, cancelling). None of these methods perform real audits yet:
// every one throws with a `TODO(seo-engine)` comment describing exactly
// which Atlas modules it will consume once implemented, and what it will
// produce.
//
// Every method here is expected to follow the same eventual pattern:
// read facts from the relevant upstream module(s), evaluate them via
// `ruleEngine.evaluateRules()` against this audit type's own rule
// definitions (registered through `ruleEngine.createRule()`, never
// hardcoded here — see "no hardcoded SEO rules" in
// docs/architecture/rule-engine.md), turn failed RuleResults into
// SeoIssues, and — for issues judged worth surfacing — create
// corresponding Insights via `insightEngine.createInsight()`.
//
// This file has no imports from Business Service, Website Discovery, the
// Crawl Engine, the Page Repository, the Metadata Extraction Engine, the
// Knowledge Graph, the Rule Engine, or the Insight Engine yet — those
// imports will be added when each audit method is actually implemented,
// not before.

function notImplemented(action: string): never {
  throw new Error(`SeoAuditEngine.${action} is not implemented yet — TODO(seo-engine): wire this up.`);
}

export const seoAuditEngine = {
  /**
   * Audits a business's on-page metadata (titles, meta descriptions,
   * canonical URLs, headings, Open Graph/Twitter Card tags).
   *
   * Future inputs: Page Repository, Metadata Extraction Engine, Rule
   * Engine.
   * Future outputs: SeoIssues, Insights.
   */
  async runMetadataAudit(_businessId: string): Promise<SeoIssue[]> {
    // TODO(seo-engine): for each Page from pageService.listPages(businessId),
    // evaluate metadata-related rules (e.g. "title exists", "titleLength
    // lessThanOrEqual 60", "metaDescription exists") via
    // ruleEngine.evaluateRules() against that page's ExtractedMetadata
    // fields, and turn failures into SeoIssues.
    return notImplemented("runMetadataAudit");
  },

  /**
   * Audits a business's technical SEO fundamentals (reachability, HTTPS,
   * response status/timing, robots.txt, sitemap).
   *
   * Future inputs: Website Discovery Service, Page Repository, Rule
   * Engine.
   * Future outputs: SeoIssues, Insights.
   */
  async runTechnicalAudit(_businessId: string): Promise<SeoIssue[]> {
    // TODO(seo-engine): evaluate rules against the facts produced by
    // websiteDiscoveryService (e.g. "httpsEnabled equals true",
    // "statusCode equals 200") and against Page-level statusCode/
    // contentType facts from the Page Repository.
    return notImplemented("runTechnicalAudit");
  },

  /**
   * Audits a business's internal/external link structure (broken links,
   * link depth, internal linking patterns).
   *
   * Future inputs: Page Repository, Crawl Engine, Rule Engine.
   * Future outputs: SeoIssues, Insights.
   */
  async runLinkAudit(_businessId: string): Promise<SeoIssue[]> {
    // TODO(seo-engine): evaluate rules against Page.statusCode (to find
    // broken links among crawled pages) and CrawlPage.depth/parentUrl
    // (from crawlService.listPages()) to assess link structure and
    // internal-linking depth.
    return notImplemented("runLinkAudit");
  },

  /**
   * Audits a business's content quality signals (word count, heading
   * usage, thin content).
   *
   * Future inputs: Page Repository, Metadata Extraction Engine, Rule
   * Engine.
   * Future outputs: SeoIssues, Insights.
   */
  async runContentAudit(_businessId: string): Promise<SeoIssue[]> {
    // TODO(seo-engine): evaluate rules against ExtractedMetadata.wordCount
    // and ExtractedMetadata.headings (e.g. "wordCount greaterThan 300",
    // "headings notContains missing h1") per page.
    return notImplemented("runContentAudit");
  },

  /**
   * Audits a business's page/heading structure (heading hierarchy,
   * duplicate H1s, page organization).
   *
   * Future inputs: Page Repository, Metadata Extraction Engine, Crawl
   * Engine, Rule Engine.
   * Future outputs: SeoIssues, Insights.
   */
  async runStructureAudit(_businessId: string): Promise<SeoIssue[]> {
    // TODO(seo-engine): evaluate rules against ExtractedMetadata.headings
    // ordering/levels, and against CrawlPage.depth/parentUrl for overall
    // site structure (e.g. pages buried too deep from the seed URL).
    return notImplemented("runStructureAudit");
  },

  /**
   * Audits a business's page performance signals (response time,
   * image/resource counts).
   *
   * Future inputs: Website Discovery Service, Page Repository, Rule
   * Engine.
   * Future outputs: SeoIssues, Insights.
   */
  async runPerformanceAudit(_businessId: string): Promise<SeoIssue[]> {
    // TODO(seo-engine): evaluate rules against
    // WebsiteReachabilityResult.responseTimeMs and
    // ExtractedMetadata.imageCount (e.g. "responseTimeMs lessThan 1000").
    return notImplemented("runPerformanceAudit");
  },

  /**
   * Audits a business's indexability (robots directives, canonical
   * correctness, crawlability).
   *
   * Future inputs: Website Discovery Service, Page Repository, Metadata
   * Extraction Engine, Rule Engine.
   * Future outputs: SeoIssues, Insights.
   */
  async runIndexabilityAudit(_businessId: string): Promise<SeoIssue[]> {
    // TODO(seo-engine): evaluate rules against RobotsTxtResult (from
    // websiteDiscoveryService), and against each page's
    // ExtractedMetadata.robots meta tag and canonicalUrl (e.g. "robots
    // notContains noindex", "canonicalUrl exists").
    return notImplemented("runIndexabilityAudit");
  },

  /**
   * Runs every audit type and aggregates the results into a single
   * overall SeoAudit.
   *
   * Future inputs: Page Repository, Knowledge Graph, Rule Engine, Insight
   * Engine, and every other `seoAuditEngine` method above.
   * Future outputs: a complete SeoAudit (all SeoIssues plus a
   * SeoAuditSummary rollup), Insights.
   */
  async runOverallAudit(_businessId: string): Promise<SeoAudit> {
    // TODO(seo-engine): call runMetadataAudit, runTechnicalAudit,
    // runLinkAudit, runContentAudit, runStructureAudit,
    // runPerformanceAudit, and runIndexabilityAudit, concatenate their
    // SeoIssues, compute a SeoAuditSummary from the combined set, and
    // return a completed SeoAudit (auditType: "overall"). This is the
    // method seoDepartment.runAudit() will eventually delegate to when
    // called with auditType: "overall".
    return notImplemented("runOverallAudit");
  },
};
