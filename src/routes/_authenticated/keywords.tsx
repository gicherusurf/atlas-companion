import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";
export const Route = createFileRoute("/_authenticated/keywords")({
  component: () => (
    <PlaceholderPage title="Keywords" description="Track and research the keywords that matter." icon={Search} />
  ),
});
