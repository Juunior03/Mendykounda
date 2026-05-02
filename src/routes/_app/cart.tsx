/**
 * Cart page.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2, Plus, Minus } from "lucide-react";
import { useCart, cartStore, cartTotals } from "@/lib/cart";
import { resolveProductImage } from "@/lib/product-images";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/_app/cart")({
  component: CartPage,
  head: () => ({ meta: [{ title: "Panier — MendyKounda" }] }),
});

function CartPage() {
  const items = useCart();
  const { subtotal } = cartTotals(items);

  return (
    <div className="container-editorial py-12 md:py-20">
      <p className="editorial-eyebrow">Votre sélection</p>
      <h1 className="mt-3 text-balance text-3xl font-medium tracking-tight md:text-4xl">Panier</h1>

      {items.length === 0 ? (
        <div className="mt-12 rounded-lg border border-dashed border-border py-24 text-center">
          <p className="text-sm text-muted-foreground">Votre panier est vide.</p>
          <Link to="/shop" className="mt-4 inline-block underline-grow text-sm font-medium">
            Parcourir la boutique →
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px]">
          <ul className="divide-y divide-border">
            {items.map((it) => {
              const img = resolveProductImage(it.imageUrl);
              return (
                <li key={it.productId} className="flex gap-4 py-6">
                  <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md bg-warm">
                    {img && <img src={img} alt={it.name} className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex flex-1 flex-col justify-between">
                    <div className="flex justify-between">
                      <h3 className="text-sm font-medium">{it.name}</h3>
                      <p className="text-sm tabular-nums">
                        {formatPrice(it.price * it.quantity)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatPrice(it.price)} / {it.unit}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-md border border-border">
                        <button
                          onClick={() => cartStore.setQuantity(it.productId, it.quantity - 1)}
                          className="px-2.5 py-1.5 hover:bg-secondary"
                          aria-label="Moins"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="min-w-8 text-center text-xs tabular-nums">{it.quantity}</span>
                        <button
                          onClick={() => cartStore.setQuantity(it.productId, it.quantity + 1)}
                          className="px-2.5 py-1.5 hover:bg-secondary"
                          aria-label="Plus"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => cartStore.remove(it.productId)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <aside className="h-fit rounded-lg border border-border bg-cream p-6">
            <p className="editorial-eyebrow">Récapitulatif</p>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-muted-foreground">Sous-total</span>
              <span className="tabular-nums">{formatPrice(subtotal)}</span>
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Livraison</span>
              <span className="text-muted-foreground">Calculée à l'étape suivante</span>
            </div>
            <div className="mt-4 border-t border-border pt-4 flex justify-between">
              <span className="font-medium">Total</span>
              <span className="text-lg font-medium tabular-nums">{formatPrice(subtotal)}</span>
            </div>
            <Link
              to="/checkout"
              className="mt-6 block w-full rounded-md bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Passer commande
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
