import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

type BusinessCardProps = {
  name: string;
  industry: string;
  emoji: string;
  onClick?: () => void;
};

export function BusinessCard({
  name,
  industry,
  emoji,
  onClick,
}: BusinessCardProps) {
  return (
    <Button
      variant="outline"
      className="justify-between h-16 w-full"
      onClick={onClick}
    >
      <div className="text-left">
        <div className="font-semibold">
          {emoji} {name}
        </div>

        <div className="text-xs text-muted-foreground">
          {industry}
        </div>
      </div>

      <ArrowRight className="h-4 w-4" />
    </Button>
  );
}