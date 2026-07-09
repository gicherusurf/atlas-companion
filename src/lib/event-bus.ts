import type {
  AtlasEvent,
  AtlasEventName,
  EventCategory,
  EventHandler,
  PublishEventInput,
} from "@/types/event";

// Atlas Event Bus.
//
// The generic, in-process communication layer between Atlas modules.
// Modules publish events instead of calling each other directly — e.g.
// JobManager publishes JobCompleted rather than knowing who cares about it,
// and DiscoveryOrchestrator (or anything else) subscribes if it does.
//
// This module has no knowledge of SEO, website discovery, or any other
// domain — it only moves events around. Do not add domain-specific logic
// here; extend `AtlasEventPayloadMap` in `src/types/event.ts` instead.
//
// Deliberately minimal, per implementation rules: no Supabase, no Redis,
// no queues, no WebSockets. Everything is synchronous and in-memory, and
// resets whenever the process restarts (or `clear()` is called).

function generateEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID (older browsers,
  // some test runners). Good enough for an in-process event id.
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Invokes a handler defensively: one subscriber throwing must not stop the
 * event from reaching other subscribers, or crash the publisher.
 */
function safeInvoke<TName extends AtlasEventName>(
  handler: EventHandler<TName>,
  event: AtlasEvent<TName>,
): void {
  try {
    handler(event);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`EventBus: handler threw while handling "${event.name}"`, error);
  }
}

class AtlasEventBus {
  private handlersByName = new Map<string, Set<EventHandler<any>>>();
  private handlersByCategory = new Map<EventCategory, Set<EventHandler<any>>>();

  /**
   * Publishes an event, notifying every handler subscribed to its exact
   * name and every handler subscribed to its category. Returns the fully
   * constructed event (with generated `id`/`timestamp`/`version`) in case
   * the caller wants it (e.g. for logging).
   */
  publish<TName extends AtlasEventName>(input: PublishEventInput<TName>): AtlasEvent<TName> {
    const event: AtlasEvent<TName> = {
      ...input,
      id: generateEventId(),
      timestamp: new Date().toISOString(),
      version: input.version ?? 1,
    };

    const nameHandlers = this.handlersByName.get(event.name as string);
    if (nameHandlers) {
      for (const handler of nameHandlers) {
        safeInvoke(handler, event);
      }
    }

    const categoryHandlers = this.handlersByCategory.get(event.category);
    if (categoryHandlers) {
      for (const handler of categoryHandlers) {
        safeInvoke(handler, event);
      }
    }

    return event;
  }

  /**
   * Subscribes to events with an exact name. Multiple handlers may
   * subscribe to the same event name; all of them are notified on publish.
   * Returns an unsubscribe function as a convenience — equivalent to
   * calling `unsubscribe(eventName, handler)` yourself.
   */
  subscribe<TName extends AtlasEventName>(
    eventName: TName,
    handler: EventHandler<TName>,
  ): () => void {
    const key = eventName as string;
    let handlers = this.handlersByName.get(key);
    if (!handlers) {
      handlers = new Set();
      this.handlersByName.set(key, handlers);
    }
    handlers.add(handler as EventHandler<any>);

    return () => this.unsubscribe(eventName, handler);
  }

  /**
   * Removes a previously subscribed handler for an exact event name. Safe
   * to call even if the handler was never subscribed (no-op).
   */
  unsubscribe<TName extends AtlasEventName>(eventName: TName, handler: EventHandler<TName>): void {
    const key = eventName as string;
    const handlers = this.handlersByName.get(key);
    if (!handlers) return;

    handlers.delete(handler as EventHandler<any>);
    if (handlers.size === 0) {
      this.handlersByName.delete(key);
    }
  }

  /**
   * Subscribes to every event published under a given category, regardless
   * of event name. Useful for cross-cutting concerns (e.g. an audit logger
   * subscribing to the whole SEO category). Returns an unsubscribe
   * function.
   */
  subscribeCategory(category: EventCategory, handler: EventHandler<any>): () => void {
    let handlers = this.handlersByCategory.get(category);
    if (!handlers) {
      handlers = new Set();
      this.handlersByCategory.set(category, handlers);
    }
    handlers.add(handler);

    return () => {
      const current = this.handlersByCategory.get(category);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) {
        this.handlersByCategory.delete(category);
      }
    };
  }

  /**
   * Removes every subscription (by name and by category). Primarily
   * intended for test teardown between test cases.
   */
  clear(): void {
    this.handlersByName.clear();
    this.handlersByCategory.clear();
  }
}

/**
 * The Atlas Event Bus singleton. Import this instance everywhere — do not
 * instantiate `AtlasEventBus` directly.
 */
export const eventBus = new AtlasEventBus();
