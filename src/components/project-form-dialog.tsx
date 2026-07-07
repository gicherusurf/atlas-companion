import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createProject, updateProject, type Project } from "@/lib/projects-api";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project?: Project | null;
}

const empty = { name: "", website: "", industry: "", country: "", description: "" };

export function ProjectFormDialog({ open, onOpenChange, project }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name ?? "",
        website: project.website ?? "",
        industry: project.industry ?? "",
        country: project.country ?? "",
        description: project.description ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [project, open]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        website: form.website.trim() || null,
        industry: form.industry.trim() || null,
        country: form.country.trim() || null,
        description: form.description.trim() || null,
      };
      if (project) return updateProject(project.id, payload);
      return createProject(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(project ? "Project updated" : "Project created");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return toast.error("Name is required");
            mutation.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>{project ? "Edit project" : "New project"}</DialogTitle>
            <DialogDescription>
              {project ? "Update the details of your project." : "Add a project to your workspace."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" placeholder="https://" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="industry">Industry</Label>
                <Input id="industry" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="country">Country</Label>
                <Input id="country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {project ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
