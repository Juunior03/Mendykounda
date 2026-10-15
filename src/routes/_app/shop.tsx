/**
 * Boutique — recherche, filtres (catégorie, prix, avis, disponibilité,
 * promotions), tri, filtres actifs en pastilles. Le catalogue est filtré
 * côté navigateur : prix promo et notes moyennes sont pris en compte.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, SlidersHorizontal, Star, Truck, X } from "lucide-react";
import { z } from "zod";
import { categoriesQuery, productsQuery, type Product } from "@/lib/queries";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { effectivePrice, hasPromo } from "@/lib/pricing";
import { formatPrice } from "@/lib/format";
import { formatDeliveryWindow } from "@/lib/delivery";
import { DELIVERY_AREA } from "@/lib/zones";
import { cn } from "@/lib/utils";
import { inSeason, isSeasonal } from "@/lib/season";

const SORTS = {
  relevance: "Pertinence",
  newest: "Nouveautés",
  price_asc: "Prix croissant",
  price_desc: "Prix décroissant",
  rating: "Mieux notés",
  name: "Nom (A–Z)",
} as const;
type SortKey = keyof typeof SORTS;

const searchSchema = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  min: z.coerce.number().min(0).optional(),
  max: z.coerce.number().min(0).optional(),
  rating: z.coerce.number().int().min(1).max(4).optional(),
  stock: z.coerce.boolean().optional(),
  promo: z.coerce.boolean().optional(),
  season: z.coerce.boolean().optional(),
  sort: z.enum(Object.keys(SORTS) as [SortKey, ...SortKey[]]).optional(),
});
type Search = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/_app/shop")({
  validateSearch: searchSchema,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(productsQuery({})).catch(() => {}),
      context.queryClient.ensureQueryData(categoriesQuery()).catch(() => {}),
    ]);
  },
  component: ShopPage,
  head: () => ({
    meta: [
      { title: "Boutique fermière — MendyKounda" },
      {
        name: "description",
        content:
          "Légumes, fruits de saison, volailles vivantes ou au kilo, porcs sur pied ou en viande, œufs, lait et jus de la ferme, livrés dans la région de Ziguinchor.",
      },
      { property: "og:title", content: "Boutique fermière — MendyKounda" },
      {
        property: "og:description",
        content: "Produits fermiers frais, promotions et livraison dans la région de Ziguinchor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Tranches de prix proposées (FCFA, prix effectif). */
const PRICE_RANGES: { label: string; min?: number; max?: number }[] = [
  { label: "Moins de 2 000 F", max: 2000 },
  { label: "2 000 à 5 000 F", min: 2000, max: 5000 },
  { label: "5 000 à 10 000 F", min: 5000, max: 10000 },
  { label: "Plus de 10 000 F", min: 10000 },
];

type Row = Product & { categories?: { slug: string } | null };

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").toLowerCase();

const words = (s: string) =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
/** Un mot de recherche correspond au début d'un mot (« oeuf » trouve « œufs », pas « bœuf »). */
const hits = (ws: string[], term: string) => ws.some((w) => w.startsWith(term));

/** Score de pertinence d'un produit pour une recherche (0 = pas de correspondance). */
function relevance(p: Row, terms: string[], categoryName: string) {
  const name = words(p.name);
  const desc = words(p.description ?? "");
  const cat = words(categoryName);
  let score = 0;
  for (const t of terms) {
    if (name[0]?.startsWith(t)) score += 4;
    else if (hits(name, t)) score += 3;
    else if (hits(cat, t)) score += 2;
    else if (hits(desc, t)) score += 1;
    else return 0; // tous les mots doivent être trouvés
  }
  return score;
}

function applyFilters(
  products: Row[],
  s: Search,
  catNameBySlug: Map<string, string>,
  ignore?: "category",
) {
  const terms = s.q ? words(s.q) : [];
  return products
    .map((p) => ({
      p,
      score: terms.length
        ? relevance(p, terms, catNameBySlug.get(p.categories?.slug ?? "") ?? "")
        : 1,
    }))
    .filter(({ p, score }) => score > 0 && matchesCategory(p, s, ignore) && matchesOptions(p, s));
}

function matchesCategory(p: Row, s: Search, ignore?: "category") {
  return ignore === "category" || !s.category || p.categories?.slug === s.category;
}

/** Prix, note, stock, promotion et saison. */
function matchesOptions(p: Row, s: Search) {
  const price = effectivePrice(p);
  const checks = [
    s.min == null || price >= s.min,
    s.max == null || price <= s.max,
    !s.rating || (p.rating_avg ?? 0) >= s.rating,
    !s.stock || (p.stock > 0 && inSeason(p)),
    !s.promo || hasPromo(p),
    !s.season || (isSeasonal(p) && inSeason(p)),
  ];
  return checks.every(Boolean);
}

const inStockRank = (p: Product) => Number(p.stock > 0 && inSeason(p));

