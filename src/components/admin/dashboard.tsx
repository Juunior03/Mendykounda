/**
 * Tableau de bord admin : chiffres clés de la période, actions à traiter,
 * ventes dans le temps, meilleurs produits et dernières commandes.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Clock,
  CookingPot,
  MessageSquare,
  Minus,
  PackageCheck,
  PackageX,
  Truck,
  Undo2,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice, plural } from "@/lib/format";
import { ORDER_STATUS_LABEL, lineTotal, orderNumber, type OrderStatus } from "@/lib/orders";
import { LOW_STOCK_THRESHOLD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export type OrdersFilter = OrderStatus | "all" | "wave_unpaid" | "refund_due";
export type ProductsFilter = "all" | "low" | "out";

export interface DashboardNav {
  orders: (filter: OrdersFilter) => void;
  products: (filter: ProductsFilter) => void;
  messages: () => void;
}

type Period = 7 | 30 | 90;
const PERIODS: { days: Period; label: string }[] = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
];

const DAY = 24 * 3600 * 1000;

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

interface DashOrder {
  id: string;
  created_at: string;
  total_amount: number;
  status: string;
  payment_status: string;
  shipping_full_name: string;
  order_items: {
    product_id: string | null;
    product_name: string;
    quantity: number;
    unit_price: number;
    actual_quantity: number | null;
  }[];
}

function useDashboard(period: Period) {
  return useQuery({
    queryKey: ["admin-dashboard", period],
    queryFn: async () => {
      const today = startOfDay(new Date());
      // Période courante = les `period` derniers jours (aujourd'hui inclus) ;
      // période précédente = les `period` jours d'avant, pour comparer.
      const start = new Date(today.getTime() - (period - 1) * DAY);
      const prevStart = new Date(start.getTime() - period * DAY);

      const count = (q: PromiseLike<{ count: number | null; error: unknown }>) =>
        Promise.resolve(q).then((r) => {
          if (r.error) throw r.error;
          return r.count ?? 0;
        });

      const [
        orders,
        toPrepare,
        inPreparation,
        toShip,
        inDelivery,
        waveUnpaid,
        refundDue,
        lowStock,
        unread,
        customers,
        recent,
      ] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, created_at, total_amount, status, payment_status, shipping_full_name, order_items(product_id, product_name, quantity, unit_price, actual_quantity)",
          )
          .gte("created_at", prevStart.toISOString())
          .then((r) => {
            if (r.error) throw r.error;
            return r.data ?? [];
          }),
        count(
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
        ),
        count(
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("status", "processing"),
        ),
        count(
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("status", "ready"),
        ),
        count(
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("status", "shipped"),
        ),
        count(
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("payment_method", "wave")
            .neq("payment_status", "paid")
            .neq("status", "cancelled"),
        ),
        count(
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("status", "cancelled")
            .eq("payment_status", "paid"),
        ),
        supabase
          .from("products")
          .select("id, name, stock, unit")
          .eq("is_active", true)
          .lte("stock", LOW_STOCK_THRESHOLD)
          .order("stock")
          .then((r) => {
            if (r.error) throw r.error;
            return r.data ?? [];
          }),
        count(
          supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("is_from_admin", false)
            .is("read_at", null),
        ),
        supabase
          .from("profiles")
          .select("created_at")
          .then((r) => {
            if (r.error) throw r.error;
            return r.data ?? [];
          }),
        supabase
          .from("orders")
          .select("id, created_at, total_amount, status, payment_status, shipping_full_name")
          .order("created_at", { ascending: false })
          .limit(6)
          .then((r) => {
            if (r.error) throw r.error;
            return r.data ?? [];
          }),
      ]);

      return {
        start,
        prevStart,
        orders,
        toPrepare,
        inPreparation,
        toShip,
        inDelivery,
        waveUnpaid,
        refundDue,
        lowStock,
        unread,
        customers,
        recent,
      };
    },
    refetchInterval: 60_000,
  });
}

/* ------------------------------------------------------------------ */

