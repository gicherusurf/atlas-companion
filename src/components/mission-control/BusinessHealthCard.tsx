import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { HealthLevel } from "@/types/mission-control";

interface BusinessHealthCardProps {
  title: string;
  icon: LucideIcon;
  status: HealthLevel;
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
 * A single Business Health card (Website, Discovery, Knowledge, SEO,
 * Content, Marketing). Reusable so future health cards can be added
 * without changing this component.
 */
export function BusinessHealthCard({ title, icon: Icon, status }: BusinessHealthCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <Badge variant={STATUS_BADGE_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
      </CardContent>
    </Card>
  );
}
