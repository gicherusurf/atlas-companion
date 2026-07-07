import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type Connection,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { listProjects } from "@/lib/projects-api";
import {
  listTopics,
  listRelationships,
  createTopic,
  updateTopic,
  deleteTopic,
  createRelationship,
  deleteRelationship,
  RELATIONSHIP_TYPES,
  type Topic,
  type TopicRelationship,
  type RelationshipType,
} from "@/lib/topics-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Plus, Trash2, Share2, X, AlertTriangle, Network } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/knowledge-graph")({
  component: KnowledgeGraphPage,
});

const NODE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7"];

function KnowledgeGraphPage() {
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId && projectsQuery.data && projectsQuery.data.length > 0) {
      const active = projectsQuery.data.find((p) => !p.archived) ?? projectsQuery.data[0];
      setProjectId(active.id);
    }
  }, [projectsQuery.data, projectId]);

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-[1400px] flex-col space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge Graph</h1>
          <p className="text-sm text-muted-foreground">
            Map topics and their relationships for the selected project.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={projectId ?? undefined}
            onValueChange={(v) => setProjectId(v)}
            disabled={projectsQuery.isLoading || !projectsQuery.data?.length}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projectsQuery.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {projectsQuery.isLoading ? (
        <Skeleton className="h-full w-full rounded-lg" />
      ) : projectsQuery.isError ? (
        <ErrorPanel message={(projectsQuery.error as Error).message} />
      ) : !projectsQuery.data?.length ? (
        <EmptyPanel
          title="No projects yet"
          description="Create a project on the Projects page before mapping topics."
        />
      ) : projectId ? (
        <Graph projectId={projectId} />
      ) : null}
    </div>
  );
}

