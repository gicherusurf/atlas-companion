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
import type { Market, MarketInput } from "@/types/business";

interface MarketsTableProps {
  markets: Market[];
  isLoading?: boolean;
  onAdd: (input: MarketInput) => void;
  onEdit: (id: string, input: MarketInput) => void;
  onDelete: (id: string) => void;
}

const emptyForm: MarketInput = { name: "", region: "", notes: "" };

export function MarketsTable({ markets, isLoading, onAdd, onEdit, onDelete }: MarketsTableProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Market | null>(null);
  const [form, setForm] = useState<MarketInput>(emptyForm);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(market: Market) {
    setEditing(market);
    setForm({ name: market.name, region: market.region ?? "", notes: market.notes ?? "" });
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

  function handleDelete(market: Market) {
    // TODO: swap for an AlertDialog confirmation once the shared component
    // is confirmed to exist in this project.
    if (window.confirm(`Delete "${market.name}"?`)) {
      onDelete(market.id);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Markets</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openAdd}>
              <Plus className="mr-1.5 h-4 w-4" /> Add Market
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Market" : "Add Market"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="market-name">Name</Label>
                  <Input
                    id="market-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="market-region">Region</Label>
                  <Input
                    id="market-region"
                    value={form.region ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                    placeholder="e.g. North America"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="market-notes">Notes</Label>
                  <Textarea
                    id="market-notes"
                    value={form.notes ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{editing ? "Save changes" : "Add Market"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Region</TableHead>
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
          ) : markets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                No markets yet.
              </TableCell>
            </TableRow>
          ) : (
            markets.map((market) => (
              <TableRow key={market.id}>
                <TableCell className="font-medium">{market.name}</TableCell>
                <TableCell className="text-muted-foreground">{market.region || "—"}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {market.notes || "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(market)} aria-label="Edit market">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(market)}
                    aria-label="Delete market"
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
