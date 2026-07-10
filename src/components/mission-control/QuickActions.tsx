import { useState } from "react";
import {
  Plus,
  Radar,
  Globe,
  Network,
  SearchCheck,
  PenLine,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { QuickAction, QuickActionType } from "@/types/mission-control";

const ICONS: Record<string, LucideIcon> = {
  Plus,
  Radar,
  Globe,
  Network,
  SearchCheck,
  PenLine,
};

interface QuickActionsProps {
  actions: QuickAction[];
  onRunAction: (action: QuickActionType) => Promise<void>;
}

/**
 * The Quick Actions grid. Each card maps to one `missionControl` method —
 * none of which perform real work yet (see `src/lib/mission-control.ts`),
 * so triggering one surfaces its TODO(orchestration) message inline
 * rather than failing silently.
 */
export function QuickActions({ actions, onRunAction }: QuickActionsProps) {
  const [pendingAction, setPendingAction] = useState<QuickActionType | null>(null);
  const [message, setMessage] = useState<{ action: QuickActionType; text: string } | null>(null);

  async function handleClick(action: QuickActionType) {
    setPendingAction(action);
    setMessage(null);
    try {
      await onRunAction(action);
    } catch (error) {
      setMessage({
        action,
        text: error instanceof Error ? error.message : "This action isn't wired up yet.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {actions.map((quickAction) => {
        const Icon = ICONS[quickAction.icon] ?? Plus;
        return (
          <Card key={quickAction.id}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">{quickAction.title}</CardTitle>
                <CardDescription>{quickAction.description}</CardDescription>
              </div>
              <Icon className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Button
                size="sm"
                disabled={!quickAction.enabled || pendingAction === quickAction.action}
                onClick={() => handleClick(quickAction.action)}
              >
                {pendingAction === quickAction.action ? "Running..." : "Run"}
              </Button>
              {message?.action === quickAction.action && (
                <p className="mt-2 text-xs text-muted-foreground">{message.text}</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
