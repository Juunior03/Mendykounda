import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCart, cartTotals } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/_app/checkout")({
  component: CheckoutPage,
  head: () => ({ meta: [{ title: "Commande — MendyKounda" }] }),
});

function CheckoutPage() {
  const items = useCart();
  const { subtotal } = cartTotals(items);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (items.length === 0) {
    return (
      <div className="container-editorial py-20 text-center">
        <p className="text-sm text-muted-foreground">Votre panier est vide.</p>
        <Link to="/shop" className="mt-4 inline-block underline-grow text-sm font-medium">
          Parcourir la boutique →
        </Link>
      </div>
    );
  }

  return (
    <div className="container-editorial py-12 md:py-20">
      <p className="editorial-eyebrow">Finalisation</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight md:text-4xl">Commande</h1>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-border p-6">
          <p className="text-sm text-muted-foreground">
            Le paiement Stripe sera intégré à l'étape suivante. Vous pourrez régler en CB de manière sécurisée.
          </p>
        </div>

        <aside className="h-fit rounded-lg border border-border bg-cream p-6">
          <p className="editorial-eyebrow">Récapitulatif</p>
          <ul className="mt-4 space-y-2 text-sm">
            {items.map((it) => (
              <li key={it.productId} className="flex justify-between">
                <span className="text-muted-foreground">{it.name} × {it.quantity}</span>
                <span className="tabular-nums">{formatPrice(it.price * it.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-4 flex justify-between">
            <span className="font-medium">Total</span>
            <span className="text-lg font-medium tabular-nums">{formatPrice(subtotal)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
