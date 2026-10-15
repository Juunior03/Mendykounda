/**
 * Fiche produit — image, informations, encart d'achat, avis clients.
 */
import { createFileRoute, notFound, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Star,
  ChevronRight,
  Truck,
  ShieldCheck,
  User as UserIcon,
  CalendarDays,
  Sprout,
  Scale,
} from "lucide-react";
import { toast } from "sonner";
import {
  productBySlugQuery,
  productDisplayName,
  productVariantsQuery,
  type Product,
  reviewsByProductQuery,
} from "@/lib/queries";
import { formatDeadline, formatSlaughterDay, upcomingSlaughterQuery } from "@/lib/slaughter";
import {
  MONTHS,
  backInLabel,
  formatSeason,
  inSeason,
  isSeasonal,
  seasonEndMonth,
} from "@/lib/season";
import { resolveProductImage } from "@/lib/product-images";
import { formatPrice, formatDate, plural } from "@/lib/format";
import { cartStore } from "@/lib/cart";
import { Stars } from "@/components/stars";
import { effectivePrice, hasPromo, promoPercent, LOW_STOCK_THRESHOLD } from "@/lib/pricing";
import { formatDeliveryWindow } from "@/lib/delivery";
import { useAuth } from "@/lib/auth";
import { useFarm } from "@/lib/farm";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/products/$slug")({
  loader: async ({ context, params }) => {
    const product = await context.queryClient.ensureQueryData(productBySlugQuery(params.slug));
    if (!product) throw notFound();
    await context.queryClient.ensureQueryData(reviewsByProductQuery(product.id)).catch(() => {});
    return product;
  },
  notFoundComponent: () => (
    <div className="container-editorial py-32 text-center">
      <p className="editorial-eyebrow mb-3">Introuvable</p>
      <h1 className="text-3xl font-medium">Ce produit n'existe pas.</h1>
      <Link to="/shop" className="mt-6 inline-block underline-grow text-sm">
        ← Retour à la boutique
      </Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="container-editorial py-32 text-center">
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Une erreur est survenue."}
      </p>
    </div>
  ),
  component: ProductPage,
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} — MendyKounda` },
          { name: "description", content: loaderData.description ?? loaderData.name },
          { property: "og:title", content: `${loaderData.name} — MendyKounda` },
          {
            property: "og:description",
            content: loaderData.description ?? `Découvrez ${loaderData.name} sur MendyKounda.`,
          },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary" },
        ]
      : [
          { title: "Produit indisponible — MendyKounda" },
          { name: "description", content: "Ce produit fermier n'est pas disponible actuellement." },
          { property: "og:title", content: "Produit indisponible — MendyKounda" },
          {
            property: "og:description",
            content: "Consultez les autres produits disponibles dans la boutique MendyKounda.",
          },
          { property: "og:type", content: "website" },
          { name: "twitter:card", content: "summary" },
        ],
  }),
});

function ProductPage() {
  const farm = useFarm();
  const product = Route.useLoaderData();
  const { data: reviews } = useSuspenseQuery(reviewsByProductQuery(product.id));
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const img = resolveProductImage(product.image_url);
  const promo = hasPromo(product);
  const price = effectivePrice(product);
  const { data: variants } = useQuery({
    ...productVariantsQuery(product.variant_group ?? ""),
    enabled: !!product.variant_group,
  });
  const { data: upcoming } = useQuery({
    ...upcomingSlaughterQuery(),
    enabled: product.needs_slaughter,
  });
  const slaughter = product.needs_slaughter ? (upcoming?.[0] ?? null) : null;
  // Viande à l'abattage sans abattage programmé : pas commandable.
  const noSlaughter = product.needs_slaughter && upcoming !== undefined && !slaughter;
  const offSeason = !inSeason(product);
  const outOfStock = product.stock <= 0 || noSlaughter || offSeason;
  const maxQty = Math.max(1, Math.min(product.stock, 10));

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  const addToCart = () => {
    cartStore.add(
      {
        productId: product.id,
        name: productDisplayName(product),
        price,
        unit: product.unit,
        imageUrl: product.image_url,
      },
      qty,
    );
  };

  return (
    <div className="container-market py-6 md:py-10">
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-primary">
          Accueil
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link to="/shop" className="hover:text-primary">
          Boutique
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="truncate text-foreground">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_300px] lg:gap-10">
        {/* Image */}
        <div className="aspect-square overflow-hidden rounded-lg bg-warm lg:sticky lg:top-40 lg:self-start">
          {img && (
            <img
              src={img}
              alt={product.name}
              width={1024}
              height={1024}
              className="h-full w-full object-contain"
            />
          )}
        </div>

        {/* Informations */}
        <div className="min-w-0">
          <Link to="/about" className="text-sm text-primary hover:underline">
            {farm.name}
          </Link>
          <h1 className="mt-1 text-balance text-2xl font-medium leading-tight tracking-tight md:text-3xl">
            {product.name}
          </h1>

          {reviews.length > 0 && (
            <a
              href="#avis"
              className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
            >
              <span className="font-medium text-foreground tabular-nums">{avg.toFixed(1)}</span>
              <Stars rating={avg} />
              <span>
                {reviews.length} évaluation{plural(reviews.length)}
              </span>
            </a>
          )}

          <div className="mt-4 border-t border-border pt-4">
            {promo && (
              <span className="mb-2 inline-block rounded-sm bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
                {product.discount_label || "Offre limitée"}
              </span>
            )}
            <div className="flex items-baseline gap-3">
              {promo && (
                <span className="text-2xl font-light text-destructive tabular-nums">
                  -{promoPercent(product)} %
                </span>
              )}
              <span className="text-3xl font-medium tabular-nums">{formatPrice(price)}</span>
              <span className="text-sm text-muted-foreground">/ {product.unit}</span>
            </div>
            {promo && (
              <p className="mt-1 text-xs text-muted-foreground">
                Prix habituel :{" "}
                <span className="line-through tabular-nums">
                  {formatPrice(Number(product.price))}
                </span>
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Paiement à la livraison · Prix TTC</p>
            {product.sold_by_weight && (
              <p className="mt-2 flex gap-2 rounded-md bg-secondary px-3 py-2 text-xs">
                <Scale className="h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="font-semibold">Prix au poids réel.</span> Choisissez une quantité
                  estimée : le montant est ajusté selon le poids pesé avant la livraison.
                </span>
              </p>
            )}
          </div>

          {variants && variants.length > 1 && (
            <VariantPicker product={product} variants={variants} />
          )}

          {isSeasonal(product) && <SeasonBox product={product} />}

          {product.needs_slaughter && (
            <SlaughterBox slaughter={slaughter} hasVariants={!!variants && variants.length > 1} />
          )}

          {product.description && (
            <div className="mt-6 border-t border-border pt-6">
              <h2 className="text-base font-semibold">À propos de ce produit</h2>
              <p className="mt-3 whitespace-pre-line text-pretty text-sm leading-relaxed text-foreground/80">
                {product.description}
              </p>
            </div>
          )}
        </div>

        {/* Encart d'achat */}
        <aside className="h-fit rounded-lg border border-border bg-card p-5 shadow-soft lg:sticky lg:top-40">
          <p className="text-2xl font-medium tabular-nums">{formatPrice(price)}</p>

          {!outOfStock && (
            <p className="mt-3 text-sm">
              <Truck className="mr-1.5 inline h-4 w-4 -translate-y-px text-primary" />
              {slaughter ? (
                <>
                  Livraison à partir du{" "}
                  <span className="font-semibold">{formatSlaughterDay(slaughter.day)}</span>
                </>
              ) : (
                <>
                  Livraison <span className="font-semibold">{formatDeliveryWindow()}</span>
                </>
              )}
            </p>
          )}

          <StockStatus
            stock={product.stock}
            availability={availabilityOf(product.stock, offSeason, noSlaughter)}
          />

          {!outOfStock && (
            <>
              <label className="mt-4 flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  {product.sold_by_weight ? `Quantité (${product.unit}, estimée) :` : "Quantité :"}
                </span>
                <select
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="rounded-md border border-border bg-secondary px-2 py-1.5 text-sm"
                >
                  {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-4 space-y-2">
                <button
                  onClick={() => {
                    addToCart();
                    toast.success(`${product.name} ajouté au panier`, {
                      action: {
                        label: "Voir le panier",
                        onClick: () => void navigate({ to: "/cart" }),
                      },
                    });
                  }}
                  className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/85"
                >
                  Ajouter au panier
                </button>
                <button
                  onClick={() => {
                    addToCart();
                    void navigate({ to: "/checkout" });
                  }}
                  className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Acheter maintenant
                </button>
              </div>
            </>
          )}

          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">Expédié par</dt>
            <dd>{farm.name}</dd>
            <dt className="text-muted-foreground">Vendu par</dt>
            <dd>{farm.name}</dd>
            <dt className="text-muted-foreground">Paiement</dt>
            <dd>À la livraison</dd>
          </dl>
          <p className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            Annulation gratuite depuis « Mes commandes » tant que la préparation n'a pas commencé.
          </p>
        </aside>
      </div>

      {/* AVIS */}
      <section
        id="avis"
        className="mt-16 grid scroll-mt-40 gap-10 border-t border-border pt-10 lg:grid-cols-[320px_minmax(0,1fr)]"
      >
        <div>
          <h2 className="text-xl font-semibold">Avis clients</h2>
          {reviews.length > 0 ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <Stars rating={avg} className="[&_svg]:h-5 [&_svg]:w-5" />
                <span className="text-base font-medium">{avg.toFixed(1)} sur 5</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {reviews.length} évaluation{reviews.length > 1 ? "s" : ""}
              </p>
              <RatingBreakdown ratings={reviews.map((r) => r.rating)} />
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Aucun avis pour le moment.</p>
          )}

          <div className="mt-8 border-t border-border pt-6">
            <h3 className="text-base font-semibold">Donnez votre avis sur ce produit</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Partagez votre expérience avec les autres clients.
            </p>
            <ReviewForm productId={product.id} />
          </div>
        </div>

        <div className="min-w-0">
          {reviews.length > 0 && <h3 className="mb-4 text-base font-semibold">Les plus récents</h3>}
          <div className="divide-y divide-border">
            {reviews.map((r) => (
              <article key={r.id} className="py-5 first:pt-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-muted-foreground">
                    <UserIcon className="h-4 w-4" />
                  </span>
                  <span>Client MendyKounda</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Stars rating={r.rating} />
                  <time className="text-xs text-muted-foreground">
                    Évalué le {formatDate(r.created_at)}
                  </time>
                </div>
                {r.comment && <p className="mt-2 text-sm text-foreground/85">{r.comment}</p>}
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function RatingBreakdown({ ratings }: { ratings: number[] }) {
  return (
    <ul className="mt-4 space-y-1.5">
      {[5, 4, 3, 2, 1].map((n) => {
        const count = ratings.filter((r) => r === n).length;
        const pct = ratings.length ? Math.round((count / ratings.length) * 100) : 0;
        return (
          <li key={n} className="grid grid-cols-[4.5rem_1fr_2.75rem] items-center gap-2 text-sm">
            <span className="whitespace-nowrap text-muted-foreground">
              {n} étoile{n > 1 ? "s" : ""}
            </span>
            <span className="h-4 overflow-hidden rounded-sm border border-border bg-secondary">
              <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-right text-muted-foreground tabular-nums">{pct} %</span>
          </li>
        );
      })}
    </ul>
  );
}

function ReviewForm({ productId }: { productId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  // Avis réservés aux clients qui ont reçu ce produit (vérifié aussi en base).
  const { data: canReview, isLoading: checking } = useQuery({
    queryKey: ["can-review", productId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_review", { _product_id: productId });
      if (error) return false;
      return !!data;
    },
  });

  if (!user) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        <Link
          to="/auth"
          search={{
            redirect: typeof window === "undefined" ? undefined : window.location.pathname,
          }}
          className="underline-grow text-foreground"
        >
          Connectez-vous
        </Link>{" "}
        pour laisser un avis.
      </p>
    );
  }

  if (checking) return null;
  if (!canReview) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Les avis sont réservés aux clients qui ont reçu ce produit : vous pourrez donner le vôtre
        après la livraison de votre commande.
      </p>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("reviews")
      .upsert(
        { product_id: productId, user_id: user.id, rating, comment: comment || null },
        { onConflict: "product_id,user_id" },
      );
    setBusy(false);
    if (error) {
      toast.error("Impossible de publier votre avis");
      return;
    }
    setComment("");
    toast.success("Merci pour votre avis !");
    void qc.invalidateQueries({ queryKey: ["reviews", productId] });
  };

  return (
    <form onSubmit={submit} className="mt-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Votre note :</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className="rounded p-0.5"
            aria-label={`${n} étoiles`}
          >
            <Star
              className={`h-5 w-5 ${n <= rating ? "fill-accent text-accent" : "text-muted-foreground/30"}`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Partagez votre expérience…"
        maxLength={2000}
        rows={3}
        className="mt-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={busy}
        className="mt-3 rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
      >
        {busy ? "Envoi…" : "Publier mon avis"}
      </button>
    </form>
  );
}

function VariantPicker({ product, variants }: { product: Product; variants: Product[] }) {
  return (
    <div className="mt-5">
      <p className="text-sm">
        Format : <span className="font-semibold">{product.variant_label ?? product.name}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {variants.map((v) => {
          const current = v.id === product.id;
          return (
            <Link
              key={v.id}
              to="/products/$slug"
              params={{ slug: v.slug }}
              replace
              aria-current={current ? "page" : undefined}
              className={`min-w-28 rounded-md border px-3 py-2 text-sm transition-colors ${
                current
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-foreground/40"
              }`}
            >
              <span className="block font-medium">{v.variant_label ?? v.name}</span>
              <span className="block text-xs tabular-nums text-muted-foreground">
                {formatPrice(effectivePrice(v))} / {v.unit}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function seasonTitle(product: Product) {
  if (!inSeason(product)) {
    const back = backInLabel(product);
    return back ? `Hors saison, ${back}` : "Hors saison";
  }
  const end = seasonEndMonth(product);
  return end ? `De saison jusqu'en ${MONTHS[end - 1]}` : "De saison";
}

