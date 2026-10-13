/**
 * Fiche client (admin) : coordonnées, statistiques, produits préférés,
 * historique des commandes et note interne (jamais visible par le client).
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MapPin, MessageCircle, Phone, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  lineQuantity,
  orderNumber,
  whatsappLink,
  type OrderStatus,
} from "@/lib/orders";
import {
  SEGMENT_HELP,
  SEGMENT_LABEL,
  customersQueryKey,
  emptyStats,
  inSegment,
  statsByCustomer,
  type Segment,
} from "@/lib/customers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin_/customers/$customerId")({
  component: CustomerPage,
  head: () => ({
    meta: [{ title: "Fiche client — MendyKounda" }, { name: "robots", content: "noindex" }],
  }),
});

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : "—";

function CustomerPage() {
  const { customerId } = Route.useParams();
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-customer", customerId],
    enabled: isAdmin,
    queryFn: async () => {
      const [profile, orders, note] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, phone, address, city, created_at")
          .eq("id", customerId)
          .maybeSingle(),
        supabase
          .from("orders")
          .select(
            "id, created_at, status, total_amount, payment_status, shipping_city, order_items(product_id, product_name, quantity, actual_quantity, unit_price)",
          )
          .eq("user_id", customerId)
          .order("created_at", { ascending: false }),
        supabase
          .from("customer_notes")
          .select("note, updated_at")
          .eq("user_id", customerId)
          .maybeSingle(),
      ]);
      if (profile.error) throw profile.error;
      if (orders.error) throw orders.error;
      return { profile: profile.data, orders: orders.data ?? [], note: note.data };
    },
  });

  if (loading || (isAdmin && isLoading)) {
    return <div className="container-market py-20 text-sm text-muted-foreground">Chargement…</div>;
  }
  if (!isAdmin) {
    return (
      <div className="container-market py-20">
        <h1 className="text-2xl font-medium">Réservé aux administrateurs</h1>
      </div>
    );
  }
  if (!data?.profile) {
    return (
      <div className="container-market py-20">
        <h1 className="text-2xl font-medium">Client introuvable</h1>
        <Link
          to="/admin"
          search={{ tab: "customers" }}
          className="mt-4 inline-block text-sm underline"
        >
          ← Retour aux clients
        </Link>
      </div>
    );
  }

  const { profile, orders, note } = data;
  const stats =
    statsByCustomer(orders.map((o) => ({ ...o, user_id: customerId }))).get(customerId) ??
    emptyStats();
  const customer = { created_at: profile.created_at, stats };
  const segments = (["new", "loyal", "inactive", "never"] as Exclude<Segment, "all">[]).filter(
    (s) => inSegment(s, customer),
  );
  const wa = profile.phone ? whatsappLink(profile.phone) : null;

  // Produits préférés : quantités cumulées sur les commandes non annulées.
  const favorites = new Map<string, { name: string; quantity: number; orders: number }>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    for (const i of o.order_items) {
      const key = i.product_id ?? i.product_name;
      const f = favorites.get(key) ?? { name: i.product_name, quantity: 0, orders: 0 };
      f.quantity += lineQuantity(i);
      f.orders += 1;
      favorites.set(key, f);
    }
  }
  const topProducts = [...favorites.values()]
    .sort((a, b) => b.orders - a.orders || b.quantity - a.quantity)
    .slice(0, 5);

  return (
    <div className="container-market py-8 md:py-10">
      <Link
        to="/admin"
        search={{ tab: "customers" }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold md:text-3xl">
          {profile.full_name || "Client sans nom"}
        </h1>
        {segments.map((s) => (
          <span
            key={s}
            title={SEGMENT_HELP[s]}
            className="rounded-full bg-secondary px-3 py-1 text-xs font-medium"
          >
            {SEGMENT_LABEL[s]}
          </span>
        ))}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Client depuis le {fmtDate(profile.created_at)}
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Kpi
          label="Commandes"
          value={String(stats.orderCount)}
          hint={
            stats.cancelledCount
              ? `+ ${stats.cancelledCount} annulée${stats.cancelledCount > 1 ? "s" : ""}`
              : undefined
          }
        />
        <Kpi label="Total dépensé" value={formatPrice(stats.totalSpent)} />
        <Kpi label="Panier moyen" value={formatPrice(stats.averageBasket)} />
        <Kpi
          label="Dernière commande"
          value={fmtDate(stats.lastOrderAt)}
          hint={stats.firstOrderAt ? `première le ${fmtDate(stats.firstOrderAt)}` : undefined}
        />
      </dl>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {topProducts.length > 0 && (
            <section className="rounded-lg bg-card p-5 shadow-soft">
              <h2 className="text-lg font-semibold">Produits préférés</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {topProducts.map((p) => (
                  <li
                    key={p.name}
                    className="flex justify-between gap-3 rounded-md bg-secondary px-3 py-2"
                  >
                    <span>{p.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {p.orders} commande{p.orders > 1 ? "s" : ""} ·{" "}
                      {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
                        p.quantity,
                      )}{" "}
                      au total
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="rounded-lg bg-card p-5 shadow-soft">
            <h2 className="text-lg font-semibold">Historique des commandes</h2>
            {orders.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Aucune commande pour le moment.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {orders.map((o) => {
                  const status = o.status as OrderStatus;
                  const count = o.order_items.length;
                  return (
                    <li key={o.id}>
                      <Link
                        to="/admin/orders/$orderId"
                        params={{ orderId: o.id }}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm hover:bg-secondary/40"
                      >
                        <span className="w-40 shrink-0">
                          <span className="block font-mono font-medium text-primary">
                            #{orderNumber(o.id)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTime(o.created_at)}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          {count} article{count > 1 ? "s" : ""} ·{" "}
                          {o.order_items.map((i) => i.product_name).join(", ")}
                        </span>
                        <span
                          className={cn("rounded px-2 py-0.5 text-xs", ORDER_STATUS_TONE[status])}
                        >
                          {ORDER_STATUS_LABEL[status]}
                        </span>
                        <span className="w-28 text-right tabular-nums">
                          {formatPrice(Number(o.total_amount))}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-lg bg-card p-5 shadow-soft">
            <h2 className="text-lg font-semibold">Coordonnées</h2>
            {profile.address || profile.city ? (
              <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {profile.address}
                  {profile.address && profile.city ? <br /> : null}
                  {profile.city}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Adresse non renseignée.</p>
            )}
            {profile.phone ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`tel:${profile.phone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:bg-secondary"
                >
                  <Phone className="h-4 w-4" /> {profile.phone}
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
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Téléphone non renseigné.</p>
            )}
          </section>

          <NoteEditor
            customerId={customerId}
            note={note?.note ?? ""}
            updatedAt={note?.updated_at ?? null}
          />
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3 sm:p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums sm:text-xl">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** Note interne : visible uniquement par les administrateurs. */
function NoteEditor({
  customerId,
  note,
  updatedAt,
}: {
  customerId: string;
  note: string;
  updatedAt: string | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [value, setValue] = useState(note);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(note), [note]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("customer_notes").upsert({
      user_id: customerId,
      note: value.trim(),
      updated_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Note enregistrée");
      void qc.invalidateQueries({ queryKey: ["admin-customer", customerId] });
      void qc.invalidateQueries({ queryKey: customersQueryKey });
    }
  };

  return (
    <section className="rounded-lg bg-card p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <StickyNote className="h-5 w-5 text-primary" /> Note interne
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Visible uniquement par l'équipe, jamais par le client.
      </p>
      <textarea
        value={value}
        maxLength={2000}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Préférences, horaires de livraison, remarques…"
        className="input mt-3 min-h-[120px]"
        aria-label="Note interne"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {updatedAt ? `Modifiée le ${formatDateTime(updatedAt)}` : ""}
        </span>
        <Button size="sm" onClick={save} disabled={saving || value.trim() === note.trim()}>
          Enregistrer
        </Button>
      </div>
    </section>
  );
}
