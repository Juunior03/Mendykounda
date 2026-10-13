/**
 * Fiche commande (admin) : préparation, client, paiement, historique,
 * changement de statut et bon de livraison imprimable.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  Scale,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useFarm } from "@/lib/farm";
import { ADMIN_ALERTS_KEY } from "@/lib/admin-alerts";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  BACK_STATUS,
  CANCELLED_BY_LABEL,
  NEXT_STATUS,
  awaitingWeight,
  formatWeight,
  lineQuantity,
  lineTotal,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_METHOD_LABEL,
  orderNumber,
  whatsappLink,
  type OrderStatus,
} from "@/lib/orders";
import { resolveProductImage } from "@/lib/product-images";
import { formatSlaughterDay } from "@/lib/slaughter";
import { BrandLogo } from "@/components/brand-logo";
import { CancelOrderDialog, DeliverOrderDialog } from "@/components/admin/order-status-dialogs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin_/orders/$orderId")({
  component: OrderSheetPage,
  head: () => ({
    meta: [{ title: "Fiche commande — MendyKounda" }, { name: "robots", content: "noindex" }],
  }),
});

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Non payée",
  paid: "Payée",
  refunded: "Remboursée",
  failed: "Échec",
};

const orderQuery = (id: string) => ({
  queryKey: ["admin-order", id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(
        "*, order_items(id, product_id, product_name, quantity, unit_price, sold_by_weight, actual_quantity, products(unit, image_url))",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
});

/** Articles cochés pendant la préparation, gardés dans ce navigateur. */
function usePrepChecklist(orderId: string) {
  const key = `mk_prep_${orderId}`;
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {
      setDone([]);
    }
  }, [key]);
  const toggle = (itemId: string) =>
    setDone((prev) => {
      const next = prev.includes(itemId) ? prev.filter((i) => i !== itemId) : [...prev, itemId];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* stockage indisponible : la coche reste le temps de la page */
      }
      return next;
    });
  return { done, toggle };
}

