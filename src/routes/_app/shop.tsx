/**
 * Shop page — advanced filters: category, search, price range, sort.
 * Filters are URL-search-state for shareable links.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { categoriesQuery, productsQuery, type ProductsFilter } from "@/lib/queries";
import { ProductCard } from "@/components/product-card";

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
    const filter: ProductsFilter = {
      categorySlug: deps.category,
      search: deps.q,
      minPrice: deps.min,
      maxPrice: deps.max,
      sort: deps.sort,
    };
    await Promise.all([
      context.queryClient.ensureQueryData(productsQuery(filter)).catch(() => {}),
      context.queryClient.ensureQueryData(categoriesQuery()).catch(() => {}),
    ]);
  },
  component: ShopPage,
  head: () => ({
    meta: [
      { title: "Boutique — MendyKounda" },
      { name: "description", content: "Volailles, œufs, laitiers et viandes fermières." },
    ],
  }),
});

function ShopPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const { data: products } = useSuspenseQuery(
    productsQuery({
      categorySlug: search.category,
      search: search.q,
      minPrice: search.min,
      maxPrice: search.max,
      sort: search.sort,
    }),
  );

  const update = (next: Partial<typeof search>) =>
    navigate({ search: (prev) => ({ ...prev, ...next }) as typeof search });

  return (
    <div className="container-editorial py-12 md:py-20">
      <div className="mb-10 flex flex-col gap-3">
        <p className="editorial-eyebrow">Boutique</p>
        <h1 className="text-balance text-3xl font-medium tracking-tight md:text-5xl">
          Tous nos produits fermiers
        </h1>
      </div>

      <div className="flex flex-col gap-10 lg:flex-row">
        {/* FILTERS */}
        <aside className="lg:w-64 lg:flex-shrink-0">
          <div className="sticky top-24 space-y-8">
            <div>
              <p className="editorial-eyebrow mb-4">Catégorie</p>
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => update({ category: undefined })}
                  className={`text-left text-sm transition-colors ${!search.category ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Toutes les catégories
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => update({ category: c.slug })}
                    className={`text-left text-sm transition-colors ${search.category === c.slug ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="editorial-eyebrow mb-4">Recherche</p>
              <input
                type="search"
                value={search.q ?? ""}
                onChange={(e) => update({ q: e.target.value || undefined })}
                placeholder="Nom du produit…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <p className="editorial-eyebrow mb-4">Prix (FCFA)</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={search.min ?? ""}
                  onChange={(e) => update({ min: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Min"
                  className="w-1/2 rounded-md border border-border bg-background px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  value={search.max ?? ""}
                  onChange={(e) => update({ max: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Max"
                  className="w-1/2 rounded-md border border-border bg-background px-2 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <p className="editorial-eyebrow mb-4">Trier par</p>
              <select
                value={search.sort ?? "newest"}
                onChange={(e) => update({ sort: e.target.value as never })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="newest">Nouveautés</option>
                <option value="price_asc">Prix croissant</option>
                <option value="price_desc">Prix décroissant</option>
                <option value="name">Nom (A–Z)</option>
              </select>
            </div>

            {(search.category || search.q || search.min || search.max) && (
              <Link
                to="/shop"
                search={{}}
                className="text-xs underline-grow text-muted-foreground"
              >
                Réinitialiser les filtres
              </Link>
            )}
          </div>
        </aside>

        {/* GRID */}
        <div className="flex-1">
          <p className="mb-6 text-xs text-muted-foreground">
            {products.length} produit{products.length > 1 ? "s" : ""}
          </p>
          {products.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-20 text-center">
              <p className="text-sm text-muted-foreground">Aucun produit ne correspond à votre recherche.</p>
            </div>
          ) : (
            <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
