/**
 * Accueil — bannière, espace personnel, catégories, « Commander à nouveau »,
 * rangées de produits (promotions, coups de cœur, mieux notés, nouveautés).
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Clock3,
  Package,
  ShieldCheck,
  ShoppingBag,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";
import { categoriesQuery, productsQuery, type Product } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ProductRail } from "@/components/product-rail";
import { resolveProductImage } from "@/lib/product-images";
import { hasPromo } from "@/lib/pricing";
import { formatDeliveryWindow, formatLongDate, deliveryWindow } from "@/lib/delivery";
import { ORDER_STATUS_LABEL, type OrderStatus } from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import { DELIVERY_AREA } from "@/lib/zones";
import hero from "@/assets/market-hero.jpg";

export const Route = createFileRoute("/_app/")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(productsQuery({})).catch(() => {}),
      context.queryClient.ensureQueryData(categoriesQuery()).catch(() => {}),
    ]);
  },
  component: HomePage,
  head: () => ({
    meta: [
      { title: "MendyKounda — Produits fermiers en Casamance" },
      {
        name: "description",
        content:
          "Légumes, fruits de saison, volailles, porcs, viandes, œufs, lait et jus livrés directement par la ferme dans la région de Ziguinchor.",
      },
      { property: "og:title", content: "MendyKounda — Produits fermiers en Casamance" },
      {
        property: "og:description",
        content: "Commandez des produits fermiers frais et locaux, cultivés et élevés à la ferme.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** Nombre minimum de produits pour afficher une rangée thématique. */
const MIN_RAIL = 3;

type WithCategory = Product & { categories?: { slug: string } | null };

