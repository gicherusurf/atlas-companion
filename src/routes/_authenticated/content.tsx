import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";
export const Route = createFileRoute("/_authenticated/content")({
  component: () => (
    <PlaceholderPage title="Content" description="Draft, review and manage your content pipeline." icon={FileText} />
  ),
});
