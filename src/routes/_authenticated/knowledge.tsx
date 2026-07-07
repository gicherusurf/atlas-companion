import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";
export const Route = createFileRoute("/_authenticated/knowledge")({
  component: () => (
    <PlaceholderPage title="Knowledge" description="Central library of docs, briefs and references." icon={BookOpen} />
  ),
});
