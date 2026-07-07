import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";
export const Route = createFileRoute("/_authenticated/publishing")({
  component: () => (
    <PlaceholderPage title="Publishing" description="Schedule and ship content across channels." icon={Send} />
  ),
});
