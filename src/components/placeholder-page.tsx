import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function PlaceholderPage({ title, description, icon: Icon }: Props) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Card className="border-dashed">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-6 w-6" />
          </div>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription className="max-w-md">
            This module is on the roadmap. Once enabled, you'll manage {title.toLowerCase()} directly from here.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
