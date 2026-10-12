/**
 * Validation de commande en trois sections : adresse de livraison,
 * mode de paiement, vérification des articles. Les prix et le total
 * sont recalculés en base par place_order.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Lock, Truck } from "lucide-react";
import { useCart, cartStore } from "@/lib/cart";
import { useCartLines } from "@/lib/cart-live";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/lib/format";
import { formatDeliveryWindow } from "@/lib/delivery";
import { resolveProductImage } from "@/lib/product-images";
import { supabase } from "@/integrations/supabase/client";
import { startWavePayment } from "@/lib/wave";
import { notifyOrderPlaced } from "@/lib/notify";
import {
  DELIVERY_AREA,
  deliveryFee,
  deliveryZonesQuery,
  freeDeliveryGap,
  groupByDepartment,
  matchZone,
  rateSummary,
  zoneLabel,
} from "@/lib/zones";
import type { PaymentMethod } from "@/lib/orders";

export const Route = createFileRoute("/_app/checkout")({
  component: CheckoutPage,
  head: () => ({
    meta: [
      { title: "Finaliser ma commande — MendyKounda" },
      {
        name: "description",
        content:
          "Indiquez vos informations de livraison pour confirmer votre commande MendyKounda.",
      },
      { property: "og:title", content: "Finaliser ma commande — MendyKounda" },
      { property: "og:description", content: "Finalisez votre commande de produits fermiers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const shippingSchema = z.object({
  fullName: z.string().trim().min(2, "Nom requis").max(120),
  phone: z.string().trim().min(6, "Téléphone requis").max(30),
  address: z.string().trim().min(4, "Adresse requise").max(200),
  zoneId: z.string().uuid("Choisissez votre commune de livraison"),
  postalCode: z.string().trim().max(20).optional(),
  notes: z.string().max(500).optional(),
});

/** Wave n'apparaît qu'une fois configuré (voir docs/PAIEMENT-WAVE.md). */
const WAVE_ENABLED = import.meta.env.VITE_WAVE_ENABLED === "true";

type Address = Omit<z.infer<typeof shippingSchema>, "notes">;
const EMPTY_ADDRESS: Address = { fullName: "", phone: "", address: "", zoneId: "", postalCode: "" };

