import { Bell, ChevronDown, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MissionHeaderProps {
  businessName?: string | null;
}

/**
 * Mission Control's top navigation: business switcher, global search,
 * notifications, and settings. The business switcher is a static
 * placeholder for now — Atlas doesn't have organization/business
 * switching UI yet (Business DNA's service layer already supports
 * multiple businesses per organization; only the UI to switch between
 * them is still pending).
 */
export function MissionHeader({ businessName }: MissionHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
      {/* Business switcher — placeholder until business switching UI exists */}
      <Button variant="outline" className="gap-2">
        <span className="max-w-[160px] truncate">{businessName ?? "Select business"}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </Button>

      <div className="relative flex-1 min-w-[200px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search Atlas..." className="pl-8" />
      </div>

      <Button variant="ghost" size="icon" aria-label="Notifications">
        <Bell className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Settings">
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}
