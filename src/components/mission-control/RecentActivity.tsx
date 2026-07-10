import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ActivitySummary } from "@/types/mission-control";

interface RecentActivityProps {
  activity: ActivitySummary;
}

/**
 * A simple timeline of recent Atlas activity. Empty until an Event Store
 * exists for the Event Bus to persist history into (see
 * `getRecentActivity()` in `src/lib/mission-control.ts`) — this component
 * itself has no knowledge of the Event Bus; it only renders whatever
 * `ActivitySummary` it's given.
 */
export function RecentActivity({ activity }: RecentActivityProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Activity</CardTitle>
        <CardDescription>What's happened across Atlas recently.</CardDescription>
      </CardHeader>
      <CardContent>
        {activity.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/60 py-10 text-center">
            <Activity className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No recent activity.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {activity.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{item.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
