// TODO: if events are ever persisted (e.g. an audit log / event store),
// align this shape with the DB schema via `supabase gen types typescript`.

/**
 * Which Atlas department an event relates to. Mirrors the spirit of
 * `JobCategory` in `src/types/job.ts`, but events are broader than jobs —
 * SYSTEM and WORKFLOW cover cross-cutting/infrastructure concerns that
 * aren't tied to a single department.
 */
export type EventCategory =
  | "SYSTEM"
  | "BUSINESS"
  | "SEO"
  | "MARKETING"
  | "CONTENT"
  | "FINANCE"
  | "KNOWLEDGE"
  | "WORKFLOW";

/**
 * The Atlas module that published an event. Extend this union as new
 * modules are introduced.
 */
export type EventSource =
  | "BusinessService"
  | "JobManager"
  | "DiscoveryOrchestrator"
  | "WebsiteDiscoveryService"
  | "WorkflowEngine"
  | "AIAgent"
  | "MissionControl";

/**
 * Payload shapes for Atlas's common, well-known events. Extend this map as
 * new event types are introduced — doing so automatically gives
 * `AtlasEvent<TName>`, `eventBus.publish()`, and `eventBus.subscribe()`
 * strong typing for the new event without any other changes.
 */
export interface AtlasEventPayloadMap {
  BusinessCreated: { businessId: string; companyName: string };
  BusinessUpdated: { businessId: string; changes: Record<string, unknown> };
  BusinessDeleted: { businessId: string };

  JobCreated: { jobId: string; category: string; type: string };
  JobStarted: { jobId: string };
  JobCompleted: { jobId: string; result: unknown };
  JobFailed: { jobId: string; error: string };

  DiscoveryStarted: { businessId: string; jobId?: string };
  DiscoveryCompleted: { businessId: string; jobId?: string; status: string };
  DiscoveryFailed: {
    businessId: string;
    jobId?: string;
    failedStage: string;
    error: string;
  };
}

/**
 * Any of Atlas's well-known event names, OR an arbitrary string — modules
 * are free to publish their own custom event names beyond the common set
 * above; those just won't get payload type-checking.
 */
export type AtlasEventName = keyof AtlasEventPayloadMap | (string & {});

/**
 * Resolves the payload type for a given event name: the known shape from
 * AtlasEventPayloadMap if TName is one of the common events, otherwise
 * `unknown` for custom/ad-hoc events.
 */
export type AtlasEventPayload<TName extends AtlasEventName> =
  TName extends keyof AtlasEventPayloadMap ? AtlasEventPayloadMap[TName] : unknown;

/**
 * An event flowing through the Atlas Event Bus. This is the generic,
 * domain-agnostic envelope every module publishes and subscribes to —
 * the Event Bus itself never inspects `payload`.
 *
 * Note: named `AtlasEvent` rather than `Event` to avoid shadowing the
 * global DOM `Event` type, which would create confusing type errors in
 * any file that also handles browser events (e.g. React's
 * `React.MouseEvent`, `addEventListener`, etc.) and imports this type
 * under the same name.
 */
export interface AtlasEvent<TName extends AtlasEventName = AtlasEventName> {
  id: string;
  name: TName;
  category: EventCategory;
  source: EventSource;
  businessId: string;
  jobId?: string;
  payload: AtlasEventPayload<TName>;
  timestamp: string;
  /** Schema version of this event's payload shape, for future migrations. */
  version: number;
}

/**
 * Input to `eventBus.publish()`. `id`, `timestamp`, and `version` are
 * populated by the Event Bus — callers only supply the rest.
 */
export type PublishEventInput<TName extends AtlasEventName = AtlasEventName> = Omit<
  AtlasEvent<TName>,
  "id" | "timestamp" | "version"
> & {
  version?: number;
};

/**
 * A handler subscribed to receive events, either by exact name
 * (`eventBus.subscribe`) or by category (`eventBus.subscribeCategory`).
 */
export type EventHandler<TName extends AtlasEventName = AtlasEventName> = (
  event: AtlasEvent<TName>,
) => void;

/**
 * Convenience constants for Atlas's common event names, so callers get
 * autocomplete instead of hand-typing string literals, e.g.
 * `eventBus.subscribe(AtlasEventNames.JobCompleted, handler)`.
 */
export const AtlasEventNames = {
  BusinessCreated: "BusinessCreated",
  BusinessUpdated: "BusinessUpdated",
  BusinessDeleted: "BusinessDeleted",
  JobCreated: "JobCreated",
  JobStarted: "JobStarted",
  JobCompleted: "JobCompleted",
  JobFailed: "JobFailed",
  DiscoveryStarted: "DiscoveryStarted",
  DiscoveryCompleted: "DiscoveryCompleted",
  DiscoveryFailed: "DiscoveryFailed",
} as const satisfies Record<string, keyof AtlasEventPayloadMap>;
