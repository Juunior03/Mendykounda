/**
 * Logos MendyKounda (kit officiel, couleurs fixes de la charte).
 * Le monogramme est dessiné en SVG inline ; le nom est du texte HTML
 * en Montserrat pour rester net à toutes les tailles.
 */
import { cn } from "@/lib/utils";

export const BRAND = {
  green: "#14532d",
  orange: "#d97706",
  leaf: "#15803d",
} as const;

/** Monogramme rond : M, soleil et feuille. `disc` ajoute le fond blanc (fonds sombres). */
export function BrandMark({
  className,
  disc = false,
}: Readonly<{ className?: string; disc?: boolean }>) {
  return (
    <svg viewBox="0 0 200 200" className={cn("shrink-0", className)} aria-hidden="true">
      {disc && <circle cx="100" cy="100" r="96" fill="#ffffff" />}
      <circle cx="100" cy="100" r="88" fill="none" stroke={BRAND.green} strokeWidth="11" />
      <circle cx="100" cy="72" r="23" fill={BRAND.orange} />
      <path
        d="M52 142 L73 86 L100 121 L127 86 L148 142"
        fill="none"
        stroke={BRAND.green}
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M100 44 C114 26, 132 40, 116 56 C107 63, 100 53, 100 44 Z" fill={BRAND.leaf} />
    </svg>
  );
}

/** Logo horizontal (header) : monogramme + nom + « Casamance • Ziguinchor ». */
export function BrandLogo({
  className,
  compact = false,
  inverted = false,
}: Readonly<{
  className?: string;
  /** Sans la ligne de sous-titre (petits écrans). */
  compact?: boolean;
  /** Sur fond sombre : monogramme sur disque blanc, texte clair. */
  inverted?: boolean;
}>) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark disc={inverted} className={compact ? "h-9 w-9" : "h-11 w-11"} />
      <span className="flex min-w-0 flex-col font-brand leading-none">
        <span
          className={cn(
            "truncate font-black tracking-wide",
            compact ? "text-base sm:text-lg" : "text-xl",
            inverted ? "text-white" : "text-[#14532d]",
          )}
        >
          MENDYKOUNDA
        </span>
        {!compact && (
          <span className="mt-1.5 flex items-center gap-1.5">
            <span className="h-[3px] w-5 rounded-full bg-[#d97706]" />
            <span
              className={cn(
                "text-[0.6rem] font-bold tracking-[0.18em]",
                inverted ? "text-white/80" : "text-[#14532d]",
              )}
            >
              CASAMANCE • ZIGUINCHOR
            </span>
          </span>
        )}
      </span>
    </span>
  );
}

/** Logo principal empilé (pages de connexion, 404…). */
export function BrandLogoStacked({ className }: Readonly<{ className?: string }>) {
  return (
    <span className={cn("flex flex-col items-center font-brand", className)}>
      <BrandMark className="h-20 w-20" />
      <span className="mt-3 text-2xl font-black tracking-wide text-[#14532d]">MENDYKOUNDA</span>
      <span className="mt-1 text-[0.65rem] font-bold tracking-[0.3em] text-[#d97706]">
        CASAMANCE • ZIGUINCHOR
      </span>
    </span>
  );
}