export function AdminDashboard({ nav }: Readonly<{ nav: DashboardNav }>) {
  const [period, setPeriod] = useState<Period>(7);
  const { data, isLoading, error } = useDashboard(period);

  const stats = useMemo(() => {
    if (!data) return null;
    const inCurrent = (o: DashOrder) => new Date(o.created_at) >= data.start;
    // Les commandes annulées ne comptent ni dans le CA ni dans le nombre de commandes.
    const valid = data.orders.filter((o) => o.status !== "cancelled");
    const cur = valid.filter(inCurrent);
    const prev = valid.filter((o) => !inCurrent(o));
    const sum = (os: DashOrder[]) => os.reduce((s, o) => s + Number(o.total_amount), 0);

    const revenue = sum(cur);
    const prevRevenue = sum(prev);
    const basket = cur.length ? revenue / cur.length : 0;
    const prevBasket = prev.length ? prevRevenue / prev.length : 0;
    const newCustomers = data.customers.filter((c) => new Date(c.created_at) >= data.start).length;
    const prevNewCustomers = data.customers.filter((c) => {
      const d = new Date(c.created_at);
      return d >= data.prevStart && d < data.start;
    }).length;
    const cancelled = data.orders.filter((o) => o.status === "cancelled" && inCurrent(o)).length;

    // Ventes par jour (7 / 30 j) ou par semaine (90 j).
    const step = period === 90 ? 7 : 1;
    const buckets: { start: Date; revenue: number; orders: number }[] = [];
    for (let t = data.start.getTime(); t < data.start.getTime() + period * DAY; t += step * DAY) {
      buckets.push({ start: new Date(t), revenue: 0, orders: 0 });
    }
    for (const o of cur) {
      const idx = Math.floor(
        (new Date(o.created_at).getTime() - data.start.getTime()) / (step * DAY),
      );
      const b = buckets[Math.min(idx, buckets.length - 1)];
      b.revenue += Number(o.total_amount);
      b.orders += 1;
    }

    // Meilleurs produits par chiffre d'affaires sur la période.
    const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of cur) {
      for (const it of o.order_items) {
        const key = it.product_id ?? it.product_name;
        const row = byProduct.get(key) ?? { name: it.product_name, qty: 0, revenue: 0 };
        row.qty += it.quantity;
        row.revenue += lineTotal(it);
        byProduct.set(key, row);
      }
    }
    const top = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    return {
      revenue,
      prevRevenue,
      orders: cur.length,
      prevOrders: prev.length,
      basket,
      prevBasket,
      newCustomers,
      prevNewCustomers,
      cancelled,
      buckets,
      step,
      top,
    };
  }, [data, period]);

  if (error) {
    return <p className="text-sm text-destructive">Impossible de charger le tableau de bord.</p>;
  }

  const prevLabel = `vs ${period} j précédents`;

  return (
    <div className="space-y-6">
      {/* Filtre de période : une seule ligne, au-dessus de tout */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data
            ? `Du ${data.start.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} à aujourd'hui`
            : "Chargement…"}
        </p>
        <fieldset className="inline-flex rounded-md border border-border bg-card p-0.5">
          <legend className="sr-only">Période</legend>
          {PERIODS.map((p) => (
            <button
              type="button"
              key={p.days}
              aria-pressed={period === p.days}
              onClick={() => setPeriod(p.days)}
              className={cn(
                "rounded px-3 py-1.5 text-sm transition-colors",
                period === p.days
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </fieldset>
      </div>

      {/* Chiffres clés */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Chiffre d'affaires"
          value={stats ? formatPrice(stats.revenue) : "—"}
          current={stats?.revenue}
          previous={stats?.prevRevenue}
          compareLabel={prevLabel}
        />
        <StatTile
          label="Commandes"
          value={stats ? String(stats.orders) : "—"}
          current={stats?.orders}
          previous={stats?.prevOrders}
          compareLabel={prevLabel}
          note={
            stats?.cancelled
              ? `${stats.cancelled} annulée${plural(stats.cancelled)} non comptée${plural(stats.cancelled)}`
              : undefined
          }
        />
        <StatTile
          label="Panier moyen"
          value={stats ? formatPrice(stats.basket) : "—"}
          current={stats?.basket}
          previous={stats?.prevBasket}
          compareLabel={prevLabel}
        />
        <StatTile
          label="Nouveaux clients"
          value={stats ? String(stats.newCustomers) : "—"}
          current={stats?.newCustomers}
          previous={stats?.prevNewCustomers}
          compareLabel={prevLabel}
          note={data ? `${data.customers.length} au total` : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Ventes */}
        <section className="min-w-0 rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold">
            Chiffre d'affaires {period === 90 ? "par semaine" : "par jour"}
          </h2>
          <p className="text-xs text-muted-foreground">
            Commandes annulées exclues · survolez une barre pour le détail
          </p>
          {stats && <SalesChart buckets={stats.buckets} weekly={stats.step === 7} />}
          {stats && <SalesTable buckets={stats.buckets} weekly={stats.step === 7} />}
          {isLoading && <div className="mt-4 h-72 animate-pulse rounded-md bg-secondary" />}
        </section>

        {/* À traiter */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold">À traiter</h2>
          <ul className="mt-3 divide-y divide-border">
            <ActionRow
              icon={Clock}
              label="Commandes à préparer"
              count={data?.toPrepare}
              onClick={() => nav.orders("pending")}
            />
            <ActionRow
              icon={CookingPot}
              label="En préparation"
              count={data?.inPreparation}
              onClick={() => nav.orders("processing")}
            />
            <ActionRow
              icon={PackageCheck}
              label="Prêtes, à livrer"
              count={data?.toShip}
              onClick={() => nav.orders("ready")}
            />
            <ActionRow
              icon={Truck}
              label="En cours de livraison"
              count={data?.inDelivery}
              onClick={() => nav.orders("shipped")}
            />
            <ActionRow
              icon={Wallet}
              label="Paiements Wave en attente"
              count={data?.waveUnpaid}
              onClick={() => nav.orders("wave_unpaid")}
            />
            <ActionRow
              icon={Undo2}
              label="Remboursements à faire"
              count={data?.refundDue}
              tone="critical"
              onClick={() => nav.orders("refund_due")}
            />
            <ActionRow
              icon={PackageX}
              label="Produits épuisés"
              count={data?.lowStock.filter((p) => p.stock <= 0).length}
              tone="critical"
              onClick={() => nav.products("out")}
            />
            <ActionRow
              icon={AlertTriangle}
              label={`Stock bas (≤ ${LOW_STOCK_THRESHOLD})`}
              count={data?.lowStock.filter((p) => p.stock > 0).length}
              tone="warning"
              onClick={() => nav.products("low")}
            />
            <ActionRow
              icon={MessageSquare}
              label="Messages non lus"
              count={data?.unread}
              onClick={nav.messages}
            />
          </ul>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Meilleurs produits */}
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold">Meilleurs produits</h2>
          <p className="text-xs text-muted-foreground">Par chiffre d'affaires sur la période</p>
          {stats?.top.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground">Aucune vente sur la période.</p>
          )}
          <ol className="mt-4 space-y-3">
            {stats?.top.map((p, i) => (
              <li key={p.name} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="mr-2 text-muted-foreground tabular-nums">{i + 1}.</span>
                    {p.name}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatPrice(p.revenue)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-chart-sales"
                      style={{ width: `${Math.max(4, (p.revenue / stats.top[0].revenue) * 100)}%` }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {p.qty} vendu{p.qty > 1 ? "s" : ""}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Dernières commandes */}
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Dernières commandes</h2>
            <button
              type="button"
              onClick={() => nav.orders("all")}
              className="text-sm text-primary hover:underline"
            >
              Tout voir
            </button>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {data?.recent.length === 0 && (
              <li className="py-6 text-sm text-muted-foreground">Aucune commande.</li>
            )}
            {data?.recent.map((o) => (
              <li key={o.id}>
                <Link
                  to="/admin/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-secondary/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.shipping_full_name}</span>
                    <span className="block text-xs text-muted-foreground">
                      #{orderNumber(o.id)} ·{" "}
                      {new Date(o.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </span>
                  <StatusLabel status={o.status} />
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {formatPrice(Number(o.total_amount))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

type Delta = { text: string; dir: "up" | "down" | "flat" };

const DELTA_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };

/** Évolution par rapport à la période précédente (null si inconnue). */
function computeDelta(current?: number, previous?: number): Delta | null {
  if (current == null || previous == null) return null;
  if (previous === 0)
    return current > 0 ? { text: "nouveau", dir: "up" } : { text: "stable", dir: "flat" };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { text: `+${pct} %`, dir: "up" };
  if (pct < 0) return { text: `${pct} %`, dir: "down" };
  return { text: "0 %", dir: "flat" };
}

function StatTile({
  label,
  value,
  current,
  previous,
  compareLabel,
  note,
}: Readonly<{
  label: string;
  value: string;
  current?: number;
  previous?: number;
  compareLabel: string;
  note?: string;
}>) {
  const delta = computeDelta(current, previous);
  const Icon = DELTA_ICON[delta?.dir ?? "flat"];
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {delta && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5 text-foreground" aria-hidden />
          <span className="font-medium text-foreground">{delta.text}</span> {compareLabel}
        </p>
      )}
      {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

function ActionRow({
  icon: Icon,
  label,
  count,
  tone,
  onClick,
}: Readonly<{
  icon: typeof Clock;
  label: string;
  count?: number;
  tone?: "warning" | "critical";
  onClick: () => void;
}>) {
  const active = (count ?? 0) > 0;
  let iconTone = "text-muted-foreground";
  if (active && tone === "critical") iconTone = "text-destructive";
  else if (active && tone === "warning") iconTone = "text-accent";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-secondary/50"
      >
        <Icon className={cn("h-4 w-4 shrink-0", iconTone)} aria-hidden />
        <span className={cn("flex-1", !active && "text-muted-foreground")}>{label}</span>
        <span
          className={cn(
            "min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums",
            active ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
          )}
        >
          {count ?? "–"}
        </span>
        <ChevronRight
          className="h-4 w-4 text-muted-foreground group-hover:text-foreground"
          aria-hidden
        />
      </button>
    </li>
  );
}

function StatusLabel({ status }: Readonly<{ status: OrderStatus }>) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
        status === "cancelled"
          ? "bg-destructive/10 text-destructive"
          : "bg-secondary text-foreground",
      )}
    >
      {ORDER_STATUS_LABEL[status] ?? status}
    </span>
  );
}

/* ------------------------------------------------------------------ */

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function shortAmount(v: number) {
  if (v >= 1_000_000)
    return `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (v >= 1000) return `${Math.round(v / 1000)} k`;
  return String(v);
}

function bucketLabel(d: Date, weekly: boolean, long = false) {
  if (weekly) {
    const day = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return long ? `Semaine du ${day}` : day;
  }
  return d.toLocaleDateString(
    "fr-FR",
    long
      ? { weekday: "long", day: "numeric", month: "long" }
      : { day: "2-digit", month: "2-digit" },
  );
}

function SalesChart({
  buckets,
  weekly,
}: Readonly<{
  buckets: { start: Date; revenue: number; orders: number }[];
  weekly: boolean;
}>) {
  const rows = buckets.map((b) => ({ ...b, label: bucketLabel(b.start, weekly) }));
  return (
    // Hauteur du conteneur = zone de tracé + bande de l'axe X.
    <div className="mt-4 h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={shortAmount}
          />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={<SalesTooltip weekly={weekly} />}
          />
          <Bar dataKey="revenue" fill="var(--chart-sales)" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SalesTooltip({
  active,
  payload,
  weekly,
}: Readonly<{
  active?: boolean;
  payload?: { payload: { start: Date; revenue: number; orders: number } }[];
  weekly: boolean;
}>) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-soft">
      <p className="font-medium">{capitalize(bucketLabel(b.start, weekly, true))}</p>
      <p className="mt-1 tabular-nums">{formatPrice(b.revenue)}</p>
      <p className="text-muted-foreground">
        {b.orders} commande{plural(b.orders)}
      </p>
    </div>
  );
}

/** Vue tableau des mêmes données (accessibilité, lecture précise). */
function SalesTable({
  buckets,
  weekly,
}: Readonly<{
  buckets: { start: Date; revenue: number; orders: number }[];
  weekly: boolean;
}>) {
  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-primary hover:underline">
        Afficher les données
      </summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1 font-normal">{weekly ? "Semaine du" : "Jour"}</th>
              <th className="py-1 text-right font-normal">Commandes</th>
              <th className="py-1 text-right font-normal">Chiffre d'affaires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {buckets.map((b) => (
              <tr key={b.start.toISOString()}>
                <td className="py-1">{capitalize(bucketLabel(b.start, weekly, true))}</td>
                <td className="py-1 text-right tabular-nums">{b.orders}</td>
                <td className="py-1 text-right tabular-nums">{formatPrice(b.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