function compareRows(sort: SortKey, a: { p: Row; score: number }, b: { p: Row; score: number }) {
  switch (sort) {
    case "price_asc":
      return effectivePrice(a.p) - effectivePrice(b.p);
    case "price_desc":
      return effectivePrice(b.p) - effectivePrice(a.p);
    case "rating":
      return (
        (b.p.rating_avg ?? 0) - (a.p.rating_avg ?? 0) ||
        (b.p.rating_count ?? 0) - (a.p.rating_count ?? 0)
      );
    case "name":
      return a.p.name.localeCompare(b.p.name, "fr");
    case "relevance":
      return b.score - a.score || inStockRank(b.p) - inStockRank(a.p);
    default:
      // Nouveautés, produits en stock d'abord.
      return inStockRank(b.p) - inStockRank(a.p) || b.p.created_at.localeCompare(a.p.created_at);
  }
}

function priceChipLabel(min?: number, max?: number) {
  if (min != null && max != null) return `${formatPrice(min)} – ${formatPrice(max)}`;
  if (min != null) return `Dès ${formatPrice(min)}`;
  return `Jusqu'à ${formatPrice(max ?? 0)}`;
}

/** Filtres actifs, affichés en pastilles que l'on peut retirer. */
function activeChips(search: Search, catNameBySlug: Map<string, string>) {
  const chips: { label: string; clear: Partial<Search> }[] = [];
  if (search.q) chips.push({ label: `« ${search.q} »`, clear: { q: undefined } });
  if (search.category)
    chips.push({
      label: catNameBySlug.get(search.category) ?? search.category,
      clear: { category: undefined },
    });
  if (search.min != null || search.max != null)
    chips.push({
      label: priceChipLabel(search.min, search.max),
      clear: { min: undefined, max: undefined },
    });
  if (search.rating)
    chips.push({ label: `${search.rating} étoiles et plus`, clear: { rating: undefined } });
  if (search.stock) chips.push({ label: "En stock", clear: { stock: undefined } });
  if (search.promo) chips.push({ label: "En promotion", clear: { promo: undefined } });
  if (search.season) chips.push({ label: "De saison", clear: { season: undefined } });
  return chips;
}

function shopTitle(search: Search, catNameBySlug: Map<string, string>) {
  if (search.q) return `Résultats pour « ${search.q} »`;
  if (search.category) return catNameBySlug.get(search.category) ?? "Boutique";
  return "Toute la boutique";
}

function ShopPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const { data: all } = useSuspenseQuery(productsQuery({}));
  const products = all as Row[];

  const catNameBySlug = useMemo(
    () => new Map(categories.map((c) => [c.slug, c.name])),
    [categories],
  );
  const sort: SortKey = search.sort ?? (search.q ? "relevance" : "newest");

  const results = useMemo(() => {
    const rows = applyFilters(products, search, catNameBySlug);
    rows.sort((a, b) => compareRows(sort, a, b));
    return rows.map((r) => r.p);
  }, [products, search, sort, catNameBySlug]);

  // Compteurs par catégorie avec les autres filtres appliqués.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { p } of applyFilters(products, search, catNameBySlug, "category")) {
      const slug = p.categories?.slug;
      if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return counts;
  }, [products, search, catNameBySlug]);

  const update = (next: Partial<Search>) => {
    void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  };

  const chips = activeChips(search, catNameBySlug);
  const filterCount = chips.filter((c) => !("q" in c.clear)).length;
  const title = shopTitle(search, catNameBySlug);

  const filters = (
    <Filters
      search={search}
      update={update}
      categories={categories.map((c) => ({ ...c, count: categoryCounts.get(c.slug) ?? 0 }))}
      totalForAllCategories={[...categoryCounts.values()].reduce((a, b) => a + b, 0)}
    />
  );

  return (
    <div className="min-h-screen bg-secondary/50 py-5 md:py-8">
      <div className="container-market">
        <nav className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">
            Accueil
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/shop" search={{}} className="hover:text-primary">
            Boutique
          </Link>
          {search.category && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">{catNameBySlug.get(search.category)}</span>
            </>
          )}
        </nav>
        <h1 className="text-balance text-2xl font-semibold md:text-3xl">{title}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Truck className="h-4 w-4 text-primary" aria-hidden />
          Livraison dans {DELIVERY_AREA} · {formatDeliveryWindow()}
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="hidden self-start rounded-lg bg-card p-5 shadow-soft lg:sticky lg:top-40 lg:block">
            {filters}
          </aside>

          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card p-3 shadow-soft">
              <p className="text-sm">
                <span className="font-semibold tabular-nums">{results.length}</span> produit
                {results.length > 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="lg:hidden">
                      <SlidersHorizontal /> Filtres
                      {filterCount > 0 && (
                        <span className="rounded-full bg-foreground px-1.5 text-[10px] text-background">
                          {filterCount}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="overflow-y-auto">
                    <SheetHeader className="mb-4">
                      <SheetTitle>Filtrer les produits</SheetTitle>
                    </SheetHeader>
                    {filters}
                    <Button className="mt-6 w-full" onClick={() => setFiltersOpen(false)}>
                      Voir {results.length} produit{results.length > 1 ? "s" : ""}
                    </Button>
                  </SheetContent>
                </Sheet>
                <label className="flex items-center gap-2 text-sm">
                  <span className="hidden text-muted-foreground sm:inline">Trier par</span>
                  <select
                    value={sort}
                    onChange={(e) => update({ sort: e.target.value as SortKey })}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    aria-label="Trier les produits"
                  >
                    {(Object.keys(SORTS) as SortKey[])
                      .filter((k) => k !== "relevance" || search.q)
                      .map((k) => (
                        <option key={k} value={k}>
                          {SORTS[k]}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>

            {chips.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {chips.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => update(c.clear)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs hover:border-foreground"
                    aria-label={`Retirer le filtre ${c.label}`}
                  >
                    {c.label} <X className="h-3 w-3" />
                  </button>
                ))}
                <Link to="/shop" search={{}} className="text-xs text-primary hover:underline">
                  Tout effacer
                </Link>
              </div>
            )}

            {results.length === 0 ? (
              <div className="rounded-lg bg-card px-6 py-16 text-center shadow-soft">
                <p className="text-base font-medium">
                  Aucun produit ne correspond à votre recherche.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Essayez un autre mot ou retirez des filtres.
                </p>
                <Button variant="outline" className="mt-5" asChild>
                  <Link to="/shop" search={{}}>
                    Voir tous les produits
                  </Link>
                </Button>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {results.map((p) => (
                  <li key={p.id}>
                    <ProductCard product={p} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Filters({
  search,
  update,
  categories,
  totalForAllCategories,
}: {
  search: Search;
  update: (next: Partial<Search>) => void;
  categories: { id: string; slug: string; name: string; count: number }[];
  totalForAllCategories: number;
}) {
  // Champs prix : appliqués sur « OK » (pas de rechargement à chaque frappe).
  const [min, setMin] = useState(search.min?.toString() ?? "");
  const [max, setMax] = useState(search.max?.toString() ?? "");
  useEffect(() => {
    setMin(search.min?.toString() ?? "");
    setMax(search.max?.toString() ?? "");
  }, [search.min, search.max]);

  const option = (active: boolean) =>
    cn(
      "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary",
      active && "bg-secondary font-medium text-primary",
    );

  return (
    <div className="space-y-6">
      <FilterGroup title="Catégorie">
        <button
          className={option(!search.category)}
          onClick={() => update({ category: undefined })}
        >
          Toutes{" "}
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalForAllCategories}
          </span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={option(search.category === c.slug)}
            onClick={() => update({ category: search.category === c.slug ? undefined : c.slug })}
            disabled={c.count === 0 && search.category !== c.slug}
          >
            <span className={c.count === 0 ? "text-muted-foreground" : ""}>{c.name}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{c.count}</span>
          </button>
        ))}
      </FilterGroup>

      <FilterGroup title="Prix">
        {PRICE_RANGES.map((r) => {
          const active = search.min === r.min && search.max === r.max;
          return (
            <button
              key={r.label}
              className={option(active)}
              onClick={() =>
                update(active ? { min: undefined, max: undefined } : { min: r.min, max: r.max })
              }
            >
              {r.label}
            </button>
          );
        })}
        <form
          className="mt-2 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            update({ min: min ? Number(min) : undefined, max: max ? Number(max) : undefined });
          }}
        >
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="Min"
            aria-label="Prix minimum"
            className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="Max"
            aria-label="Prix maximum"
            className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
          />
          <Button type="submit" size="sm" variant="outline" className="h-8 px-2.5">
            OK
          </Button>
        </form>
      </FilterGroup>

      <FilterGroup title="Avis clients">
        {[4, 3, 2].map((n) => (
          <button
            key={n}
            className={option(search.rating === n)}
            onClick={() => update({ rating: search.rating === n ? undefined : n })}
          >
            <span className="flex items-center gap-1.5">
              <span className="flex" aria-hidden>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-3.5 w-3.5",
                      i <= n ? "fill-accent text-accent" : "text-muted-foreground/30",
                    )}
                  />
                ))}
              </span>
              et plus
            </span>
          </button>
        ))}
      </FilterGroup>

      <FilterGroup title="Disponibilité et offres">
        <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={!!search.stock}
            onChange={(e) => update({ stock: e.target.checked || undefined })}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          En stock uniquement
        </label>
        <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={!!search.promo}
            onChange={(e) => update({ promo: e.target.checked || undefined })}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          En promotion
        </label>
        <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={!!search.season}
            onChange={(e) => update({ season: e.target.checked || undefined })}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          De saison en ce moment
        </label>
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  );
}