function HomePage() {
  const { data: products } = useSuspenseQuery(productsQuery({}));
  const { data: categories } = useSuspenseQuery(categoriesQuery());

  const inStockFirst = (a: Product, b: Product) => Number(b.stock > 0) - Number(a.stock > 0);
  const promos = products.filter(hasPromo).sort(inStockFirst);
  const featured = products.filter((p) => p.is_featured).sort(inStockFirst);
  const topRated = products
    .filter((p) => (p.rating_count ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.rating_avg ?? 0) - (a.rating_avg ?? 0) || (b.rating_count ?? 0) - (a.rating_count ?? 0),
    )
    .slice(0, 12);
  // Petit catalogue : on évite de répéter les mêmes produits dans chaque rangée.
  const smallCatalog = products.length < 8;
  const newest = [...products]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 12);

  // Une photo par catégorie : celle d'un produit de la catégorie (en stock de préférence).
  const tiles = categories.map((c) => {
    const inCat = (products as WithCategory[])
      .filter((p) => p.categories?.slug === c.slug)
      .sort(inStockFirst);
    return {
      ...c,
      count: inCat.length,
      image:
        resolveProductImage(c.image_url) ??
        resolveProductImage(inCat.find((p) => p.image_url)?.image_url),
    };
  });

  return (
    <div className="bg-secondary/50 pb-12">
      {/* Bannière + espace personnel */}
      <section className="container-market grid gap-4 pt-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative isolate min-h-[300px] overflow-hidden rounded-lg md:min-h-[380px]">
          <img
            src={hero}
            alt="Poules élevées en plein air à la ferme MendyKounda"
            width={1600}
            height={900}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/10 md:bg-gradient-to-r md:from-black/65 md:via-black/35 md:to-transparent" />
          <div className="relative flex min-h-[300px] max-w-xl flex-col justify-end p-6 text-white md:min-h-[380px] md:p-10">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/80">
              Directement de notre ferme
            </p>
            <h1 className="text-balance text-3xl font-semibold leading-tight md:text-5xl">
              Le frais de la Casamance, livré chez vous.
            </h1>
            <p className="mt-3 max-w-md text-sm text-white/85 md:text-base">
              Légumes, fruits de saison, volailles, porcs, viandes, jus… tout vient de la ferme, livré dans {DELIVERY_AREA}{" "}
              {formatDeliveryWindow()}.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/shop"
                className="inline-flex items-center gap-1 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent/90"
              >
                Découvrir la boutique <ChevronRight className="h-4 w-4" />
              </Link>
              {promos.length > 0 && (
                <a
                  href="#promotions"
                  className="inline-flex items-center rounded-full border border-white/60 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10"
                >
                  Voir les promotions
                </a>
              )}
            </div>
          </div>
        </div>

        <PersonalPanel />
      </section>

      {/* Atouts */}
      <section className="container-market pt-4">
        <ul className="grid grid-cols-2 gap-2 rounded-lg bg-card p-3 shadow-soft md:grid-cols-4">
          {(
            [
              [Truck, "Livraison en 1 à 3 jours", "Dans toute la région de Ziguinchor"],
              [Wallet, "Paiement à la livraison", "Vous payez à la réception"],
              [ShieldCheck, "Annulation gratuite", "Tant que ce n'est pas expédié"],
              [Clock3, "Direct producteur", "Sans intermédiaire"],
            ] as const
          ).map(([Icon, title, text]) => (
            <li key={title} className="flex min-w-0 items-center gap-3 p-2">
              <Icon className="h-6 w-6 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <strong className="block text-xs font-semibold sm:text-sm">{title}</strong>
                <small className="hidden text-muted-foreground sm:block">{text}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="container-market space-y-4 pt-4">
        {/* Catégories */}
        {tiles.length > 0 && (
          <section className="rounded-lg bg-card p-4 shadow-soft md:p-5">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-lg font-semibold md:text-xl">Achetez par catégorie</h2>
              <Link to="/shop" className="text-sm font-medium text-primary hover:underline">
                Toute la boutique
              </Link>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {tiles.map((c) => (
                <li key={c.id}>
                  <Link to="/shop" search={{ category: c.slug }} className="group block">
                    <div className="aspect-square overflow-hidden rounded-md bg-warm">
                      {c.image ? (
                        <img
                          src={c.image}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="grid h-full place-items-center">
                          <ShoppingBag className="h-8 w-8 text-muted-foreground" aria-hidden />
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-medium group-hover:text-primary">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.count} produit{c.count > 1 ? "s" : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <BuyAgainRail products={products} />

        <div id="promotions" className="scroll-mt-40">
          <ProductRail
            title="Promotions en cours"
            subtitle="Profitez-en tant qu'il y a du stock"
            products={promos}
          />
        </div>
        <ProductRail
          title="Coups de cœur de la ferme"
          products={featured.length >= MIN_RAIL ? featured : []}
          seeAll={{ label: "Tout voir" }}
        />
        <ProductRail
          title="Les mieux notés"
          subtitle="Selon les avis de nos clients"
          products={topRated.length >= MIN_RAIL ? topRated : []}
        />
        <ProductRail
          title={smallCatalog ? "Tous nos produits" : "Nouveautés"}
          products={newest}
          seeAll={{ search: { sort: "newest" } }}
        />

        {/* Comment ça marche */}
        <section className="rounded-lg bg-card p-5 shadow-soft md:p-6">
          <h2 className="text-lg font-semibold md:text-xl">Comment ça marche</h2>
          <ol className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              [
                "Vous commandez",
                "Choisissez vos produits et validez votre panier en quelques clics.",
              ],
              [
                "Nous préparons",
                "La ferme prépare votre commande ; suivez chaque étape dans « Mes commandes ».",
              ],
              [
                "Vous êtes livré",
                `Livraison ${formatDeliveryWindow()} pour une commande passée aujourd'hui. Vous payez à la réception.`,
              ],
            ].map(([title, text], i) => (
              <li key={title} className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <span>
                  <strong className="block text-sm font-semibold">{title}</strong>
                  <span className="text-sm text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Encadré personnel : salutation, dernière commande, raccourcis. */
function PersonalPanel() {
  const { user, loading } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: lastOrder } = useQuery({
    queryKey: ["my-last-order", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, status, total_amount, delivered_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (loading)
    return <div className="hidden animate-pulse rounded-lg bg-card shadow-soft lg:block" />;

  if (!user) {
    return (
      <aside className="flex flex-col justify-between gap-4 rounded-lg bg-card p-5 shadow-soft">
        <div>
          <UserRound className="h-8 w-8 text-primary" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Bienvenue chez MendyKounda</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connectez-vous pour suivre vos commandes et retrouver vos produits habituels.
          </p>
        </div>
        <div className="space-y-2">
          <Link
            to="/auth"
            className="block rounded-full bg-accent px-4 py-2 text-center text-sm font-medium text-accent-foreground hover:bg-accent/85"
          >
            Se connecter
          </Link>
          <Link
            to="/auth"
            className="block rounded-full border border-border px-4 py-2 text-center text-sm hover:bg-secondary"
          >
            Créer un compte
          </Link>
        </div>
      </aside>
    );
  }

  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const status = lastOrder?.status as OrderStatus | undefined;
  const lastLine = !lastOrder
    ? null
    : status === "delivered"
      ? `Livrée le ${formatLongDate(lastOrder.delivered_at ?? lastOrder.created_at)}`
      : status === "cancelled"
        ? "Annulée"
        : deliveryWindow(lastOrder.created_at).end.getTime() < Date.now()
          ? `${ORDER_STATUS_LABEL[status!]} · livraison imminente`
          : `${ORDER_STATUS_LABEL[status!]} · arrivée prévue ${formatDeliveryWindow(lastOrder.created_at)}`;

  return (
    <aside className="flex flex-col gap-4 rounded-lg bg-card p-5 shadow-soft">
      <div>
        <p className="text-sm text-muted-foreground">Bonjour</p>
        <h2 className="text-xl font-semibold">{firstName || user.email}</h2>
      </div>

      {lastOrder ? (
        <Link
          to="/orders"
          className="block rounded-md border border-border p-3 hover:bg-secondary/60"
        >
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="h-4 w-4" aria-hidden /> Votre dernière commande ·{" "}
            <span className="tabular-nums">{formatPrice(Number(lastOrder.total_amount))}</span>
          </p>
          <p className="mt-1 text-sm font-medium">{lastLine}</p>
        </Link>
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Vous n'avez pas encore passé de commande.
        </p>
      )}

      <nav className="grid grid-cols-2 gap-2 text-sm">
        {(
          [
            ["/orders", "Mes commandes"],
            ["/cart", "Mon panier"],
            ["/account", "Mon compte"],
            ["/contact", "Besoin d'aide ?"],
          ] as const
        ).map(([to, label]) => (
          <Link key={to} to={to} className="rounded-md bg-secondary px-3 py-2 hover:text-primary">
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

/** Produits déjà commandés par le client, du plus récent au plus ancien. */
function BuyAgainRail({ products }: { products: Product[] }) {
  const { user } = useAuth();
  const { data: ids } = useQuery({
    queryKey: ["buy-again", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("created_at, order_items(product_id)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const seen: string[] = [];
      for (const o of data ?? []) {
        for (const it of o.order_items ?? []) {
          if (it.product_id && !seen.includes(it.product_id)) seen.push(it.product_id);
        }
      }
      return seen;
    },
  });

  if (!user || !ids?.length) return null;
  const list = ids.map((id) => products.find((p) => p.id === id)).filter((p): p is Product => !!p);
  return (
    <ProductRail
      title="Commander à nouveau"
      subtitle="Vos produits habituels, en un clic"
      products={list}
      seeAll={{ toOrders: true }}
    />
  );
}
