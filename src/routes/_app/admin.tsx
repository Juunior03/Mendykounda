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
import { ChatBox } from "@/components/chat-box";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — MendyKounda" }] }),
});

type Tab = "overview" | "products" | "categories" | "orders" | "messages";

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

      <div className="mt-8 flex gap-1 border-b border-border overflow-x-auto">
        {(["overview", "products", "categories", "orders", "messages"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "overview" ? "Vue d'ensemble" : t === "products" ? "Produits" : t === "categories" ? "Catégories" : t === "orders" ? "Commandes" : "Messages"}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "overview" && <Overview />}
        {tab === "products" && <ProductsAdmin />}
        {tab === "categories" && <CategoriesAdmin />}
        {tab === "orders" && <OrdersAdmin />}
        {tab === "messages" && <MessagesAdmin />}
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

/* ---------- helpers ---------- */
const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

interface ProductRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  stock: number;
  unit: string;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  category_id: string | null;
}

const emptyProduct: Partial<ProductRow> = {
  name: "", slug: "", description: "", price: 0, stock: 0, unit: "kg",
  image_url: "", is_active: true, is_featured: false, category_id: null,
};

/* ---------- Products admin ---------- */
function ProductsAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<ProductRow> | null>(null);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-products"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["product"] });
  };

  const { data: products } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, price, stock, is_active, is_featured, unit, image_url, category_id")
        .order("name");
      if (error) throw error;
      return data as ProductRow[];
    },
  });

  const { data: categories } = useQuery({
    queryKey: ["admin-categories-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const toggle = async (id: string, field: "is_active" | "is_featured", value: boolean) => {
    const patch = field === "is_active" ? { is_active: value } : { is_featured: value };
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Mis à jour"); invalidateAll(); }
  };

  const updateStock = async (id: string, stock: number) => {
    const { error } = await supabase.from("products").update({ stock }).eq("id", id);
    if (error) toast.error(error.message);
    else invalidateAll();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce produit ?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Supprimé"); invalidateAll(); }
  };

  const save = async () => {
    if (!editing) return;
    const payload = {
      name: editing.name!,
      slug: editing.slug || slugify(editing.name || ""),
      description: editing.description || null,
      price: Number(editing.price ?? 0),
      stock: Number(editing.stock ?? 0),
      unit: editing.unit || "unit",
      image_url: editing.image_url || null,
      is_active: !!editing.is_active,
      is_featured: !!editing.is_featured,
      category_id: editing.category_id || null,
    };
    if (!payload.name) { toast.error("Nom requis"); return; }

    const { error } = editing.id
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success(editing.id ? "Produit mis à jour" : "Produit créé"); setEditing(null); invalidateAll(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ ...emptyProduct })}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          + Nouveau produit
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Produit</th>
              <th className="p-3">Prix</th>
              <th className="p-3">Stock</th>
              <th className="p-3">Actif</th>
              <th className="p-3">Vedette</th>
              <th className="p-3 text-right">Actions</th>
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
                  <input type="checkbox" checked={p.is_active}
                    onChange={(e) => toggle(p.id, "is_active", e.target.checked)} />
                </td>
                <td className="p-3">
                  <input type="checkbox" checked={p.is_featured}
                    onChange={(e) => toggle(p.id, "is_featured", e.target.checked)} />
                </td>
                <td className="p-3 text-right space-x-2">
                  <button onClick={() => setEditing(p)} className="text-xs underline-grow">Éditer</button>
                  <button onClick={() => remove(p.id)} className="text-xs text-destructive">Suppr.</button>
                </td>
              </tr>
            ))}
            {products?.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">Aucun produit. Créez-en un.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-2xl rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-medium">{editing.id ? "Éditer le produit" : "Nouveau produit"}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Nom">
                <input className="input" value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value, slug: editing.id ? editing.slug : slugify(e.target.value) })} />
              </Field>
              <Field label="Slug">
                <input className="input" value={editing.slug ?? ""}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
              </Field>
              <Field label="Prix (€)">
                <input type="number" step="0.01" className="input" value={editing.price ?? 0}
                  onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} />
              </Field>
              <Field label="Stock">
                <input type="number" className="input" value={editing.stock ?? 0}
                  onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })} />
              </Field>
              <Field label="Unité">
                <input className="input" value={editing.unit ?? ""}
                  onChange={(e) => setEditing({ ...editing, unit: e.target.value })} placeholder="kg, pièce…" />
              </Field>
              <Field label="Catégorie">
                <select className="input" value={editing.category_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}>
                  <option value="">— Aucune —</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Image" className="sm:col-span-2">
                <ImagePicker
                  value={editing.image_url ?? ""}
                  onChange={(url) => setEditing({ ...editing, image_url: url })}
                />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <textarea className="input min-h-[100px]" value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.is_active}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Actif (visible)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!editing.is_featured}
                  onChange={(e) => setEditing({ ...editing, is_featured: e.target.checked })} /> Mis en avant
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-md border border-border px-4 py-2 text-sm">Annuler</button>
              <button onClick={save} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-xs ${className}`}>
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/* ---------- Categories admin ---------- */
interface CategoryRow { id: string; name: string; slug: string; description: string | null; image_url: string | null }

function CategoriesAdmin() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Partial<CategoryRow>>({ name: "", slug: "" });

  const { data: categories } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data as CategoryRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-categories"] });
    qc.invalidateQueries({ queryKey: ["admin-categories-list"] });
    qc.invalidateQueries({ queryKey: ["categories"] });
  };

  const create = async () => {
    if (!draft.name) { toast.error("Nom requis"); return; }
    const { error } = await supabase.from("categories").insert({
      name: draft.name,
      slug: draft.slug || slugify(draft.name),
      description: draft.description || null,
      image_url: draft.image_url || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Catégorie créée"); setDraft({ name: "", slug: "" }); invalidate(); }
  };

  const update = async (id: string, patch: Partial<CategoryRow>) => {
    const { error } = await supabase.from("categories").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else invalidate();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette catégorie ?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Supprimée"); invalidate(); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-4">
        <p className="editorial-eyebrow">Nouvelle catégorie</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <input className="input" placeholder="Nom" value={draft.name ?? ""}
            onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: slugify(e.target.value) })} />
          <input className="input" placeholder="Slug" value={draft.slug ?? ""}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
          <input className="input" placeholder="URL image (optionnel)" value={draft.image_url ?? ""}
            onChange={(e) => setDraft({ ...draft, image_url: e.target.value })} />
          <button onClick={create} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Ajouter
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-3">Nom</th><th className="p-3">Slug</th><th className="p-3">Description</th><th className="p-3 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories?.map((c) => (
              <tr key={c.id}>
                <td className="p-3">
                  <input defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && update(c.id, { name: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
                </td>
                <td className="p-3">
                  <input defaultValue={c.slug} onBlur={(e) => e.target.value !== c.slug && update(c.id, { slug: e.target.value })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
                </td>
                <td className="p-3">
                  <input defaultValue={c.description ?? ""} onBlur={(e) => update(c.id, { description: e.target.value || null })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs" />
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => remove(c.id)} className="text-xs text-destructive">Suppr.</button>
                </td>
              </tr>
            ))}
            {categories?.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">Aucune catégorie.</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
