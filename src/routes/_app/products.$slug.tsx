/**
 * Product detail — gallery, description, qty selector, reviews.
 */
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Star, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { productBySlugQuery, reviewsByProductQuery } from "@/lib/queries";
import { resolveProductImage } from "@/lib/product-images";
import { formatPrice, formatDate } from "@/lib/format";
import { cartStore } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/products/$slug")({
  loader: async ({ context, params }) => {
    const product = await context.queryClient.ensureQueryData(productBySlugQuery(params.slug));
    if (!product) throw notFound();
    void context.queryClient.ensureQueryData(reviewsByProductQuery(product.id));
    return product;
  },
  notFoundComponent: () => (
    <div className="container-editorial py-32 text-center">
      <p className="editorial-eyebrow mb-3">Introuvable</p>
      <h1 className="text-3xl font-medium">Ce produit n'existe pas.</h1>
      <Link to="/shop" className="mt-6 inline-block underline-grow text-sm">← Retour à la boutique</Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="container-editorial py-32 text-center">
      <p className="text-sm text-destructive">{error.message}</p>
    </div>
  ),
  component: ProductPage,
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.name} — MendyKounda` },
          { name: "description", content: loaderData.description ?? loaderData.name },
        ]
      : [],
  }),
});

function ProductPage() {
  const product = Route.useLoaderData();
  const { data: reviews } = useSuspenseQuery(reviewsByProductQuery(product.id));
  const [qty, setQty] = useState(1);
  const img = resolveProductImage(product.image_url);

  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  const addToCart = () => {
    cartStore.add(
      {
        productId: product.id,
        name: product.name,
        price: Number(product.price),
        unit: product.unit,
        imageUrl: product.image_url,
      },
      qty,
    );
    toast.success(`${product.name} ajouté au panier`);
  };

  return (
    <div className="container-editorial py-12 md:py-20">
      <div className="mb-8">
        <Link to="/shop" className="text-xs text-muted-foreground underline-grow">
          ← Boutique
        </Link>
      </div>

      <div className="grid gap-12 md:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-lg bg-warm">
          {img && (
            <img
              src={img}
              alt={product.name}
              width={1024}
              height={1024}
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div>
          <p className="editorial-eyebrow">Ferme MendyKounda</p>
          <h1 className="mt-3 text-balance text-3xl font-medium tracking-tight md:text-4xl">
            {product.name}
          </h1>

          {reviews.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Stars rating={avg} />
              <span>{avg.toFixed(1)} · {reviews.length} avis</span>
            </div>
          )}

          <p className="mt-6 text-3xl font-medium tabular-nums">
            {formatPrice(Number(product.price))}
            <span className="ml-2 text-sm font-normal text-muted-foreground">/ {product.unit}</span>
          </p>

          {product.description && (
            <p className="mt-6 text-pretty text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          )}

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center rounded-md border border-border">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="px-3 py-3 hover:bg-secondary"
                aria-label="Diminuer"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-10 text-center text-sm tabular-nums">{qty}</span>
              <button
                onClick={() => setQty(Math.min(product.stock, qty + 1))}
                className="px-3 py-3 hover:bg-secondary"
                aria-label="Augmenter"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={addToCart}
              disabled={product.stock === 0}
              className="flex-1 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {product.stock === 0 ? "Épuisé" : "Ajouter au panier"}
            </button>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            {product.stock > 0 ? `${product.stock} en stock` : "Réapprovisionnement bientôt"}
          </p>
        </div>
      </div>

      {/* REVIEWS */}
      <section className="mt-24 border-t border-border pt-12">
        <p className="editorial-eyebrow">Avis</p>
        <h2 className="mt-3 text-2xl font-medium tracking-tight md:text-3xl">
          Ce que nos clients en disent
        </h2>

        <ReviewForm productId={product.id} />

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun avis pour le moment. Soyez le premier !</p>
          ) : (
            reviews.map((r) => (
              <article key={r.id} className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <Stars rating={r.rating} />
                  <time className="text-xs text-muted-foreground">{formatDate(r.created_at)}</time>
                </div>
                {r.comment && <p className="mt-3 text-sm text-foreground/80">{r.comment}</p>}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= Math.round(rating) ? "fill-accent text-accent" : "text-muted-foreground/30"}`}
        />
      ))}
    </div>
  );
}

function ReviewForm({ productId }: { productId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        <Link to="/auth" className="underline-grow text-foreground">Connectez-vous</Link> pour laisser un avis.
      </p>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from("reviews").upsert(
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
    <form onSubmit={submit} className="mt-8 rounded-lg border border-border bg-card p-6">
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
            <Star className={`h-5 w-5 ${n <= rating ? "fill-accent text-accent" : "text-muted-foreground/30"}`} />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Partagez votre expérience…"
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
