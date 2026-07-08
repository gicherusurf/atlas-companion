import { websiteDiscoveryService } from "@/lib/website-discovery-service";
import type {
  DiscoveryRunResult,
  DiscoveryStageName,
  DiscoveryStageResult,
  NextRecommendedAction,
} from "@/types/discovery-orchestrator";

// Atlas Discovery Orchestrator.
//
// Coordinates the Website Discovery pipeline, in order:
//   Reachability -> Robots -> Sitemap -> Page Discovery -> Homepage Metadata
//   -> Persist Results
//
// This module ONLY orchestrates — it does no crawling itself. The first
// four data-gathering stages delegate to `websiteDiscoveryService`, which
// currently throws `not implemented` for each method (see
// website-discovery-service.ts). That's expected: running this orchestrator
// today will correctly fail at the "reachability" stage until that service
// is for real. "Page Discovery" and "Persist Results" don't have a backing
// service yet at all (see TODOs below) — they're represented here so the
// pipeline shape is right, and are wired up to real services once they exist.
//
// Fail-fast: the pipeline stops at the first failed stage. Every stage
// after a failure is recorded as "skipped" rather than attempted.

const PIPELINE_ORDER: DiscoveryStageName[] = [
  "reachability",
  "robots",
  "sitemap",
  "pageDiscovery",
  "homepageMetadata",
  "persistResults",
];

const RETRY_ACTION_BY_STAGE: Record<DiscoveryStageName, NextRecommendedAction> = {
  reachability: "check_website_reachability",
  robots: "check_robots_txt",
  sitemap: "check_sitemap",
  pageDiscovery: "retry_page_discovery",
  homepageMetadata: "review_homepage_metadata",
  persistResults: "retry_persist_results",
};

/**
 * Runs a single pipeline stage, timing it and normalizing success/failure
 * into a DiscoveryStageResult. `work` should call the relevant
 * websiteDiscoveryService method (or, for stages without a service yet,
 * a local TODO stub below).
 */
async function runStage(
  stage: DiscoveryStageName,
  work: () => Promise<unknown>,
): Promise<DiscoveryStageResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();

  try {
    const data = await work();
    const completedAt = new Date().toISOString();
    return {
      stage,
      status: "success",
      startedAt,
      completedAt,
      durationMs: Date.now() - start,
      data,
      error: null,
    };
  } catch (err) {
    const completedAt = new Date().toISOString();
    return {
      stage,
      status: "failed",
      startedAt,
      completedAt,
      durationMs: Date.now() - start,
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function skippedStage(stage: DiscoveryStageName): DiscoveryStageResult {
  return {
    stage,
    status: "skipped",
    startedAt: null,
    completedAt: null,
    durationMs: null,
    data: null,
    error: null,
  };
}

// --- Stages without a backing service yet -----------------------------

/**
 * TODO(page-discovery-service): once a real crawler exists, this stage
 * should walk the URLs found in the sitemap stage (or, if no sitemap,
 * fall back to crawling internal links from the homepage) and produce a
 * list of discovered pages for further analysis. For now this has no
 * service to call, so it throws — orchestration-only, per Sprint 1 scope.
 */
async function discoverPages(_businessId: string): Promise<unknown> {
  throw new Error(
    "Page Discovery is not implemented yet — TODO(page-discovery-service): wire this up.",
  );
}

/**
 * TODO(persistence-layer): once a `website_discovery_runs` (or similar)
 * table exists, this stage should persist the accumulated stage data for
 * this run via Supabase. For now there's no persistence layer to call, so
 * it throws — orchestration-only, per Sprint 1 scope.
 */
async function persistResults(_businessId: string, _stages: DiscoveryStageResult[]): Promise<unknown> {
  throw new Error(
    "Persist Results is not implemented yet — TODO(persistence-layer): wire this up.",
  );
}

export const discoveryOrchestrator = {
  /**
   * Runs the full Website Discovery pipeline for a business, stopping at
   * the first failed stage.
   */
  async run(businessId: string): Promise<DiscoveryRunResult> {
    const startedAt = new Date().toISOString();
    const runStart = Date.now();

    const stages: DiscoveryStageResult[] = [];
    let failedStage: DiscoveryStageName | null = null;

    for (const stageName of PIPELINE_ORDER) {
      if (failedStage) {
        stages.push(skippedStage(stageName));
        continue;
      }

      let result: DiscoveryStageResult;
      switch (stageName) {
        case "reachability":
          result = await runStage(stageName, () => websiteDiscoveryService.discoverWebsite(businessId));
          break;
        case "robots":
          result = await runStage(stageName, () => websiteDiscoveryService.discoverRobotsTxt(businessId));
          break;
        case "sitemap":
          result = await runStage(stageName, () => websiteDiscoveryService.discoverSitemap(businessId));
          break;
        case "pageDiscovery":
          result = await runStage(stageName, () => discoverPages(businessId));
          break;
        case "homepageMetadata":
          result = await runStage(stageName, () => websiteDiscoveryService.discoverHomepage(businessId));
          break;
        case "persistResults":
          result = await runStage(stageName, () => persistResults(businessId, stages));
          break;
      }

      stages.push(result);
      if (result.status === "failed") {
        failedStage = stageName;
      }
    }

    const completedStages = stages
      .filter((s) => s.status === "success")
      .map((s) => s.stage);

    const status: DiscoveryRunResult["status"] = failedStage
      ? completedStages.length > 0
        ? "partial"
        : "failed"
      : "success";

    const nextRecommendedAction: NextRecommendedAction = failedStage
      ? RETRY_ACTION_BY_STAGE[failedStage]
      : "none";

    return {
      businessId,
      status,
      stages,
      completedStages,
      failedStage,
      durationMs: Date.now() - runStart,
      nextRecommendedAction,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  },
};
