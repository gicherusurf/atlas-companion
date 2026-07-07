import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listProjects,
  deleteProject,
  updateProject,
  type Project,
} from "@/lib/projects-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProjectFormDialog } from "@/components/project-form-dialog";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  Globe,
  Search,
  FolderKanban,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [query, setQuery] = useState("");

  const archiveMut = useMutation({
    mutationFn: (p: Project) => updateProject(p.id, { archived: !p.archived }),
    onSuccess: (_d, p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(p.archived ? "Project restored" : "Project archived");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (data ?? []).filter((p) =>
    query ? p.name.toLowerCase().includes(query.toLowerCase()) : true,
  );
  const active = filtered.filter((p) => !p.archived);
  const archived = filtered.filter((p) => p.archived);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Create, edit and archive the projects in your workspace.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> New project
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search projects…"
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <ProjectGrid
            projects={active}
            loading={isLoading}
            emptyLabel="No projects yet. Create your first one."
            onEdit={(p) => {
              setEditing(p);
              setDialogOpen(true);
            }}
            onArchive={(p) => archiveMut.mutate(p)}
            onDelete={setDeleting}
          />
        </TabsContent>
        <TabsContent value="archived" className="mt-4">
          <ProjectGrid
            projects={archived}
            loading={isLoading}
            emptyLabel="Nothing archived."
            onEdit={(p) => {
              setEditing(p);
              setDialogOpen(true);
            }}
            onArchive={(p) => archiveMut.mutate(p)}
            onDelete={setDeleting}
          />
        </TabsContent>
      </Tabs>

      <ProjectFormDialog open={dialogOpen} onOpenChange={setDialogOpen} project={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-medium">{deleting?.name}</span>.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProjectGrid({
  projects,
  loading,
  emptyLabel,
  onEdit,
  onArchive,
  onDelete,
}: {
  projects: Project[];
  loading: boolean;
  emptyLabel: string;
  onEdit: (p: Project) => void;
  onArchive: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-16 text-center">
        <FolderKanban className="mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <Card key={p.id} className="group flex flex-col transition-colors hover:border-border">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{p.name}</CardTitle>
              {p.website && (
                <CardDescription className="mt-1 flex items-center gap-1 truncate text-xs">
                  <Globe className="h-3 w-3 shrink-0" />
                  <a
                    href={p.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate hover:underline"
                  >
                    {p.website.replace(/^https?:\/\//, "")}
                  </a>
                </CardDescription>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(p)}>
                  <Pencil className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onArchive(p)}>
                  {p.archived ? (
                    <>
                      <ArchiveRestore className="mr-2 h-4 w-4" /> Restore
                    </>
                  ) : (
                    <>
                      <Archive className="mr-2 h-4 w-4" /> Archive
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(p)}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-between gap-3">
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {p.description || "No description yet."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {p.industry && <Badge variant="secondary">{p.industry}</Badge>}
              {p.country && <Badge variant="outline">{p.country}</Badge>}
              {p.archived && <Badge variant="outline">Archived</Badge>}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Updated {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
