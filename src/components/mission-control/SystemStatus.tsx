import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cpu, Radar, Network, Zap, ListChecks, Gauge } from "lucide-react";
import type { SystemStatus as SystemStatusData, HealthLevel } from "@/types/mission-control";

interface SystemStatusProps {
  status: SystemStatusData;
}

const STATUS_LABEL: Record<HealthLevel, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
  running: "Running",
  unknown: "Unknown",
};

const STATUS_BADGE_VARIANT: Record<HealthLevel, "default" | "secondary" | "destructive" | "outline"> = {
  healthy: "default",
  warning: "secondary",
  critical: "destructive",
  running: "secondary",
  unknown: "outline",
};

/**
 * Reports the health of Atlas's own Kernel/Discovery/Knowledge layers, as
 * opposed to a single business's data (see BusinessHealthCard for that).
 * Placeholder healthy states for now — none of these layers have real
 * self-diagnostics implemented yet.
 */
export function SystemStatus({ status }: SystemStatusProps) {
  const cards: { label: string; value: HealthLevel; icon: typeof Cpu }[] = [
    { label: "Kernel", value: status.kernel, icon: Cpu },
    { label: "Discovery", value: status.discoveryLayer, icon: Radar },
    { label: "Knowledge", value: status.knowledgeLayer, icon: Network },
    { label: "Event Bus", value: status.eventBus, icon: Zap },
    { label: "Job Manager", value: status.jobManager, icon: ListChecks },
    { label: "Overall", value: status.overall, icon: Gauge },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={STATUS_BADGE_VARIANT[value]}>{STATUS_LABEL[value]}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