function Graph({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const topicsQuery = useQuery({
    queryKey: ["topics", projectId],
    queryFn: () => listTopics(projectId),
  });
  const relsQuery = useQuery({
    queryKey: ["topic_relationships", projectId],
    queryFn: () => listRelationships(projectId),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingConn, setPendingConn] = useState<Connection | null>(null);
  const [pendingType, setPendingType] = useState<RelationshipType>("related");
  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null);

  // Sync topics into React Flow nodes
  useEffect(() => {
    if (!topicsQuery.data) return;
    setNodes(
      topicsQuery.data.map((t) => ({
        id: t.id,
        position: { x: t.position_x, y: t.position_y },
        data: { label: t.name },
        style: {
          background: `color-mix(in oklab, ${t.color} 22%, hsl(var(--card)))`,
          border: `1px solid ${t.color}`,
          color: "hsl(var(--foreground))",
          borderRadius: 10,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 500,
          minWidth: 140,
        },
      })),
    );
  }, [topicsQuery.data]);

  const edges: Edge[] = useMemo(
    () =>
      (relsQuery.data ?? []).map((r) => ({
        id: r.id,
        source: r.source_topic_id,
        target: r.target_topic_id,
        label: r.relationship_type,
        animated: r.relationship_type === "supports",
        labelStyle: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
        labelBgStyle: { fill: "hsl(var(--background))" },
        style: { stroke: relColor(r.relationship_type), strokeWidth: 1.5 },
      })),
    [relsQuery.data],
  );

  const selected = topicsQuery.data?.find((t) => t.id === selectedId) ?? null;

  const updatePos = useMutation({
    mutationFn: (v: { id: string; x: number; y: number }) =>
      updateTopic(v.id, { position_x: v.x, position_y: v.y }),
  });

  const updateMut = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof updateTopic>[1] }) =>
      updateTopic(v.id, v.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topics", projectId] });
      toast.success("Topic updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteTopic(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topics", projectId] });
      qc.invalidateQueries({ queryKey: ["topic_relationships", projectId] });
      setSelectedId(null);
      setDeletingTopic(null);
      toast.success("Topic deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createRelMut = useMutation({
    mutationFn: (v: Parameters<typeof createRelationship>[0]) => createRelationship(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topic_relationships", projectId] });
      setPendingConn(null);
      toast.success("Relationship created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRelMut = useMutation({
    mutationFn: (id: string) => deleteRelationship(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["topic_relationships", projectId] });
      toast.success("Relationship removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      for (const c of changes) {
        if (c.type === "position" && !c.dragging && c.position) {
          updatePos.mutate({ id: c.id, x: c.position.x, y: c.position.y });
        }
      }
    },
    [updatePos],
  );

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    setPendingType("related");
    setPendingConn(conn);
  }, []);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setSelectedId(node.id);
  }, []);

  if (topicsQuery.isLoading || relsQuery.isLoading) {
    return <Skeleton className="h-full w-full rounded-lg" />;
  }
  if (topicsQuery.isError || relsQuery.isError) {
    return (
      <ErrorPanel
        message={
          ((topicsQuery.error ?? relsQuery.error) as Error)?.message ?? "Failed to load graph"
        }
      />
    );
  }

  const hasTopics = (topicsQuery.data?.length ?? 0) > 0;

  return (
    <div className="relative flex min-h-0 flex-1 gap-4">
      <Card className="relative flex-1 overflow-hidden">
        <div className="absolute right-3 top-3 z-10">
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> New topic
          </Button>
        </div>
        {!hasTopics ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Network className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium">No topics yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first topic to start building the graph.
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> New topic
            </Button>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedId(null)}
            onEdgeClick={(_e, edge) => {
              if (confirm(`Remove "${edge.label}" relationship?`)) deleteRelMut.mutate(edge.id);
            }}
            fitView
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={20} size={1} />
            <Controls className="!bg-card !border-border" />
            <MiniMap
              className="!bg-card !border-border"
              maskColor="color-mix(in oklab, hsl(var(--background)) 70%, transparent)"
              nodeColor={() => "hsl(var(--primary))"}
            />
          </ReactFlow>
        )}
      </Card>

      {selected && (
        <DetailsPanel
          topic={selected}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => updateMut.mutate({ id: selected.id, patch })}
          onDelete={() => setDeletingTopic(selected)}
          saving={updateMut.isPending}
        />
      )}

      <TopicCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        onCreated={() => qc.invalidateQueries({ queryKey: ["topics", projectId] })}
      />

      <Dialog open={!!pendingConn} onOpenChange={(o) => !o && setPendingConn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New relationship</DialogTitle>
            <DialogDescription>Choose how these topics are connected.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={pendingType} onValueChange={(v) => setPendingType(v as RelationshipType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingConn(null)}>
              Cancel
            </Button>
            <Button
              disabled={createRelMut.isPending}
              onClick={() => {
                if (!pendingConn?.source || !pendingConn?.target) return;
                createRelMut.mutate({
                  project_id: projectId,
                  source_topic_id: pendingConn.source,
                  target_topic_id: pendingConn.target,
                  relationship_type: pendingType,
                });
              }}
            >
              <Share2 className="mr-2 h-4 w-4" /> Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingTopic}
        onOpenChange={(o) => !o && setDeletingTopic(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete topic?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <span className="font-medium">{deletingTopic?.name}</span> and all of
              its relationships. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingTopic && deleteMut.mutate(deletingTopic.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailsPanel({
  topic,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  topic: Topic;
  onClose: () => void;
  onSave: (patch: { name: string; description: string | null; color: string }) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(topic.name);
  const [description, setDescription] = useState(topic.description ?? "");
  const [color, setColor] = useState(topic.color);

  useEffect(() => {
    setName(topic.name);
    setDescription(topic.description ?? "");
    setColor(topic.color);
  }, [topic.id, topic.name, topic.description, topic.color]);

  const dirty =
    name !== topic.name || (description ?? "") !== (topic.description ?? "") || color !== topic.color;

  return (
    <Card className="flex w-[340px] shrink-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: topic.color }}
            aria-hidden
          />
          <span className="text-sm font-medium">Topic details</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <CardContent className="flex-1 space-y-4 overflow-auto p-4">
        <div className="space-y-2">
          <Label htmlFor="t-name">Name</Label>
          <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="t-desc">Description</Label>
          <Textarea
            id="t-desc"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {NODE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full border-2 transition ${
                  color === c ? "border-foreground" : "border-transparent"
                }`}
                style={{ background: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px]">
            Created {new Date(topic.created_at).toLocaleDateString()}
          </Badge>
        </div>
      </CardContent>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
        <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </Button>
        <Button
          size="sm"
          disabled={!dirty || !name.trim() || saving}
          onClick={() =>
            onSave({ name: name.trim(), description: description.trim() || null, color })
          }
        >
          Save
        </Button>
      </div>
    </Card>
  );
}

function TopicCreateDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(NODE_COLORS[0]);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setColor(NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)]);
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: () =>
      createTopic({
        project_id: projectId,
        name: name.trim(),
        description: description.trim() || null,
        color,
        position_x: Math.random() * 400,
        position_y: Math.random() * 300,
      }),
    onSuccess: () => {
      onCreated();
      onOpenChange(false);
      toast.success("Topic created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New topic</DialogTitle>
          <DialogDescription>Add a node to the knowledge graph.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-name">Name</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Content strategy"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-desc">Description</Label>
            <Textarea
              id="new-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {NODE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition ${
                    color === c ? "border-foreground" : "border-transparent"
                  }`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!name.trim() || mut.isPending} onClick={() => mut.mutate()}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-16 text-center">
      <Network className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-destructive/40 bg-destructive/5 py-16 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="max-w-md text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function relColor(t: RelationshipType) {
  switch (t) {
    case "parent":
      return "#6366f1";
    case "child":
      return "#06b6d4";
    case "supports":
      return "#22c55e";
    default:
      return "hsl(var(--muted-foreground))";
  }
}

// Referenced types kept to avoid unused-import warnings
export type _Refs = TopicRelationship;
