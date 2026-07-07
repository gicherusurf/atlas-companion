import { createFileRoute } from "@tanstack/react-router";
import { Target } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";
export const Route = createFileRoute("/_authenticated/competitors")({
  component: () => (
    <PlaceholderPage title="Competitors" description="Monitor competitor activity and positioning." icon={Target} />
  ),
});
