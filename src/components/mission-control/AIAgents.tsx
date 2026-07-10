import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
import type { AgentSummary, AgentStatus } from "@/types/mission-control";

interface AIAgentsProps {
  agents: AgentSummary[];
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  idle: "Idle",
  offline: "Offline",
  unavailable: "Unavailable",
  running: "Running",
};

const STATUS_BADGE_VARIANT: Record<AgentStatus, "default" | "secondary" | "destructive" | "outline"> = {
  idle: "secondary",
  offline: "outline",
  unavailable: "outline",
  running: "default",
};

/**
 * Status cards for Atlas's future AI agents (SEO, Marketing, Content,
 * Research, Finance). No agent logic exists yet — every agent reports
 * "Offline" until each has a real implementation behind it.
 */
export function AIAgents({ agents }: AIAgentsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {agents.map((agent) => (
        <Card key={agent.id}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{agent.name}</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={STATUS_BADGE_VARIANT[agent.status]}>{STATUS_LABEL[agent.status]}</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
