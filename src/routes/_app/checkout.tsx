/**
 * Checkout — formulaire de livraison + création de la commande en base.
 * (Le paiement Stripe sera branché ensuite via une server function.)
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useCart, cartTotals, cartStore } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/checkout")({
  component: CheckoutPage,
  head: () => ({ meta: [{ title: "Commande — MendyKounda" }] }),
});

const shippingSchema = z.object({
  fullName: z.string().min(2, "Nom requis").max(120),
  phone: z.string().min(6, "Téléphone requis").max(30),
  address: z.string().min(4, "Adresse requise").max(200),
  city: z.string().min(2, "Ville requise").max(80),
  postalCode: z.string().min(3, "Code postal requis").max(20),
  notes: z.string().max(500).optional(),
});

function CheckoutPage() {
  const items = useCart();
  const { subtotal } = cartTotals(items);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: "", phone: "", address: "", city: "", postalCode: "", notes: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Préremplir depuis le profil
  useEffect(() => {
    if (!user) return;
    void supabase
      .from("profiles")
      .select("full_name, phone, address, city, postal_code")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setForm((f) => ({
          fullName: data.full_name ?? f.fullName,
          phone: data.phone ?? f.phone,
          address: data.address ?? f.address,
          city: data.city ?? f.city,
          postalCode: data.postal_code ?? f.postalCode,
          notes: f.notes,
        }));
      });
  }, [user]);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const parsed = shippingSchema.parse(form);
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          total_amount: subtotal,
          shipping_full_name: parsed.fullName,
          shipping_phone: parsed.phone,
          shipping_address: parsed.address,
          shipping_city: parsed.city,
          shipping_postal_code: parsed.postalCode,
          notes: parsed.notes || null,
        })
        .select("id")
        .single();
      if (orderErr) throw orderErr;

      const { error: itemsErr } = await supabase.from("order_items").insert(
        items.map((it) => ({
          order_id: order.id,
          product_id: it.productId,
          product_name: it.name,
          unit_price: it.price,
          quantity: it.quantity,
        }))
      );
      if (itemsErr) throw itemsErr;

      cartStore.clear();
      toast.success("Commande enregistrée !");
      void navigate({ to: "/order-confirmation", search: { id: order.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

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

  const fields: { k: keyof typeof form; label: string; type?: string; full?: boolean; ta?: boolean }[] = [
    { k: "fullName", label: "Nom complet", full: true },
    { k: "phone", label: "Téléphone" },
    { k: "postalCode", label: "Code postal" },
    { k: "address", label: "Adresse", full: true },
    { k: "city", label: "Ville", full: true },
    { k: "notes", label: "Notes (facultatif)", full: true, ta: true },
  ];

  return (
    <div className="container-editorial py-12 md:py-20">
      <p className="editorial-eyebrow">Finalisation</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight md:text-4xl">Commande</h1>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_360px]">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <div key={f.k} className={f.full ? "sm:col-span-2" : ""}>
                <label className="text-xs text-muted-foreground">{f.label}</label>
                {f.ta ? (
                  <textarea
                    value={form[f.k]}
                    onChange={update(f.k)}
                    rows={3}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                  />
                ) : (
                  <input
                    type={f.type ?? "text"}
                    value={form[f.k]}
                    onChange={update(f.k)}
                    required={f.k !== "notes"}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
                  />
                )}
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 sm:w-auto"
          >
            {busy ? "Enregistrement…" : "Valider ma commande"}
          </button>
          <p className="text-xs text-muted-foreground">
            Le paiement en ligne (Stripe) sera activé prochainement. Votre commande est enregistrée et notre équipe vous contactera pour finaliser.
          </p>
        </form>

        <aside className="h-fit rounded-lg border border-border bg-cream p-6">
          <p className="editorial-eyebrow">Récapitulatif</p>
          <ul className="mt-4 space-y-2 text-sm">
            {items.map((it) => (
              <li key={it.productId} className="flex justify-between gap-4">
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
