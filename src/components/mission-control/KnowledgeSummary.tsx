import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Network, GitBranch, Package, Wrench, MapPin } from "lucide-react";
import type { KnowledgeSummary as KnowledgeSummaryData } from "@/types/mission-control";

interface KnowledgeSummaryProps {
  summary: KnowledgeSummaryData;
}

/**
 * Six stat cards summarizing the Knowledge Graph and Page Repository for
 * a business. Displays zero rather than omitting a card when a count is
 * unavailable, per spec.
 */
export function KnowledgeSummary({ summary }: KnowledgeSummaryProps) {
  const stats = [
    { label: "Pages", value: summary.pageCount, icon: FileText },
    { label: "Entities", value: summary.entityCount, icon: Network },
    { label: "Relationships", value: summary.relationshipCount, icon: GitBranch },
    { label: "Products", value: summary.productCount, icon: Package },
    { label: "Services", value: summary.serviceCount, icon: Wrench },
    { label: "Locations", value: summary.locationCount, icon: MapPin },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tracking-tight">{value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
