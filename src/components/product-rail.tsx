/**
 * Rangée de produits défilant horizontalement (au doigt sur mobile,
 * avec flèches sur ordinateur). Pas de défilement automatique.
 */
import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "@/lib/queries";
import { ProductCard } from "@/components/product-card";

export function ProductRail({
  title,
  subtitle,
  products,
  seeAll,
}: Readonly<{
  title: string;
  subtitle?: string;
  products: Product[];
  /** Lien « Tout voir » vers la boutique (avec ses filtres) ou vers « Mes commandes ». */
  seeAll?: { label?: string; search?: Record<string, string>; toOrders?: boolean };
}>) {
  const track = useRef<HTMLUListElement>(null);
  if (products.length === 0) return null;

  const scroll = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  return (
    <section className="rounded-lg bg-card p-4 shadow-soft md:p-5">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold md:text-xl">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {seeAll &&
            (seeAll.toOrders ? (
              <Link to="/orders" className="text-sm font-medium text-primary hover:underline">
                {seeAll.label ?? "Mes commandes"}
              </Link>
            ) : (
              <Link
                to="/shop"
                search={seeAll.search ?? {}}
                className="text-sm font-medium text-primary hover:underline"
              >
                {seeAll.label ?? "Tout voir"}
              </Link>
            ))}
          <button
            type="button"
            onClick={() => scroll(-1)}
            className="hidden h-8 w-8 place-items-center rounded-full border border-border hover:bg-secondary md:grid"
            aria-label={`Précédent : ${title}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            className="hidden h-8 w-8 place-items-center rounded-full border border-border hover:bg-secondary md:grid"
            aria-label={`Suivant : ${title}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <ul
        ref={track}
        className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]"
      >
        {products.map((p) => (
          <li key={p.id} className="w-[44%] shrink-0 snap-start sm:w-48 lg:w-52">
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}
