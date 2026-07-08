import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BusinessCompetitor, BusinessCompetitorInput } from "@/types/business";

// Strategic business competitors, as part of Business DNA. This is a
// separate concept from the SEO / Market Intelligence "Competitors" module
// (search competitors, keyword rankings, backlinks) at /competitors.

interface CompetitorsTableProps {
  competitors: BusinessCompetitor[];
  isLoading?: boolean;
  onAdd: (input: BusinessCompetitorInput) => void;
  onEdit: (id: string, input: BusinessCompetitorInput) => void;
  onDelete: (id: string) => void;
}

const emptyForm: BusinessCompetitorInput = { name: "", website: "", notes: "" };

export function CompetitorsTable({
  competitors,
  isLoading,
  onAdd,
  onEdit,
  onDelete,
}: CompetitorsTableProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessCompetitor | null>(null);
  const [form, setForm] = useState<BusinessCompetitorInput>(emptyForm);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(competitor: BusinessCompetitor) {
    setEditing(competitor);
    setForm({
      name: competitor.name,
      website: competitor.website ?? "",
      notes: competitor.notes ?? "",
    });
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      onEdit(editing.id, form);
    } else {
      onAdd(form);
    }
    setOpen(false);
  }

  function handleDelete(competitor: BusinessCompetitor) {
    // TODO: swap for an AlertDialog confirmation once the shared component
    // is confirmed to exist in this project.
    if (window.confirm(`Delete "${competitor.name}"?`)) {
      onDelete(competitor.id);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Competitors</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Competitor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Competitor" : "Add Competitor"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="competitor-name">Name</Label>
                  <Input
                    id="competitor-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="competitor-website">Website</Label>
                  <Input
                    id="competitor-website"
                    type="url"
                    value={form.website ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    placeholder="https://competitor.com"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="competitor-notes">Notes</Label>
                  <Textarea
                    id="competitor-notes"
                    value={form.notes ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                    placeholder="Positioning, strengths, weaknesses..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{editing ? "Save changes" : "Add Competitor"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Website</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="w-[100px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                Loading...
              </TableCell>
            </TableRow>
          ) : competitors.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                No competitors yet.
              </TableCell>
            </TableRow>
          ) : (
            competitors.map((competitor) => (
              <TableRow key={competitor.id}>
                <TableCell className="font-medium">{competitor.name}</TableCell>
                <TableCell className="text-muted-foreground">{competitor.website || "—"}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {competitor.notes || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(competitor)}
                    aria-label="Edit competitor"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(competitor)}
                    aria-label="Delete competitor"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