function CheckoutPage() {
  const items = useCart();
  const { lines, subtotal, itemCount, blocked, loading: linesLoading } = useCartLines(items);
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [editingAddress, setEditingAddress] = useState(true);
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash_on_delivery");
  const [busy, setBusy] = useState(false);
  const { data: zones = [] } = useQuery(deliveryZonesQuery());
  const zone = zones.find((z) => z.id === address.zoneId);
  // Frais affichés à titre indicatif : place_order recalcule en base.
  const fee = zone ? deliveryFee(zone.delivery_rates, subtotal) : 0;
  const gap = zone ? freeDeliveryGap(zone.delivery_rates, subtotal) : null;
  const total = subtotal + fee;

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  // Préremplir avec l'adresse enregistrée du profil (la ville doit
  // correspondre à une commune desservie).
  useEffect(() => {
    if (!user || zones.length === 0) return;
    void supabase
      .from("profiles")
      .select("full_name, phone, address, city, postal_code")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const saved: Address = {
          fullName: data.full_name ?? "",
          phone: data.phone ?? "",
          address: data.address ?? "",
          zoneId: matchZone(data.city, zones)?.id ?? "",
          postalCode: data.postal_code ?? "",
        };
        setAddress(saved);
        // Adresse complète : on affiche le résumé au lieu du formulaire.
        if (shippingSchema.safeParse(saved).success) setEditingAddress(false);
      });
  }, [user, zones]);

  const update =
    (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setAddress({ ...address, [k]: e.target.value });

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!user || blocked) return;
    const parsed = shippingSchema.safeParse({ ...address, notes });
    if (!parsed.success) {
      setEditingAddress(true);
      toast.error(parsed.error.issues[0]?.message ?? "Adresse incomplète");
      return;
    }
    setBusy(true);
    try {
      const a = parsed.data;
      const { data: orderId, error } = await supabase.rpc("place_order", {
        _items: items.map((it) => ({ product_id: it.productId, quantity: it.quantity })),
        _shipping: {
          full_name: a.fullName,
          phone: a.phone,
          address: a.address,
          zone_id: a.zoneId,
          postal_code: a.postalCode || null,
          notes: a.notes || null,
        },
        _payment_method: paymentMethod,
      });
      if (error) throw error;

      if (saveAsDefault) {
        await supabase
          .from("profiles")
          .update({
            full_name: a.fullName,
            phone: a.phone,
            address: a.address,
            city: zone ? zoneLabel(zone, zones) : null,
            postal_code: a.postalCode || null,
          })
          .eq("id", user.id);
      }

      cartStore.clear();
      // Le stock a changé : on rafraîchit les listes produits.
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["product"] });
      void qc.invalidateQueries({ queryKey: ["my-orders"] });

      // Confirmation par e-mail / SMS (attente courte, avant une éventuelle
      // redirection vers Wave qui interromprait la requête).
      await notifyOrderPlaced(orderId);

      if (paymentMethod === "wave") {
        // La commande est enregistrée ; on part payer chez Wave. En cas
        // d'échec, le client pourra relancer le paiement depuis la confirmation.
        try {
          await startWavePayment(orderId);
          return; // redirection vers Wave en cours
        } catch (waveErr) {
          toast.error(waveErr instanceof Error ? waveErr.message : "Paiement Wave indisponible");
          void navigate({ to: "/order-confirmation", search: { id: orderId, wave: "error" } });
          return;
        }
      }
      void navigate({ to: "/order-confirmation", search: { id: orderId } });
    } catch (err) {
      // Les erreurs Supabase sont des objets { message } (pas des Error).
      const msg = (err as { message?: unknown } | null)?.message;
      toast.error(typeof msg === "string" && msg ? msg : "Erreur");
      void qc.invalidateQueries({ queryKey: ["cart-products"] });
    } finally {
      setBusy(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="container-market py-20 text-center">
        <p className="text-sm text-muted-foreground">Votre panier est vide.</p>
        <Link
          to="/shop"
          className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
        >
          Parcourir la boutique →
        </Link>
      </div>
    );
  }

  const canSubmit = !busy && !blocked && !linesLoading && itemCount > 0;
  const placeButton = (
    <button
      type="submit"
      form="checkout-form"
      disabled={!canSubmit}
      className="w-full rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent/85 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy
        ? "Validation…"
        : paymentMethod === "wave"
          ? "Valider et payer avec Wave"
          : "Valider la commande"}
    </button>
  );

  const fields: {
    k: keyof Address;
    label: string;
    full?: boolean;
    autoComplete: string;
    type?: string;
  }[] = [
    { k: "fullName", label: "Nom complet", full: true, autoComplete: "name" },
    { k: "phone", label: "Téléphone", autoComplete: "tel", type: "tel" },
    { k: "postalCode", label: "Code postal (facultatif)", autoComplete: "postal-code" },
    {
      k: "address",
      label: "Adresse (quartier, rue, point de repère)",
      full: true,
      autoComplete: "street-address",
    },
  ];

  return (
    <div className="container-market py-6 md:py-10">
      <h1 className="mb-6 flex items-center gap-2 text-xl font-medium md:text-2xl">
        <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
        Validation de la commande
        <Link to="/cart" className="text-base font-normal text-primary hover:underline">
          ({itemCount} article{itemCount > 1 ? "s" : ""})
        </Link>
      </h1>

      <form
        id="checkout-form"
        onSubmit={submit}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]"
      >
        <div className="space-y-4">
          {/* 1. Adresse */}
          <Step n={1} title="Adresse de livraison">
            {editingAddress ? (
              <div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="text-xs font-medium">Commune de livraison</span>
                    <select
                      value={address.zoneId}
                      onChange={update("zoneId")}
                      required
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="">Choisissez votre commune…</option>
                      {groupByDepartment(zones).map(([dep, list]) => (
                        <optgroup key={dep} label={`Département de ${dep}`}>
                          {list.map((z) => (
                            <option key={z.id} value={z.id}>
                              {zoneLabel(z, zones)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {zone ? (
                        <>
                          Livraison à {zoneLabel(zone, zones)} :{" "}
                          <span className="font-medium text-foreground">
                            {rateSummary(zone.delivery_rates)}
                          </span>
                        </>
                      ) : (
                        <>
                          Nous livrons dans {DELIVERY_AREA}. Votre village n'apparaît pas ?
                          Choisissez sa commune (ex. Cap Skirring → Diembéring).
                        </>
                      )}
                    </span>
                  </label>
                  {fields.map((f) => (
                    <label key={f.k} className={f.full ? "sm:col-span-2" : ""}>
                      <span className="text-xs font-medium">{f.label}</span>
                      <input
                        type={f.type ?? "text"}
                        value={address[f.k] ?? ""}
                        onChange={update(f.k)}
                        autoComplete={f.autoComplete}
                        required={f.k !== "postalCode"}
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </label>
                  ))}
                </div>
                <label className="mt-4 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={saveAsDefault}
                    onChange={(e) => setSaveAsDefault(e.target.checked)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  Enregistrer comme adresse par défaut
                </label>
                {shippingSchema.safeParse(address).success && (
                  <button
                    type="button"
                    onClick={() => setEditingAddress(false)}
                    className="mt-4 rounded-full border border-border px-4 py-1.5 text-sm hover:bg-secondary"
                  >
                    Utiliser cette adresse
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <address className="text-sm not-italic leading-6">
                  <span className="font-medium">{address.fullName}</span>
                  <br />
                  {address.address}
                  <br />
                  {address.postalCode ? `${address.postalCode} ` : ""}
                  {zone ? zoneLabel(zone, zones) : ""}
                  <br />
                  Tél. : {address.phone}
                </address>
                <button
                  type="button"
                  onClick={() => setEditingAddress(true)}
                  className="shrink-0 text-sm text-primary hover:underline"
                >
                  Modifier
                </button>
              </div>
            )}
          </Step>

          {/* 2. Paiement */}
          <Step n={2} title="Mode de paiement">
            <div className="space-y-2" role="radiogroup" aria-label="Mode de paiement">
              {(
                [
                  {
                    id: "wave",
                    title: "Wave",
                    text: "Payez maintenant depuis l'application Wave (ou en scannant le QR code).",
                  },
                  {
                    id: "cash_on_delivery",
                    title: "Paiement à la livraison",
                    text: "Vous réglez à la réception de votre commande.",
                  },
                ] as const
              )
                .filter((m) => m.id !== "wave" || WAVE_ENABLED)
                .map((m) => (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${
                      paymentMethod === m.id ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={m.id}
                      checked={paymentMethod === m.id}
                      onChange={() => setPaymentMethod(m.id)}
                      className="mt-1 h-4 w-4 accent-[var(--primary)]"
                    />
                    <span>
                      <span className="font-medium">{m.title}</span>
                      <br />
                      <span className="text-muted-foreground">{m.text}</span>
                    </span>
                  </label>
                ))}
            </div>
          </Step>

          {/* 3. Vérification */}
          <Step n={3} title="Vérification des articles et de la livraison">
            <div className="rounded-md border border-border p-4">
              <p className="flex items-center gap-2 text-base font-semibold text-primary">
                <Truck className="h-5 w-5" />
                Livraison estimée {formatDeliveryWindow()}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Expédié et vendu par Ferme MendyKounda
              </p>

              <ul className="mt-4 divide-y divide-border">
                {lines.map(({ item, price, issue }) => {
                  const img = resolveProductImage(item.imageUrl);
                  return (
                    <li key={item.productId} className="flex gap-3 py-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-warm">
                        {img && (
                          <img src={img} alt={item.name} className="h-full w-full object-contain" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="line-clamp-2 font-medium">{item.name}</p>
                        <p className="font-semibold text-destructive tabular-nums">
                          {formatPrice(price)}
                        </p>
                        <p className="text-xs text-muted-foreground">Quantité : {item.quantity}</p>
                        {issue && <p className="text-xs font-medium text-destructive">{issue}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
              {blocked && (
                <p className="mt-2 text-sm text-destructive">
                  Certains articles posent problème.{" "}
                  <Link to="/cart" className="underline">
                    Modifier le panier
                  </Link>
                </p>
              )}
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-medium">Instructions de livraison (facultatif)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Point de repère, horaires de disponibilité…"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </label>

            <div className="mt-4 flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center">
              <div className="sm:w-56">{placeButton}</div>
              <p className="text-base font-semibold text-destructive">
                Montant total : <span className="tabular-nums">{formatPrice(total)}</span>
              </p>
            </div>
          </Step>
        </div>

        <aside className="h-fit rounded-lg bg-card p-5 shadow-soft lg:sticky lg:top-40">
          {placeButton}
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Le montant final est calculé à partir des prix en vigueur.
          </p>
          <div className="mt-4 border-t border-border pt-4 text-sm">
            <h2 className="font-semibold">Récapitulatif de commande</h2>
            <div className="mt-2 flex justify-between">
              <span>Articles ({itemCount}) :</span>
              <span className="tabular-nums">{formatPrice(subtotal)}</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Livraison :</span>
              <span className="tabular-nums">
                {!zone ? (
                  <span className="text-muted-foreground">selon la commune</span>
                ) : fee === 0 ? (
                  <span className="font-medium text-primary">Gratuite</span>
                ) : (
                  formatPrice(fee)
                )}
              </span>
            </div>
            {gap != null && (
              <p className="mt-1 rounded-md bg-accent/15 px-2 py-1 text-xs">
                Plus que <span className="font-semibold tabular-nums">{formatPrice(gap)}</span>{" "}
                d'achats pour la livraison gratuite à {zone?.commune}.
              </p>
            )}
            <div className="mt-1 flex justify-between">
              <span>Paiement :</span>
              <span>{paymentMethod === "wave" ? "Wave" : "À la livraison"}</span>
            </div>
            <div className="mt-3 flex justify-between gap-2 border-t border-border pt-3 text-base font-semibold text-destructive">
              <span className="whitespace-nowrap">Montant total :</span>
              <span className="tabular-nums">{formatPrice(total)}</span>
            </div>
          </div>
        </aside>
      </form>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg bg-card p-4 shadow-soft md:p-5">
      <h2 className="mb-4 flex items-baseline gap-3 text-lg font-semibold">
        <span className="tabular-nums">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