function SeasonBox({ product }: { product: Product }) {
  return (
    <div className="mt-5 flex gap-3 rounded-md border border-border bg-cream p-4 text-sm">
      <Sprout className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div>
        <p className="font-semibold">{seasonTitle(product)}</p>
        <p className="mt-1 text-muted-foreground">
          Disponible à la ferme de {formatSeason(product.season_months)}.
          {inSeason(product) ? "" : " Revenez pendant la saison pour le commander."}
        </p>
      </div>
    </div>
  );
}

function SlaughterBox({
  slaughter,
  hasVariants,
}: {
  slaughter: { day: string; order_deadline: string; note: string | null } | null;
  hasVariants: boolean;
}) {
  return (
    <div className="mt-5 flex gap-3 rounded-md border border-border bg-cream p-4 text-sm">
      <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      {slaughter ? (
        <div>
          <p className="font-semibold">Prochain abattage : {formatSlaughterDay(slaughter.day)}</p>
          <p className="mt-1 text-muted-foreground">
            Viande fraîche, préparée le jour de l'abattage. Commandez avant le{" "}
            {formatDeadline(slaughter.order_deadline)} pour être livré à partir du{" "}
            {formatSlaughterDay(slaughter.day)}.
          </p>
          {slaughter.note && <p className="mt-1 text-muted-foreground">{slaughter.note}</p>}
        </div>
      ) : (
        <div>
          <p className="font-semibold">Prochain abattage pas encore programmé</p>
          <p className="mt-1 text-muted-foreground">
            Cette viande est préparée uniquement les jours d'abattage. Revenez bientôt
            {hasVariants ? " ou choisissez un autre format" : ""}.
          </p>
        </div>
      )}
    </div>
  );
}

type Availability = "off-season" | "no-slaughter" | "out" | "low" | "ok";

function availabilityOf(stock: number, offSeason: boolean, noSlaughter: boolean): Availability {
  if (offSeason) return "off-season";
  if (noSlaughter) return "no-slaughter";
  if (stock <= 0) return "out";
  return stock <= LOW_STOCK_THRESHOLD ? "low" : "ok";
}

function StockStatus({ stock, availability }: { stock: number; availability: Availability }) {
  const labels: Record<Availability, string> = {
    "off-season": "Hors saison",
    "no-slaughter": "Bientôt disponible",
    out: "Actuellement indisponible",
    low: `Plus que ${stock} en stock`,
    ok: "En stock",
  };
  const tone = availability === "ok" ? "text-primary" : "text-destructive";
  return <p className={`mt-3 text-lg font-medium ${tone}`}>{labels[availability]}</p>;
}
