/**
 * Mes commandes — historique, suivi de livraison, annulation et rachat.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, PackageX, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { openChat } from "@/lib/farm";
import { cartStore } from "@/lib/cart";
import { formatDate, formatPrice } from "@/lib/format";
import { formatLongDate, formatOrderDeliveryWindow, orderDeliveryWindow } from "@/lib/delivery";
import { effectivePrice } from "@/lib/pricing";
import { resolveProductImage } from "@/lib/product-images";
import {
  CANCELLED_BY_LABEL,
  CUSTOMER_CANCEL_REASONS,
  ORDER_STATUS_LABEL,
  ORDER_STEPS,
  PAYMENT_METHOD_LABEL,
  canCustomerCancel,
  canPayWithWave,
  awaitingWeight,
  formatWeight,
  lineQuantity,
  type OrderStatus,
} from "@/lib/orders";
import { WavePayButton } from "@/components/wave-payment";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_app/orders")({
  component: OrdersPage,
  head: () => ({
    meta: [
      { title: "Mes commandes — MendyKounda" },
      {
        name: "description",
        content: "Suivez, annulez ou commandez à nouveau vos produits MendyKounda.",
      },
      { property: "og:title", content: "Mes commandes — MendyKounda" },
      { property: "og:description", content: "Suivi de vos commandes MendyKounda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ordersQueryFn = (userId: string) => async () => {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "*, order_items(*, products(slug, name, image_url, price, discount_price, stock, is_active, unit))",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
};

type Order = Awaited<ReturnType<ReturnType<typeof ordersQueryFn>>>[number];
type Filter = "all" | "open" | "cancelled";

function OrdersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth", search: { redirect: "/orders" } });
  }, [user, loading, navigate]);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: ordersQueryFn(user?.id ?? ""),
  });

  if (!user) return null;

  const shown = (orders ?? []).filter((o) =>
    filter === "all"
      ? true
      : filter === "cancelled"
        ? o.status === "cancelled"
        : o.status !== "cancelled" && o.status !== "delivered",
  );

  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: "Commandes" },
    { id: "open", label: "En cours" },
    { id: "cancelled", label: "Annulées" },
  ];

  return (
    <div className="container-market max-w-5xl py-6 md:py-10">
      <nav className="mb-3 text-xs text-muted-foreground">
        <Link to="/account" className="hover:text-primary">
          Mon compte
        </Link>{" "}
        › <span className="text-foreground">Mes commandes</span>
      </nav>
      <h1 className="text-2xl font-medium tracking-tight md:text-3xl">Mes commandes</h1>

      <div className="mt-4 flex gap-6 overflow-x-auto border-b border-border text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 pb-2",
              filter === t.id
                ? "border-accent font-semibold"
                : "border-transparent text-primary hover:underline",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mt-4 text-sm">
        <span className="font-semibold">
          {shown.length} commande{shown.length > 1 ? "s" : ""}
        </span>
      </p>

      {isLoading && <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>}

      {!isLoading && shown.length === 0 && (
        <div className="mt-6 rounded-lg bg-card p-8 text-center shadow-soft">
          <p className="text-sm text-muted-foreground">Aucune commande ici.</p>
          <Link to="/shop" className="mt-3 inline-block text-sm text-primary hover:underline">
            Découvrir la boutique →
          </Link>
        </div>
      )}

      <ul className="mt-4 space-y-5">
        {shown.map((o) => (
          <li key={o.id}>
            <OrderCard order={o} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderCard({ order: o }: { order: Order }) {
  const status = o.status as OrderStatus;

  // Fenêtre estimée ; si elle est dépassée sans livraison, on reste vague.
  const late = orderDeliveryWindow(o).end.getTime() < Date.now();
  const eta = late ? "Livraison imminente" : `Arrivée prévue ${formatOrderDeliveryWindow(o)}`;
  const headline =
    status === "delivered"
      ? `Livrée le ${formatLongDate(o.delivered_at ?? o.updated_at)}`
      : status === "cancelled"
        ? `Annulée le ${formatLongDate(o.cancelled_at ?? o.updated_at)}`
        : status === "shipped"
          ? "En cours de livraison : le livreur est en route"
          : status === "ready"
            ? `Prête, bientôt en route — ${eta.charAt(0).toLowerCase()}${eta.slice(1)}`
            : eta;

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <header className="grid grid-cols-2 gap-3 bg-secondary px-4 py-3 text-xs sm:grid-cols-[auto_auto_1fr_auto] sm:gap-8">
        <div>
          <p className="uppercase text-muted-foreground">Commande effectuée le</p>
          <p className="mt-0.5 text-sm">{formatDate(o.created_at)}</p>
        </div>
        <div>
          <p className="uppercase text-muted-foreground">
            {o.order_items.some(awaitingWeight) ? "Total estimé" : "Total"}
          </p>
          <p className="mt-0.5 text-sm tabular-nums">{formatPrice(Number(o.total_amount))}</p>
          <p className="text-[11px] text-muted-foreground">
            {Number(o.delivery_fee) > 0
              ? `dont livraison ${formatPrice(Number(o.delivery_fee))}`
              : "livraison offerte"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="uppercase text-muted-foreground">Livraison à</p>
          <p
            className="mt-0.5 truncate text-sm"
            title={`${o.shipping_address}, ${o.shipping_city}`}
          >
            {o.shipping_full_name}, {o.shipping_city}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="uppercase text-muted-foreground">N° de commande</p>
          <p className="mt-0.5 font-mono text-sm">{o.id.slice(0, 8).toUpperCase()}</p>
        </div>
      </header>

      <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <h2
            className={cn(
              "text-base font-semibold sm:text-lg",
              status === "cancelled"
                ? "text-destructive"
                : status === "delivered"
                  ? ""
                  : "text-primary",
            )}
          >
            {headline}
          </h2>
          {status === "cancelled" ? <CancelInfo order={o} /> : <Tracker order={o} />}

          <ul className="mt-4 space-y-4">
            {o.order_items.map((it) => (
              <OrderLine key={it.id} item={it} delivered={status === "delivered"} />
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          {canPayWithWave(o) && <WavePayButton orderId={o.id} className="w-full" />}
          {canCustomerCancel(o.status, o.payment_status) ? (
            <CancelButton orderId={o.id} />
          ) : (
            (status === "processing" || status === "ready") && (
              <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
                La préparation a commencé. Pour annuler,{" "}
                <button type="button" onClick={openChat} className="text-primary underline">
                  écrivez à la ferme
                </button>
                .
              </p>
            )
          )}
          <Link
            to="/contact"
            className="block rounded-full border border-border px-4 py-1.5 text-center text-sm hover:bg-secondary"
          >
            Besoin d'aide ?
          </Link>
          <p className="pt-1 text-xs text-muted-foreground">
            {PAYMENT_METHOD_LABEL[o.payment_method] ?? o.payment_method}
            {o.payment_status === "paid"
              ? " · réglé"
              : o.payment_method === "wave" && o.status !== "cancelled"
                ? " · en attente de paiement"
                : ""}
          </p>
          {o.notes && <p className="text-xs text-muted-foreground">Instructions : {o.notes}</p>}
        </div>
      </div>
    </article>
  );
}

function Tracker({ order }: { order: Order }) {
  const current = ORDER_STEPS.indexOf(order.status as OrderStatus);
  const dates: (string | null)[] = [
    order.created_at,
    order.processing_at,
    order.ready_at,
    order.shipped_at,
    order.delivered_at,
  ];

  return (
    <ol className="mt-4 grid grid-cols-5">
      {ORDER_STEPS.map((step, i) => {
        const done = i <= current;
        return (
          <li key={step} className="relative flex flex-col items-center text-center">
            {i > 0 && (
              <span
                className={cn(
                  "absolute right-1/2 top-2.5 h-1 w-full -translate-y-1/2",
                  i <= current ? "bg-primary" : "bg-border",
                )}
                aria-hidden
              />
            )}
            <span
              className={cn(
                "relative z-10 grid h-5 w-5 place-items-center rounded-full border-2",
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card",
              )}
            >
              {done && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span
              className={cn(
                "mt-1.5 text-[11px] leading-tight sm:text-xs",
                i === current ? "font-semibold" : done ? "" : "text-muted-foreground",
              )}
            >
              {ORDER_STATUS_LABEL[step]}
            </span>
            {done && dates[i] && (
              <span className="text-[10px] text-muted-foreground">{formatDate(dates[i]!)}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function OrderLine({
  item,
  delivered,
}: {
  item: Order["order_items"][number];
  delivered: boolean;
}) {
  const navigate = useNavigate();
  const product = item.products;
  const img = resolveProductImage(product?.image_url ?? null);
  const canBuyAgain = !!product && product.is_active && product.stock > 0;

  const buyAgain = () => {
    if (!product) return;
    cartStore.add({
      productId: item.product_id!,
      name: item.product_name,
      price: effectivePrice(product),
      unit: product.unit,
      imageUrl: product.image_url,
    });
    toast.success(`${product.name} ajouté au panier`, {
      action: { label: "Voir le panier", onClick: () => void navigate({ to: "/cart" }) },
    });
  };

  return (
    <li className="flex gap-3">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-warm">
        {img && <img src={img} alt={item.product_name} className="h-full w-full object-contain" />}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        {product ? (
          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            className="line-clamp-2 text-primary hover:underline"
          >
            {item.product_name}
          </Link>
        ) : (
          <p className="line-clamp-2">{item.product_name}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {item.sold_by_weight ? (
            item.actual_quantity != null ? (
              <>
                Poids réel : {formatWeight(lineQuantity(item), product?.unit ?? "kg")} (commandé :{" "}
                {item.quantity}) · {formatPrice(Number(item.unit_price))} le {product?.unit ?? "kg"}
              </>
            ) : (
              <>
                Quantité estimée : {item.quantity} · {formatPrice(Number(item.unit_price))} le{" "}
                {product?.unit ?? "kg"} · montant ajusté après la pesée
              </>
            )
          ) : (
            <>
              Quantité : {item.quantity} · {formatPrice(Number(item.unit_price))} l'unité
            </>
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {canBuyAgain ? (
            <button
              onClick={buyAgain}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:bg-accent/85"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Acheter à nouveau
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Plus disponible actuellement</span>
          )}
          {delivered && product && (
            <Link
              to="/products/$slug"
              params={{ slug: product.slug }}
              hash="avis"
              className="rounded-full border border-border px-3 py-1 text-xs hover:bg-secondary"
            >
              Donner mon avis
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function CancelInfo({ order }: { order: Order }) {
  const by = order.cancelled_by ? CANCELLED_BY_LABEL[order.cancelled_by] : null;
  const refund = order.payment_status === "paid";
  return (
    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
      {(by || order.cancel_reason) && (
        <p>
          {by && <>Annulée {by}</>}
          {by && order.cancel_reason && " : "}
          {order.cancel_reason && <span className="text-foreground">{order.cancel_reason}</span>}
        </p>
      )}
      {refund && <p>Votre paiement va vous être remboursé. La ferme vous contactera.</p>}
      {order.payment_status === "refunded" && <p>Votre paiement vous a été remboursé.</p>}
    </div>
  );
}

function CancelButton({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const cancel = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("cancel_order", {
      _order_id: orderId,
      _reason: reason || undefined,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      void qc.invalidateQueries({ queryKey: ["my-orders"] });
      return;
    }
    toast.success("Commande annulée");
    void qc.invalidateQueries({ queryKey: ["my-orders"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["product"] });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm hover:bg-secondary disabled:opacity-50"
        >
          <PackageX className="h-4 w-4" /> Annuler la commande
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler cette commande ?</AlertDialogTitle>
          <AlertDialogDescription>
            Tous les articles de la commande seront annulés. Cette action est définitive.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="block text-sm">
          <span className="text-muted-foreground">Pourquoi ? (facultatif)</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input mt-1 w-full"
          >
            <option value="">Ne pas préciser</option>
            {CUSTOMER_CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel>Garder ma commande</AlertDialogCancel>
          <AlertDialogAction onClick={() => void cancel()}>Annuler la commande</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
