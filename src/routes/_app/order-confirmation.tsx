/**
 * Page de confirmation de commande.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";

const searchSchema = z.object({ id: z.string().uuid() });

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
  const { id } = Route.useSearch();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["order", id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: order, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", id)
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return order;
    },
  });

  return (
    <div className="container-editorial py-16 md:py-24">
      <div className="mx-auto max-w-xl text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <p className="editorial-eyebrow mt-4">Merci</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight md:text-4xl">
          Votre commande est enregistrée
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Référence : <span className="tabular-nums">{id.slice(0, 8)}</span>
          {data && <> — Total : <span className="tabular-nums">{formatPrice(Number(data.total_amount))}</span></>}
        </p>

        {isLoading && <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>}

        {data && (
          <ul className="mt-8 divide-y divide-border rounded-lg border border-border text-left">
            {data.order_items.map((it: { id: string; product_name: string; quantity: number; unit_price: number }) => (
              <li key={it.id} className="flex justify-between p-4 text-sm">
                <span>{it.product_name} × {it.quantity}</span>
                <span className="tabular-nums">{formatPrice(Number(it.unit_price) * it.quantity)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10 flex items-center justify-center gap-3">
          <Link to="/account" className="rounded-md border border-border px-4 py-2 text-sm">
            Mes commandes
          </Link>
          <Link to="/shop" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Continuer mes achats
          </Link>
        </div>
      </div>
    </div>
  );
}
