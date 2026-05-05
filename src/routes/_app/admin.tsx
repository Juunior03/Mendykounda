/**
 * Dashboard Admin — KPIs, graphique ventes, gestion produits & commandes.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Package, ShoppingCart, Users, Euro } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — MendyKounda" }] }),
});

type Tab = "overview" | "products" | "categories" | "orders";

function AdminPage() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading) return <div className="container-editorial py-20 text-sm text-muted-foreground">Chargement…</div>;

  if (!isAdmin) {
    return (
      <div className="container-editorial py-20">
        <p className="editorial-eyebrow">Accès restreint</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Réservé aux administrateurs</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Votre compte n'a pas les permissions nécessaires. Contactez un administrateur.
        </p>
        <Link to="/" className="mt-6 inline-block underline-grow text-sm">← Accueil</Link>
      </div>
    );
  }

  return (
    <div className="container-editorial py-12 md:py-16">
      <p className="editorial-eyebrow">Tableau de bord</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight md:text-4xl">Administration</h1>

      <div className="mt-8 flex gap-1 border-b border-border">
        {(["overview", "products", "orders"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "overview" ? "Vue d'ensemble" : t === "products" ? "Produits" : "Commandes"}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "overview" && <Overview />}
        {tab === "products" && <ProductsAdmin />}
        {tab === "orders" && <OrdersAdmin />}
      </div>
    </div>
  );
}

/* ---------- Overview ---------- */
function Overview() {
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [orders, products, profiles] = await Promise.all([
        supabase.from("orders").select("id, total_amount, created_at, status"),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      const allOrders = orders.data ?? [];
      const revenue = allOrders.reduce((s, o) => s + Number(o.total_amount), 0);
      return {
        orderCount: allOrders.length,
        revenue,
        productCount: products.count ?? 0,
        userCount: profiles.count ?? 0,
        orders: allOrders,
      };
    },
  });

  const chartData = useMemo(() => {
    if (!stats) return [];
    const buckets = new Map<string, number>();
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }
    for (const o of stats.orders) {
      const key = (o.created_at as string).slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(o.total_amount));
    }
    return Array.from(buckets.entries()).map(([date, value]) => ({
      date: date.slice(5),
      value: Math.round(value),
    }));
  }, [stats]);

  const kpis = [
    { label: "Revenus", value: stats ? formatPrice(stats.revenue) : "—", icon: Euro },
    { label: "Commandes", value: stats?.orderCount ?? "—", icon: ShoppingCart },
    { label: "Produits", value: stats?.productCount ?? "—", icon: Package },
    { label: "Clients", value: stats?.userCount ?? "—", icon: Users },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-border bg-cream p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <k.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-medium tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border p-6">
        <p className="editorial-eyebrow">Ventes — 14 derniers jours</p>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => formatPrice(Number(v))}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ---------- Products admin ---------- */
function ProductsAdmin() {
  const qc = useQueryClient();
  const { data: products } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock, is_active, is_featured, unit")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const toggle = async (id: string, field: "is_active" | "is_featured", value: boolean) => {
    const patch = field === "is_active" ? { is_active: value } : { is_featured: value };
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Mis à jour"); qc.invalidateQueries({ queryKey: ["admin-products"] }); }
  };

  const updateStock = async (id: string, stock: number) => {
    const { error } = await supabase.from("products").update({ stock }).eq("id", id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["admin-products"] });
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="p-3">Produit</th>
            <th className="p-3">Prix</th>
            <th className="p-3">Stock</th>
            <th className="p-3">Actif</th>
            <th className="p-3">Mis en avant</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products?.map((p) => (
            <tr key={p.id} className="hover:bg-secondary/40">
              <td className="p-3 font-medium">{p.name}</td>
              <td className="p-3 tabular-nums">{formatPrice(Number(p.price))} / {p.unit}</td>
              <td className="p-3">
                <input
                  type="number"
                  defaultValue={p.stock}
                  onBlur={(e) => updateStock(p.id, Number(e.target.value))}
                  className="w-20 rounded border border-border bg-background px-2 py-1 text-xs"
                />
              </td>
              <td className="p-3">
                <input
                  type="checkbox"
                  checked={p.is_active}
                  onChange={(e) => toggle(p.id, "is_active", e.target.checked)}
                />
              </td>
              <td className="p-3">
                <input
                  type="checkbox"
                  checked={p.is_featured}
                  onChange={(e) => toggle(p.id, "is_featured", e.target.checked)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Orders admin ---------- */
function OrdersAdmin() {
  const qc = useQueryClient();
  const { data: orders } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, total_amount, status, payment_status, shipping_full_name, shipping_city")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const statuses = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
  type OrderStatus = typeof statuses[number];

  const updateStatus = async (id: string, status: OrderStatus) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Statut mis à jour"); qc.invalidateQueries({ queryKey: ["admin-orders"] }); }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="p-3">Date</th>
            <th className="p-3">Client</th>
            <th className="p-3">Ville</th>
            <th className="p-3">Total</th>
            <th className="p-3">Paiement</th>
            <th className="p-3">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {orders?.map((o) => (
            <tr key={o.id} className="hover:bg-secondary/40">
              <td className="p-3 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString("fr-FR")}</td>
              <td className="p-3">{o.shipping_full_name}</td>
              <td className="p-3">{o.shipping_city}</td>
              <td className="p-3 tabular-nums">{formatPrice(Number(o.total_amount))}</td>
              <td className="p-3">
                <span className={`rounded px-2 py-0.5 text-xs ${o.payment_status === "paid" ? "bg-primary/10 text-primary" : "bg-secondary"}`}>
                  {o.payment_status}
                </span>
              </td>
              <td className="p-3">
                <select
                  value={o.status}
                  onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
            </tr>
          ))}
          {orders?.length === 0 && (
            <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">Aucune commande pour le moment.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
