import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListChecks } from "lucide-react";
import type { Job } from "@/types/job";

interface RunningJobsProps {
  jobs: Job[];
}

const STATUS_BADGE_VARIANT: Record<Job["status"], "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
  cancelled: "outline",
  retrying: "secondary",
};

/**
 * Displays Job Manager's current jobs for a business: name, status,
 * progress, and start time. Shows an explicit empty state rather than
 * inventing placeholder jobs — Job Manager has no real persistence yet,
 * so this will legitimately be empty until jobs are actually created.
 */
export function RunningJobs({ jobs }: RunningJobsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Running Jobs</CardTitle>
        <CardDescription>Asynchronous work currently tracked by Job Manager.</CardDescription>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/60 py-10 text-center">
            <ListChecks className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No running jobs</p>
            <p className="text-xs text-muted-foreground">
              Jobs created by Quick Actions will appear here.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">{job.type}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[job.status]}>{job.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{job.progress}%</TableCell>
                  <TableCell className="text-muted-foreground">
                    {job.startedAt
                      ? formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
