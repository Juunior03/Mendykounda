/**
 * Note sur 5 étoiles (lecture seule), avec demi-précision visuelle arrondie.
 */
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stars({ rating, className }: { rating: number; className?: string }) {
  return (
    <div className={cn("flex", className)} aria-label={`${rating.toFixed(1)} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "h-3.5 w-3.5",
            n <= Math.round(rating) ? "fill-accent text-accent" : "text-muted-foreground/30",
          )}
        />
      ))}
    </div>
  );
}
