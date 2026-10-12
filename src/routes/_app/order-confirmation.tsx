/**
 * Page de confirmation de commande.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";
import { formatDeliveryWindow } from "@/lib/delivery";
import { resolveProductImage } from "@/lib/product-images";
import { useAuth } from "@/lib/auth";
import { PAYMENT_METHOD_LABEL } from "@/lib/orders";
import { WavePaymentStatusPanel } from "@/components/wave-payment";

const searchSchema = z.object({
  id: z.string().uuid(),
  // Retour depuis Wave : success_url / error_url de la session de paiement.
  wave: z.enum(["success", "error"]).optional(),
});

export const Route = createFileRoute("/_app/order-confirmation")({
  validateSearch: (s) => searchSchema.parse(s),
  component: OrderConfirmation,
  head: () => ({ meta: [
    { title: "Commande confirmée — MendyKounda" },
    { name: "description", content: "Votre commande MendyKounda a bien été enregistrée." },
    { property: "og:title", content: "Commande confirmée — MendyKounda" },
    { property: "og:description", content: "Confirmation de votre commande de produits fermiers." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function OrderConfirmation() {
  const { id, wave } = Route.useSearch();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["order", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: order, error } = await supabase
        .from("orders")
        .select("*, order_items(*, products(image_url))")
        .eq("id", id)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return order;
    },
  });

  return (
    <div className="container-market py-6 md:py-10">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="rounded-lg bg-card p-5 shadow-soft md:p-6">
          <p className="flex items-center gap-2 text-xl font-semibold text-primary">
            <CheckCircle2 className="h-6 w-6" />
            Merci, votre commande a été passée.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Commande n° <span className="font-medium text-foreground tabular-nums">{id.slice(0, 8).toUpperCase()}</span>
            {data && <> · {PAYMENT_METHOD_LABEL[data.payment_method] ?? data.payment_method}</>}
          </p>

          {data && data.payment_method === "wave" && data.status !== "cancelled" && (
            <div className="mt-4">
              <WavePaymentStatusPanel
                orderId={id}
                alreadyPaid={data.payment_status === "paid"}
                returnedWithError={wave === "error"}
              />
            </div>
          )}

          {isLoading && <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>}

          {data && (
            <>
              <div className="mt-5 grid gap-4 rounded-md border border-border p-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold">Livraison estimée</p>
                  <p className="mt-1 text-sm text-primary">{formatDeliveryWindow(data.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Livraison à</p>
                  <address className="mt-1 text-sm not-italic text-muted-foreground">
                    {data.shipping_full_name}, {data.shipping_address}, {data.shipping_postal_code} {data.shipping_city}
                  </address>
                </div>
              </div>

              <ul className="mt-5 divide-y divide-border">
                {data.order_items.map((it) => {
                  const img = resolveProductImage(it.products?.image_url ?? null);
                  return (
                    <li key={it.id} className="flex items-center gap-3 py-3 text-sm">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-warm">
                        {img && <img src={img} alt={it.product_name} className="h-full w-full object-contain" />}
                      </div>
                      <span className="min-w-0 flex-1">
                        {it.product_name} <span className="text-muted-foreground">× {it.quantity}</span>
                      </span>
                      <span className="tabular-nums">{formatPrice(Number(it.unit_price) * it.quantity)}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <aside className="h-fit space-y-3">
          {data && (
            <div className="rounded-lg bg-card p-5 text-sm shadow-soft">
              <div className="mb-2 space-y-1 border-b border-border pb-2 text-sm">
                <div className="flex justify-between">
                  <span>Articles</span>
                  <span className="tabular-nums">
                    {formatPrice(Number(data.total_amount) - Number(data.delivery_fee ?? 0))}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Livraison</span>
                  <span className="tabular-nums">
                    {Number(data.delivery_fee ?? 0) > 0 ? formatPrice(Number(data.delivery_fee)) : "Gratuite"}
                  </span>
                </div>
              </div>
              <div className="flex justify-between text-lg font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatPrice(Number(data.total_amount))}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.payment_status === "paid"
                  ? "Réglé"
                  : data.payment_method === "wave"
                    ? "À régler avec Wave"
                    : "À régler à la livraison"}
              </p>
            </div>
          )}
          <Link
            to="/orders"
            className="block rounded-full bg-accent px-4 py-2.5 text-center text-sm font-medium text-accent-foreground hover:bg-accent/85"
          >
            Suivre ma commande
          </Link>
          <Link
            to="/shop"
            className="block rounded-full border border-border bg-card px-4 py-2.5 text-center text-sm hover:bg-secondary"
          >
            Continuer mes achats
          </Link>
        </aside>
      </div>
    </div>
  );
}
