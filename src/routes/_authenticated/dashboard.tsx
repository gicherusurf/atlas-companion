import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listProjects } from "@/lib/projects-api";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderKanban,
  Sparkles,
  Plus,
  BookOpen,
  Search,
  FileText,
  ArrowRight,
  Activity,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const active = projects?.filter((p) => !p.archived) ?? [];
  const archived = projects?.filter((p) => p.archived) ?? [];
  const recent = active.slice(0, 5);
  const name = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Welcome */}
      <Card className="relative overflow-hidden border-border/60">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_60%)]" />
        <CardHeader>
          <CardDescription>Welcome back</CardDescription>
          <CardTitle className="text-2xl md:text-3xl">Good to see you, {name}.</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link to="/projects">
              <Plus className="mr-2 h-4 w-4" /> New project
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/knowledge">Browse knowledge</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Projects"
          value={isLoading ? undefined : active.length}
          hint={`${archived.length} archived`}
          icon={<FolderKanban className="h-4 w-4" />}
        />
        <StatCard
          title="AI Activity"
          value={0}
          hint="Runs in last 7 days"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          title="Signals"
          value={0}
          hint="No new signals"
          icon={<Activity className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent projects */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Recent projects</CardTitle>
              <CardDescription>Your most recently updated projects</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/projects">
                View all <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="divide-y divide-border/60">
                {recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.website || p.industry || "No details"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.industry && (
                        <Badge variant="secondary" className="hidden sm:inline-flex">
                          {p.industry}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
            <CardDescription>Jump straight into work</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <QuickAction to="/projects" icon={<Plus className="h-4 w-4" />} label="Create project" />
            <QuickAction to="/knowledge" icon={<BookOpen className="h-4 w-4" />} label="Add knowledge" />
            <QuickAction to="/keywords" icon={<Search className="h-4 w-4" />} label="Research keywords" />
            <QuickAction to="/content" icon={<FileText className="h-4 w-4" />} label="Draft content" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: number | undefined;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">
          {value === undefined ? <Skeleton className="h-8 w-12" /> : value}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function QuickAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Button variant="ghost" className="w-full justify-start" asChild>
      <Link to={to}>
        <span className="mr-2 flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
        {label}
      </Link>
    </Button>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border/60 py-10 text-center">
      <FolderKanban className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">No projects yet</p>
      <p className="mb-4 text-xs text-muted-foreground">Create your first project to get started.</p>
      <Button asChild size="sm">
        <Link to="/projects">
          <Plus className="mr-2 h-4 w-4" /> New project
        </Link>
      </Button>
    </div>
  );
}
