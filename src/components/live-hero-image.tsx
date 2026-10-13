/**
 * Photo de la bannière d'accueil animée comme un fond d'écran de Mac :
 * travelling très lent, halo de soleil mobile, et teinte selon l'heure
 * (aube, journée, fin de journée, nuit — heure de Dakar).
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Phase = "dawn" | "day" | "dusk" | "night";

/** Heure de Dakar (= UTC) → moment de la journée. */
function dayPhase(date = new Date()): Phase {
  const h = date.getUTCHours() + date.getUTCMinutes() / 60;
  if (h >= 6 && h < 8.5) return "dawn";
  if (h >= 8.5 && h < 17.5) return "day";
  if (h >= 17.5 && h < 19.75) return "dusk";
  return "night";
}

const TINT: Record<Phase, string> = {
  dawn: "bg-gradient-to-br from-orange-400/40 via-rose-300/20 to-sky-200/10 mix-blend-soft-light",
  day: "bg-transparent",
  dusk: "bg-gradient-to-tr from-orange-600/55 via-rose-500/30 to-amber-300/20 mix-blend-multiply",
  night: "bg-gradient-to-b from-[#0a1a3d]/80 via-[#13285a]/65 to-[#0a1a3d]/55 mix-blend-multiply",
};

export function LiveHeroImage({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  // Calculé après le chargement (l'heure du serveur peut différer).
  const [phase, setPhase] = useState<Phase>("day");
  useEffect(() => {
    const update = () => setPhase(dayPhase());
    update();
    const t = setInterval(update, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="hero-drift absolute inset-0 h-full w-full object-cover"
      />
      {phase !== "night" && <div className="hero-glow" aria-hidden />}
      <div
        aria-hidden
        className={cn("absolute inset-0 transition-colors duration-[2000ms]", TINT[phase])}
      />
    </div>
  );
}