function OrderSheetPage() {
  const farm = useFarm();
  const { orderId } = Route.useParams();
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: order, isLoading } = useQuery({ ...orderQuery(orderId), enabled: isAdmin });
  const { done, toggle } = usePrepChecklist(orderId);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<"cancel" | "deliver" | null>(null);

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || (isAdmin && isLoading)) {
    return (
      <div className="container-editorial py-20 text-sm text-muted-foreground">Chargement…</div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="container-editorial py-20">
        <h1 className="text-2xl font-medium">Réservé aux administrateurs</h1>
        <Link to="/" className="mt-4 inline-block text-sm underline">
          ← Accueil
        </Link>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="container-editorial py-20">
        <h1 className="text-2xl font-medium">Commande introuvable</h1>
        <Link
          to="/admin"
          search={{ tab: "orders" }}
          className="mt-4 inline-block text-sm underline"
        >
          ← Retour aux commandes
        </Link>
      </div>
    );
  }

  const status = order.status as OrderStatus;
  const items = order.order_items ?? [];
  const subtotal = items.reduce((s, i) => s + lineTotal(i), 0);
  // Articles au poids pas encore pesés : le total reste une estimation.
  const toWeigh = items.filter(awaitingWeight).length;
  const fee = Number(order.delivery_fee ?? 0);
  const total = Number(order.total_amount);
  const paid = order.payment_status === "paid";
  const canWeigh = status !== "cancelled" && status !== "delivered" && !paid;
  const next = NEXT_STATUS[status];
  const back = BACK_STATUS[status];
  const refundDue = status === "cancelled" && paid;
  const toCollect = !paid && order.payment_method === "cash_on_delivery";
  const wa = whatsappLink(order.shipping_phone);
  const preparedCount = items.filter((i) => done.includes(i.id)).length;
  const no = orderNumber(order.id);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-order", orderId] });
    void qc.invalidateQueries({ queryKey: ["admin-orders"] });
    void qc.invalidateQueries({ queryKey: ADMIN_ALERTS_KEY });
    void qc.invalidateQueries({ queryKey: ["admin-products"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
  };

  const update = async (values: TablesUpdate<"orders">, success: string) => {
    setBusy(true);
    const { error } = await supabase.from("orders").update(values).eq("id", order.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(success);
      refresh();
    }
  };

  const setStatus = (to: OrderStatus) => {
    if (to === "cancelled") return setDialog("cancel");
    if (
      to === "ready" &&
      preparedCount < items.length &&
      !window.confirm(
        `${items.length - preparedCount} article(s) ne sont pas cochés comme prêts. Marquer la commande comme prête quand même ?`,
      )
    )
      return;
    if (
      (to === "ready" || to === "shipped" || to === "delivered") &&
      toWeigh > 0 &&
      !window.confirm(
        `${toWeigh} article(s) au poids ne sont pas pesés : le montant restera l'estimation. Continuer ?`,
      )
    )
      return;
    if (to === "delivered") return setDialog("deliver");
    void update({ status: to }, `Commande : ${ORDER_STATUS_LABEL[to].toLowerCase()}`);
  };

  const cancel = (reason: string) => {
    setDialog(null);
    void update(
      { status: "cancelled", cancel_reason: reason, cancelled_by: "farm" },
      "Commande annulée, articles remis en stock",
    );
  };

  const deliver = (collected: boolean) => {
    setDialog(null);
    void update(
      {
        status: "delivered",
        ...(collected ? { payment_status: "paid", paid_at: new Date().toISOString() } : {}),
      },
      collected ? "Livrée et encaissée" : "Commande livrée",
    );
  };

  const markRefunded = () => {
    if (!window.confirm(`Confirmer le remboursement de ${formatPrice(total)} au client ?`)) return;
    void update({ payment_status: "refunded" }, "Remboursement enregistré");
  };

  const markPaid = () => {
    if (!window.confirm(`Confirmer la réception de ${formatPrice(total)} ?`)) return;
    void update(
      { payment_status: "paid", paid_at: new Date().toISOString() },
      "Paiement enregistré",
    );
  };

  const history: { label: string; at: string | null }[] = [
    { label: "Commandée", at: order.created_at },
    { label: "Préparation commencée", at: order.processing_at },
    { label: "Prête", at: order.ready_at },
    { label: "Partie en livraison", at: order.shipped_at },
    { label: "Livrée", at: order.delivered_at },
    { label: "Paiement reçu", at: order.paid_at },
    ...(order.cancelled_at ? [{ label: "Annulée", at: order.cancelled_at }] : []),
  ];

  return (
    <>
      {/* ---------- Écran ---------- */}
      <div className="container-market py-6 pb-24 print:hidden md:py-10">
        <Link
          to="/admin"
          search={{ tab: "orders" }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Commandes
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold md:text-3xl">Commande #{no}</h1>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  ORDER_STATUS_TONE[status],
                )}
              >
                {ORDER_STATUS_LABEL[status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Passée le {formatDateTime(order.created_at)} · {items.length} article
              {items.length > 1 ? "s" : ""} · {formatPrice(total)}
            </p>
          </div>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer le bon de livraison
          </Button>
        </div>

        {order.slaughter_date && (
          <p className="mt-4 rounded-lg bg-accent/15 p-3 text-sm">
            Viande de l'abattage du <strong>{formatSlaughterDay(order.slaughter_date)}</strong> : à
            livrer à partir de ce jour.
          </p>
        )}

        {status === "cancelled" && (
          <section className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive">
              Annulée
              {order.cancelled_by &&
                ` ${order.cancelled_by === "customer" ? "par le client" : CANCELLED_BY_LABEL[order.cancelled_by]}`}
              {order.cancelled_at && ` le ${formatDateTime(order.cancelled_at)}`}
            </p>
            {order.cancel_reason && <p className="mt-1">Motif : {order.cancel_reason}</p>}
            {refundDue && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-accent/15 p-3">
                <p className="flex-1">
                  <strong>Remboursement à faire :</strong> le client avait payé {formatPrice(total)}
                  {order.payment_method === "wave" ? " par Wave" : ""}.
                </p>
                <Button size="sm" variant="outline" disabled={busy} onClick={markRefunded}>
                  Marquer comme remboursée
                </Button>
              </div>
            )}
          </section>
        )}

        {/* Actions */}
        <section className="mt-6 flex flex-wrap items-center gap-3 rounded-lg bg-card p-4 shadow-soft">
          {next && (
            <Button disabled={busy} onClick={() => setStatus(next.to)}>
              {next.label}
            </Button>
          )}
          {status === "ready" && (
            <Button variant="outline" disabled={busy} onClick={() => setStatus("delivered")}>
              Retirée à la ferme
            </Button>
          )}
          {status === "delivered" && order.delivered_at && (
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <CheckCircle2 className="h-4 w-4" /> Livrée le {formatDateTime(order.delivered_at)}
            </p>
          )}
          {status === "cancelled" && (
            <Button
              variant="outline"
              disabled={busy || order.payment_status === "refunded"}
              onClick={() => setStatus("pending")}
              title={
                order.payment_status === "refunded"
                  ? "Commande remboursée : le client doit repasser commande"
                  : undefined
              }
            >
              Réactiver la commande
            </Button>
          )}
          {!paid && status !== "cancelled" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={markPaid}
              className="border-accent text-foreground"
            >
              Marquer comme payée
            </Button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-4">
            {back && (
              <button
                disabled={busy}
                onClick={() => setStatus(back.to)}
                className="text-sm text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
              >
                {back.label}
              </button>
            )}
            {status !== "cancelled" && status !== "delivered" && (
              <button
                disabled={busy}
                onClick={() => setStatus("cancelled")}
                className="text-sm text-destructive hover:underline disabled:opacity-50"
              >
                Annuler la commande
              </button>
            )}
          </div>
        </section>

        <CancelOrderDialog
          open={dialog === "cancel"}
          onOpenChange={(o) => setDialog(o ? "cancel" : null)}
          paid={paid}
          busy={busy}
          onConfirm={cancel}
        />
        <DeliverOrderDialog
          open={dialog === "deliver"}
          onOpenChange={(o) => setDialog(o ? "deliver" : null)}
          amount={total}
          toCollect={toCollect}
          busy={busy}
          onConfirm={deliver}
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Préparation */}
          <section className="rounded-lg bg-card p-5 shadow-soft">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold">Articles à préparer</h2>
              <span className="text-sm text-muted-foreground">
                {preparedCount}/{items.length} prêt{preparedCount > 1 ? "s" : ""}
              </span>
            </div>
            <ul className="mt-4 divide-y divide-border">
              {items.map((i) => {
                const ready = done.includes(i.id);
                const img = resolveProductImage(i.products?.image_url);
                return (
                  <li key={i.id}>
                    <button
                      onClick={() => toggle(i.id)}
                      className="flex w-full items-center gap-3 py-3 text-left sm:gap-4"
                      aria-pressed={ready}
                    >
                      {ready ? (
                        <CheckCircle2 className="h-6 w-6 shrink-0 text-primary" />
                      ) : (
                        <Circle className="h-6 w-6 shrink-0 text-muted-foreground/50" />
                      )}
                      {img ? (
                        <img
                          src={img}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-md object-cover sm:h-14 sm:w-14"
                        />
                      ) : (
                        <span className="h-12 w-12 shrink-0 rounded-md bg-secondary sm:h-14 sm:w-14" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block font-medium",
                            ready && "text-muted-foreground line-through",
                          )}
                        >
                          {i.product_name}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {formatPrice(Number(i.unit_price))}
                          {i.products?.unit ? ` / ${i.products.unit}` : ""}
                          {/* Mobile : montant de la ligne ici pour laisser la place au nom. */}
                          <span className="sm:hidden">
                            {" "}
                            · {awaitingWeight(i) ? "≈ " : ""}
                            {formatPrice(lineTotal(i))}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-lg font-semibold tabular-nums">
                          {i.actual_quantity != null
                            ? formatWeight(lineQuantity(i), i.products?.unit ?? "kg")
                            : `× ${i.quantity}`}
                        </span>
                        <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">
                          {awaitingWeight(i) ? "≈ " : ""}
                          {formatPrice(lineTotal(i))}
                        </span>
                      </span>
                    </button>
                    {i.sold_by_weight && (
                      <WeightInput
                        itemId={i.id}
                        ordered={i.quantity}
                        unit={i.products?.unit ?? "kg"}
                        actual={i.actual_quantity}
                        disabled={!canWeigh}
                        onSaved={refresh}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
            <dl className="mt-2 space-y-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Articles</dt>
                <dd className="tabular-nums">{formatPrice(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Livraison</dt>
                <dd className="tabular-nums">{fee > 0 ? formatPrice(fee) : "Gratuite"}</dd>
              </div>
              {toWeigh > 0 && (
                <p className="rounded-md bg-accent/15 px-3 py-2 text-xs">
                  {toWeigh} article{toWeigh > 1 ? "s" : ""} à peser : le total sera recalculé après
                  la saisie du poids.
                </p>
              )}
              <div className="flex justify-between pt-1 text-base font-semibold">
                <dt>{toWeigh > 0 ? "Total estimé" : "Total"}</dt>
                <dd className="tabular-nums">{formatPrice(total)}</dd>
              </div>
            </dl>
          </section>

          <div className="space-y-6">
            {/* Client */}
            <section className="rounded-lg bg-card p-5 shadow-soft">
              <h2 className="text-lg font-semibold">Client et livraison</h2>
              <p className="mt-3 font-medium">{order.shipping_full_name}</p>
              <Link
                to="/admin/customers/$customerId"
                params={{ customerId: order.user_id }}
                className="text-xs text-primary hover:underline"
              >
                Voir la fiche client et son historique →
              </Link>
              <p className="mt-1 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {order.shipping_address}
                  <br />
                  {order.shipping_city}
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`tel:${order.shipping_phone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                >
                  <Phone className="h-4 w-4" /> {order.shipping_phone}
                </a>
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                )}
              </div>
              {order.notes && (
                <p className="mt-4 flex gap-2 rounded-md bg-accent/15 p-3 text-sm">
                  <StickyNote className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{order.notes}</span>
                </p>
              )}
            </section>

            {/* Paiement */}
            <section className="rounded-lg bg-card p-5 shadow-soft">
              <h2 className="text-lg font-semibold">Paiement</h2>
              <p className="mt-3 text-sm">
                {PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method}
              </p>
              <p
                className={cn(
                  "mt-2 inline-block rounded px-2 py-0.5 text-sm font-medium",
                  paid ? "bg-primary/10 text-primary" : "bg-accent/15",
                )}
              >
                {PAYMENT_STATUS_LABEL[order.payment_status] ?? order.payment_status}
                {paid && order.paid_at ? ` le ${formatDateTime(order.paid_at)}` : ""}
              </p>
              {toCollect && status !== "cancelled" && (
                <p className="mt-2 text-sm text-muted-foreground">
                  À encaisser à la livraison :{" "}
                  <strong className="text-foreground">{formatPrice(total)}</strong>
                </p>
              )}
            </section>

            {/* Historique */}
            <section className="rounded-lg bg-card p-5 shadow-soft">
              <h2 className="text-lg font-semibold">Historique</h2>
              <ol className="mt-3 space-y-2.5 text-sm">
                {history.map((h) => (
                  <li key={h.label} className="flex items-start gap-2.5">
                    {h.at ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                    )}
                    <span className={cn("flex-1", !h.at && "text-muted-foreground")}>
                      {h.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {h.at ? formatDateTime(h.at) : "—"}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                Confirmation au client : e-mail{" "}
                {order.confirmation_email_sent_at ? "envoyé" : "non envoyé"} · SMS{" "}
                {order.confirmation_sms_sent_at ? "envoyé" : "non envoyé"}
              </p>
            </section>
          </div>
        </div>
      </div>

      {/* Mobile : action principale toujours à portée de pouce. */}
      {(next || status !== "cancelled") && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-card p-3 shadow-elevated print:hidden md:hidden">
          <a
            href={`tel:${order.shipping_phone.replace(/\s/g, "")}`}
            aria-label={`Appeler ${order.shipping_full_name}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border"
          >
            <Phone className="h-5 w-5" />
          </a>
          {next ? (
            <Button className="h-11 flex-1" disabled={busy} onClick={() => setStatus(next.to)}>
              {next.label}
            </Button>
          ) : (
            <p className="flex-1 text-center text-sm font-medium text-primary">
              {ORDER_STATUS_LABEL[status]}
            </p>
          )}
        </div>
      )}

      {/* ---------- Bon de livraison (impression) ---------- */}
      <div className="hidden bg-white text-sm text-black print:block">
        <div className="flex items-start justify-between border-b-2 border-[#14532d] pb-4">
          <BrandLogo />
          <div className="text-right">
            <p className="text-xl font-bold">BON DE LIVRAISON</p>
            <p className="mt-1">Commande n° {no}</p>
            <p>Du {formatDateTime(order.created_at)}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Livrer à</p>
            <p className="mt-1 text-base font-semibold">{order.shipping_full_name}</p>
            <p>{order.shipping_address}</p>
            <p>{order.shipping_city}</p>
            <p className="mt-1 font-medium">Tél. {order.shipping_phone}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Paiement</p>
            <p className="mt-1">
              {PAYMENT_METHOD_LABEL[order.payment_method] ?? order.payment_method}
            </p>
            <p className="mt-2 rounded border-2 border-black p-2 text-base font-bold">
              {paid
                ? "DÉJÀ PAYÉE"
                : `À ENCAISSER : ${formatPrice(total)}${toWeigh > 0 ? " (estimé avant pesée)" : ""}`}
            </p>
          </div>
        </div>

        {order.slaughter_date && (
          <p className="mt-4 rounded border-2 border-black p-2 font-semibold">
            Viande de l'abattage du {formatSlaughterDay(order.slaughter_date)} : livrer à partir de
            ce jour.
          </p>
        )}

        {order.notes && (
          <p className="mt-4 rounded border border-gray-400 p-2">
            <strong>Instructions du client :</strong> {order.notes}
          </p>
        )}

        <table className="mt-5 w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="w-8 py-2" />
              <th className="py-2">Article</th>
              <th className="py-2 text-center">Qté</th>
              <th className="py-2 text-right">Prix unitaire</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-gray-300">
                <td className="py-2">
                  <span className="inline-block h-4 w-4 border border-black" />
                </td>
                <td className="py-2">
                  {i.product_name}
                  {i.products?.unit ? (
                    <span className="text-gray-500"> ({i.products.unit})</span>
                  ) : null}
                </td>
                <td className="py-2 text-center font-semibold">
                  {i.actual_quantity != null ? (
                    formatWeight(lineQuantity(i), i.products?.unit ?? "kg")
                  ) : i.sold_by_weight ? (
                    <span className="font-normal">{i.quantity} estimé · pesé : ______</span>
                  ) : (
                    i.quantity
                  )}
                </td>
                <td className="py-2 text-right">{formatPrice(Number(i.unit_price))}</td>
                <td className="py-2 text-right">
                  {awaitingWeight(i) ? "à peser" : formatPrice(lineTotal(i))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="pt-3 text-right">
                Articles
              </td>
              <td className="pt-3 text-right">{formatPrice(subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="text-right">
                Livraison
              </td>
              <td className="text-right">{fee > 0 ? formatPrice(fee) : "Gratuite"}</td>
            </tr>
            <tr className="text-base font-bold">
              <td colSpan={4} className="pt-1 text-right">
                {toWeigh > 0 ? "Total estimé (avant pesée)" : "Total"}
              </td>
              <td className="pt-1 text-right">{formatPrice(total)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-10 grid grid-cols-2 gap-8">
          <div className="h-24 border-t border-black pt-1 text-xs">Préparée par</div>
          <div className="h-24 border-t border-black pt-1 text-xs">
            Reçue par (nom, date et signature du client)
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-gray-500">
          {farm.name} · {farm.location}
          {farm.phone ? ` · ${farm.phone}` : ""} · Merci de votre confiance !
        </p>
      </div>
    </>
  );
}

/** Saisie du poids pesé d'un article vendu au poids (recalcule le total en base). */
function WeightInput({
  itemId,
  ordered,
  unit,
  actual,
  disabled,
  onSaved,
}: {
  itemId: string;
  ordered: number;
  unit: string;
  actual: number | null;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(actual != null ? String(actual).replace(".", ",") : "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(actual != null ? String(actual).replace(".", ",") : ""), [actual]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim().replace(",", ".");
    const weight = v === "" ? null : Number(v);
    if (weight !== null && (!Number.isFinite(weight) || weight <= 0)) {
      toast.error("Poids invalide");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc("set_item_weight", {
      _item_id: itemId,
      _weight: weight,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(
        weight === null
          ? "Poids effacé"
          : `Poids enregistré · nouveau total ${formatPrice(Number(data))}`,
      );
      onSaved();
    }
  };

  const changed = value.trim().replace(",", ".") !== (actual != null ? String(actual) : "");

  return (
    <form onSubmit={save} className="mb-3 flex flex-wrap items-center gap-2 text-sm sm:ml-10">
      <Scale className="h-4 w-4 text-primary" />
      <label htmlFor={`w-${itemId}`} className="text-muted-foreground">
        Poids pesé :
      </label>
      <input
        id={`w-${itemId}`}
        inputMode="decimal"
        value={value}
        disabled={disabled || saving}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`≈ ${ordered}`}
        aria-describedby={`wo-${itemId}`}
        className="w-28 rounded-md border border-border bg-background px-2 py-1 tabular-nums disabled:opacity-60"
      />
      <span className="text-muted-foreground">{unit}</span>
      <span id={`wo-${itemId}`} className="text-xs text-muted-foreground">
        (commandé : {ordered} {unit})
      </span>
      {!disabled && (
        <Button type="submit" size="sm" variant="outline" disabled={saving || !changed}>
          Enregistrer
        </Button>
      )}
      {disabled && actual == null && (
        <span className="text-xs text-muted-foreground">Non pesé</span>
      )}
    </form>
  );
}
