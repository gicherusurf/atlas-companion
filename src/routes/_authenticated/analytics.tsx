import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";
export const Route = createFileRoute("/_authenticated/analytics")({
  component: () => (
    <PlaceholderPage title="Analytics" description="Understand traffic, engagement and performance." icon={BarChart3} />
  ),
});
