import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface BusinessHeaderProps {
  companyName?: string | null;
}

export function BusinessHeader({ companyName }: BusinessHeaderProps) {
  return (
    <Card className="relative overflow-hidden border-border/60">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_60%)]" />
      <CardHeader>
        <CardDescription>Core module</CardDescription>
        <CardTitle className="text-2xl md:text-3xl">
          {companyName ? companyName : "Business DNA"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          The foundational profile every other Atlas module builds on — company identity,
          products, markets, and strategic competitors.
        </p>
      </CardContent>
    </Card>
  );
}
