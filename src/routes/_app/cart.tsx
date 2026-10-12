/**
 * Panier — lignes avec prix et stock actualisés, encart sous-total.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useCart, cartStore } from "@/lib/cart";
import { useCartLines } from "@/lib/cart-live";
import { resolveProductImage } from "@/lib/product-images";
import { formatPrice } from "@/lib/format";
import { LOW_STOCK_THRESHOLD } from "@/lib/pricing";
import { formatDeliveryWindow } from "@/lib/delivery";

export const Route = createFileRoute("/_app/cart")({
  component: CartPage,
  head: () => ({
    meta: [
      { title: "Mon panier — MendyKounda" },
      {
        name: "description",
        content: "Vérifiez vos produits fermiers avant de passer votre commande.",
      },
      { property: "og:title", content: "Mon panier — MendyKounda" },
      { property: "og:description", content: "Votre sélection de produits fermiers MendyKounda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CartPage() {
  const items = useCart();
  const { lines, subtotal, itemCount, blocked } = useCartLines(items);
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div className="container-market py-8 md:py-12">
        <div className="rounded-lg bg-card p-8 shadow-soft md:p-12">
          <h1 className="text-2xl font-medium tracking-tight">Votre panier est vide</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Parcourez nos produits fermiers et ajoutez-les à votre panier.
          </p>
          <Link
            to="/shop"
            className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent/85"
          >
            Découvrir la boutique
          </Link>
        </div>
      </div>
    );
  }

  const subtotalLabel = (
    <>
      Sous-total ({itemCount} article{itemCount > 1 ? "s" : ""}) :{" "}
      <span className="font-semibold tabular-nums">{formatPrice(subtotal)}</span>
    </>
  );

  return (
    <div className="container-market py-6 md:py-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-lg bg-card p-4 shadow-soft md:p-6">
          <div className="flex items-end justify-between border-b border-border pb-3">
            <h1 className="text-2xl font-medium tracking-tight md:text-3xl">Panier</h1>
            <span className="hidden text-sm text-muted-foreground sm:block">Prix</span>
          </div>

          <ul className="divide-y divide-border">
            {lines.map(({ item, product, price, previousPrice, issue }) => {
              const img = resolveProductImage(product?.image_url ?? item.imageUrl);
              const maxQty = Math.max(item.quantity, Math.min(product?.stock ?? item.quantity, 10));
              return (
                <li key={item.productId} className="flex gap-4 py-5">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-warm sm:h-32 sm:w-32">
                    {img && (
                      <img src={img} alt={item.name} className="h-full w-full object-contain" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-4">
                      {product ? (
                        <Link
                          to="/products/$slug"
                          params={{ slug: product.slug }}
                          className="line-clamp-2 text-base hover:text-primary"
                        >
                          {item.name}
                        </Link>
                      ) : (
                        <span className="line-clamp-2 text-base">{item.name}</span>
                      )}
                      <span className="shrink-0 text-base font-semibold tabular-nums">
                        {formatPrice(price * item.quantity)}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatPrice(price)} / {item.unit}
                    </p>

                    {issue ? (
                      <p className="mt-1 text-sm font-medium text-destructive">{issue}</p>
                    ) : product && product.stock <= LOW_STOCK_THRESHOLD ? (
                      <p className="mt-1 text-sm text-destructive">
                        Plus que {product.stock} en stock
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-primary">En stock</p>
                    )}

                    {previousPrice != null && (
                      <p className="mt-1 rounded-md bg-accent/15 px-2 py-1 text-xs">
                        Le prix est passé de{" "}
                        <span className="tabular-nums">{formatPrice(previousPrice)}</span> à{" "}
                        <span className="font-medium tabular-nums">{formatPrice(price)}</span>.
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-1.5 rounded-md border border-border bg-secondary px-2 py-1 shadow-soft">
                        <span className="text-xs text-muted-foreground">Qté :</span>
                        <select
                          value={item.quantity}
                          onChange={(e) =>
                            cartStore.setQuantity(item.productId, Number(e.target.value))
                          }
                          className="bg-transparent text-sm outline-none"
                          aria-label={`Quantité de ${item.name}`}
                        >
                          {Array.from({ length: maxQty }, (_, i) => i + 1).map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="h-4 w-px bg-border" />
                      <button
                        onClick={() => cartStore.remove(item.productId)}
                        className="text-xs text-primary hover:underline"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="border-t border-border pt-4 text-right text-lg">{subtotalLabel}</p>
        </section>

        <aside className="h-fit space-y-3 lg:sticky lg:top-40">
          <div className="rounded-lg bg-card p-5 shadow-soft">
            <p className="text-lg">{subtotalLabel}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Livraison estimée {formatDeliveryWindow()}.
            </p>
            <button
              onClick={() => void navigate({ to: "/checkout" })}
              disabled={blocked || itemCount === 0}
              className="mt-4 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Passer la commande
            </button>
            {blocked && (
              <p className="mt-2 text-xs text-destructive">
                Corrigez les articles signalés pour continuer.
              </p>
            )}
          </div>
          <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            Paiement à la livraison. Annulation gratuite tant que la commande n'est pas expédiée.
          </p>
        </aside>
      </div>
    </div>
  );
}
