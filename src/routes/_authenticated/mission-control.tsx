import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { missionControl } from "@/lib/mission-control";
import { MissionHeader } from "@/components/mission-control/MissionHeader";
import { QuickActions } from "@/components/mission-control/QuickActions";
import { BusinessHealthCard } from "@/components/mission-control/BusinessHealthCard";
import { RunningJobs } from "@/components/mission-control/RunningJobs";
import { KnowledgeSummary } from "@/components/mission-control/KnowledgeSummary";
import { RecentActivity } from "@/components/mission-control/RecentActivity";
import { AIAgents } from "@/components/mission-control/AIAgents";
import { SystemStatus } from "@/components/mission-control/SystemStatus";
import { Globe, Radar, Network, SearchCheck, PenLine, Megaphone } from "lucide-react";
import type { QuickActionType } from "@/types/mission-control";

export const Route = createFileRoute("/_authenticated/mission-control")({
  component: MissionControlPage,
});

// TODO(multi-business): same placeholder pattern used in
// business-dna.tsx — once business switching UI exists, this should come
// from selected-business context/state instead. Consider centralizing
// this constant (and the selected-business concept generally) in one
// shared place once more than one page depends on it.
const CURRENT_BUSINESS_ID = "current-business";

function MissionControlPage() {
  const queryClient = useQueryClient();
  const businessId = CURRENT_BUSINESS_ID;

  const dashboardQuery = useQuery({
    queryKey: ["mission-control", businessId, "dashboard"],
    queryFn: () => missionControl.getDashboard(businessId),
  });

  const quickActionsQuery = useQuery({
    queryKey: ["mission-control", "quick-actions"],
    queryFn: () => missionControl.getQuickActions(),
  });

  async function handleRunAction(action: QuickActionType) {
    switch (action) {
      case "add-business":
        // TODO(orchestration): navigate to a "create business" flow once
        // one exists, rather than calling missionControl for this —
        // adding a business is a Business Service concern, not something
        // Mission Control coordinates as a Job.
        throw new Error("Add Business isn't wired up yet.");
      case "run-discovery":
        await missionControl.startDiscovery(businessId);
        break;
      case "run-crawl":
        // TODO(orchestration): a seed URL is needed here — likely the
        // business's own website from Business DNA once this is for real.
        await missionControl.startCrawl(businessId, "");
        break;
      case "refresh-knowledge":
        await missionControl.refreshKnowledge(businessId);
        break;
      case "run-seo-audit":
        await missionControl.runSeoAudit(businessId);
        break;
      case "generate-content":
        await missionControl.generateContent(businessId);
        break;
    }
    queryClient.invalidateQueries({ queryKey: ["mission-control", businessId] });
  }

  const dashboard = dashboardQuery.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <MissionHeader businessName={dashboard?.business.businessName} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Quick Actions</h2>
        <QuickActions actions={quickActionsQuery.data ?? []} onRunAction={handleRunAction} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Business Health</h2>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <BusinessHealthCard title="Website" icon={Globe} status={dashboard?.website.status ?? "unknown"} />
          <BusinessHealthCard title="Discovery" icon={Radar} status={dashboard?.discovery.status ?? "unknown"} />
          <BusinessHealthCard title="Knowledge" icon={Network} status={dashboard?.knowledge.status ?? "unknown"} />
          {/* TODO(orchestration): SEO, Content, and Marketing don't have
              real modules yet (see "Planned SEO modules" in
              docs/architecture/atlas-kernel.md), so these three always
              report "unknown" rather than a fabricated status. */}
          <BusinessHealthCard title="SEO" icon={SearchCheck} status="unknown" />
          <BusinessHealthCard title="Content" icon={PenLine} status="unknown" />
          <BusinessHealthCard title="Marketing" icon={Megaphone} status="unknown" />
        </div>
      </section>

      <RunningJobs jobs={dashboard?.jobs.jobs ?? []} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Knowledge Summary</h2>
        <KnowledgeSummary
          summary={
            dashboard?.knowledge ?? {
              status: "unknown",
              pageCount: 0,
              entityCount: 0,
              relationshipCount: 0,
              productCount: 0,
              serviceCount: 0,
              locationCount: 0,
            }
          }
        />
      </section>

      <RecentActivity activity={dashboard?.activity ?? { items: [] }} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">AI Agents</h2>
        <AIAgents agents={dashboard?.agents ?? []} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">System Status</h2>
        <SystemStatus
          status={
            dashboard?.system ?? {
              kernel: "unknown",
              discoveryLayer: "unknown",
              knowledgeLayer: "unknown",
              eventBus: "unknown",
              jobManager: "unknown",
              overall: "unknown",
            }
          }
        />
      </section>
    </div>
  );
}
