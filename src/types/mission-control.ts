import type { Job } from "@/types/job";
import type { EventCategory } from "@/types/event";

// Mission Control's types describe *presentation state only* — Mission
// Control has no business logic of its own, so every shape here is a
// read-oriented summary of data that actually lives in (and is owned by)
// another module: Business Service, Job Manager, Knowledge Graph Engine,
// Page Repository, Crawl Engine, Website Discovery Service, Discovery
// Orchestrator, and Event Bus.

/**
 * A coarse health/status level used across Business Health and System
 * Status cards. "unknown" is used whenever a module has no query method
 * yet to report real status (e.g. Website Discovery and the Discovery
 * Orchestrator currently only expose action methods, not "what's my
 * current status" queries) — Mission Control never guesses a status it
 * can't actually observe.
 */
export type HealthLevel = "healthy" | "warning" | "critical" | "running" | "unknown";

/**
 * Operational status of an AI agent card. Distinct from HealthLevel
 * because agents aren't "healthy/warning/critical" — they're either doing
 * something, waiting, or not available yet.
 */
export type AgentStatus = "idle" | "offline" | "unavailable" | "running";

/**
 * Minimal identity reference for the business the dashboard is showing.
 */
export interface BusinessSummaryRef {
  businessId: string;
  businessName: string | null;
}

export interface WebsiteSummary {
  status: HealthLevel;
  reachable: boolean | null;
  lastCheckedAt: string | null;
}

export interface DiscoverySummary {
  status: HealthLevel;
  lastRunStatus: string | null;
  lastRunAt: string | null;
}

export interface CrawlSummary {
  status: HealthLevel;
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesFailed: number;
}

export interface KnowledgeSummary {
  status: HealthLevel;
  pageCount: number;
  entityCount: number;
  relationshipCount: number;
  productCount: number;
  serviceCount: number;
  locationCount: number;
}

export interface JobsSummary {
  runningCount: number;
  queuedCount: number;
  failedCount: number;
  /** The jobs backing the counts above, for the Running Jobs section. */
  jobs: Job[];
}

/**
 * A single entry in the Recent Activity timeline. Sourced from the Event
 * Bus once an event history/store exists — see `getRecentActivity()`.
 */
export interface ActivityItem {
  id: string;
  message: string;
  category: EventCategory;
  timestamp: string;
}

export interface ActivitySummary {
  items: ActivityItem[];
}

export interface AgentSummary {
  id: string;
  name: string;
  status: AgentStatus;
}

export interface InsightItem {
  id: string;
  title: string;
  description: string;
  severity: HealthLevel;
}

/**
 * The full payload for Mission Control's home page. Every field is a
 * summary of state owned by another module — Mission Control assembles
 * this by reading from those modules, never by computing business facts
 * itself.
 */
export interface DashboardSummary {
  business: BusinessSummaryRef;
  website: WebsiteSummary;
  discovery: DiscoverySummary;
  crawl: CrawlSummary;
  knowledge: KnowledgeSummary;
  jobs: JobsSummary;
  activity: ActivitySummary;
  system: SystemStatus;
  insights: InsightItem[];
  agents: AgentSummary[];
  lastUpdated: string;
}

/**
 * Health rollup for a single business across each layer Mission Control
 * can currently observe.
 */
export interface BusinessHealth {
  businessId: string;
  businessName: string | null;
  websiteStatus: HealthLevel;
  discoveryStatus: HealthLevel;
  crawlStatus: HealthLevel;
  knowledgeStatus: HealthLevel;
  overallHealth: HealthLevel;
}

/**
 * Health rollup for the Atlas system itself (as opposed to a single
 * business) — the Kernel and Discovery/Knowledge layers described in
 * `docs/architecture/atlas-kernel.md`.
 */
export interface SystemStatus {
  kernel: HealthLevel;
  discoveryLayer: HealthLevel;
  knowledgeLayer: HealthLevel;
  eventBus: HealthLevel;
  jobManager: HealthLevel;
  overall: HealthLevel;
}

/**
 * The set of coordinating actions Mission Control can kick off. `action`
 * is an identifier, not a function reference — this keeps QuickAction a
 * plain data object; the Mission Control page maps each identifier to the
 * corresponding `missionControl` method.
 */
export type QuickActionType =
  | "add-business"
  | "run-discovery"
  | "run-crawl"
  | "refresh-knowledge"
  | "run-seo-audit"
  | "generate-content";

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  /** A lucide-react icon name (e.g. "Plus", "Radar") — kept as a string so this type has no UI-library dependency. */
  icon: string;
  enabled: boolean;
  action: QuickActionType;
}
