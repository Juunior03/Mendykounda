import { badgeLabel } from "@/lib/admin-alerts";
import { cn } from "@/lib/utils";

/** Pastille rouge avec un nombre (rien si 0). */
export function AlertBadge({
  count,
  label,
  className,
}: {
  count: number;
  /** Texte lu par les lecteurs d'écran, ex. « nouvelles commandes ». */
  label: string;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-destructive-foreground",
        className,
      )}
    >
      {badgeLabel(count)}
      <span className="sr-only"> {label}</span>
    </span>
  );
}
