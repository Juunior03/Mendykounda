import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { z } from "zod";
import { categoriesQuery, productsQuery, type ProductsFilter } from "@/lib/queries";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const searchSchema = z.object({
  category: z.string().optional(),
  q: z.string().optional(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "name"]).optional(),
});

export const Route = createFileRoute("/_app/shop")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const filter: ProductsFilter = { categorySlug: deps.category, search: deps.q, minPrice: deps.min, maxPrice: deps.max, sort: deps.sort };
    await Promise.all([
      context.queryClient.ensureQueryData(productsQuery(filter)).catch(() => {}),
      context.queryClient.ensureQueryData(categoriesQuery()).catch(() => {}),
    ]);
  },
  component: ShopPage,
  head: () => ({ meta: [
    { title: "Boutique fermière — MendyKounda" },
    { name: "description", content: "Achetez volailles, œufs, produits laitiers et viandes fermières au Sénégal." },
    { property: "og:title", content: "Boutique fermière — MendyKounda" },
    { property: "og:description", content: "Produits fermiers frais, promotions et livraison directe au Sénégal." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function ShopPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const { data: products } = useSuspenseQuery(productsQuery({ categorySlug: search.category, search: search.q, minPrice: search.min, maxPrice: search.max, sort: search.sort }));
  const update = (next: Partial<typeof search>) => navigate({ search: (prev) => ({ ...prev, ...next }) as typeof search });

  const filters = (
    <div className="space-y-7">
      <div>
        <p className="mb-3 text-sm font-semibold">Catégories</p>
        <div className="flex flex-col gap-1">
          <Button variant={!search.category ? "secondary" : "ghost"} className="justify-start" onClick={() => update({ category: undefined })}>Toutes les catégories</Button>
          {categories.map((category) => <Button key={category.id} variant={search.category === category.slug ? "secondary" : "ghost"} className="justify-start" onClick={() => update({ category: category.slug })}>{category.name}</Button>)}
        </div>
      </div>
      <div>
        <p className="mb-3 text-sm font-semibold">Prix (FCFA)</p>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" value={search.min ?? ""} onChange={(event) => update({ min: event.target.value ? Number(event.target.value) : undefined })} placeholder="Min" className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm" />
          <input type="number" value={search.max ?? ""} onChange={(event) => update({ max: event.target.value ? Number(event.target.value) : undefined })} placeholder="Max" className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm" />
        </div>
      </div>
      {(search.category || search.q || search.min || search.max) && <Button variant="outline" className="w-full" asChild><Link to="/shop" search={{}}><X /> Effacer les filtres</Link></Button>}
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary/50 py-5 md:py-8">
      <div className="container-market">
        <div className="mb-5 space-y-2">
          <p className="text-xs text-muted-foreground">Accueil / Boutique</p>
          <h1 className="text-2xl font-semibold md:text-3xl">Produits fermiers</h1>
        </div>
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden self-start rounded-md bg-card p-5 shadow-soft lg:sticky lg:top-36 lg:block">{filters}</aside>
          <div className="min-w-0">
            <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-card p-3 shadow-soft sm:flex sm:justify-between">
              <p className="min-w-0 truncate text-sm"><span className="font-semibold">{products.length}</span> produit{products.length > 1 ? "s" : ""}{search.q ? ` pour « ${search.q} »` : ""}</p>
              <div className="flex shrink-0 items-center gap-2">
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild><Button variant="outline" size="sm" className="lg:hidden"><SlidersHorizontal /> Filtres</Button></SheetTrigger>
                  <SheetContent side="left" className="overflow-y-auto"><SheetHeader className="mb-6"><SheetTitle>Filtrer les produits</SheetTitle></SheetHeader>{filters}</SheetContent>
                </Sheet>
                <select value={search.sort ?? "newest"} onChange={(event) => update({ sort: event.target.value as never })} className="h-8 max-w-32 rounded-md border border-input bg-background px-2 text-xs sm:max-w-none sm:text-sm" aria-label="Trier les produits">
                  <option value="newest">Nouveautés</option><option value="price_asc">Prix croissant</option><option value="price_desc">Prix décroissant</option><option value="name">Nom (A–Z)</option>
                </select>
              </div>
            </div>
            {products.length === 0 ? <div className="rounded-md bg-card py-20 text-center shadow-soft"><p className="text-sm text-muted-foreground">Aucun produit ne correspond à votre recherche.</p></div> : <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
