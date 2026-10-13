/**
 * Dashboard Admin — KPIs, graphique ventes, gestion produits & commandes.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crop } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL, orderNumber, type OrderStatus } from "@/lib/orders";
import { LOW_STOCK_THRESHOLD } from "@/lib/pricing";
import {
  AdminDashboard,
  type DashboardNav,
  type OrdersFilter,
  type ProductsFilter,
} from "@/components/admin/dashboard";
import { ChatBox } from "@/components/chat-box";
import { ZonesAdmin } from "@/components/admin/zones";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { Button } from "@/components/ui/button";

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Non payée",
  paid: "Payée",
  refunded: "Remboursée",
  failed: "Échec",
};

const TABS = ["overview", "products", "categories", "orders", "customers", "delivery", "messages"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
  // ?tab=orders : retour depuis une fiche commande sur le bon onglet.
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) ? { tab: search.tab as Tab } : {},
  head: () => ({ meta: [
    { title: "Administration — MendyKounda" },
    { name: "description", content: "Console vendeur sécurisée de MendyKounda." },
    { property: "og:title", content: "Administration — MendyKounda" },
    { property: "og:description", content: "Gestion sécurisée de la boutique MendyKounda." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});


function AdminPage() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "overview");
  const [ordersFilter, setOrdersFilter] = useState<OrdersFilter>("all");
  const [productsFilter, setProductsFilter] = useState<ProductsFilter>("all");
  const nav: DashboardNav = {
    orders: (f) => {
      setOrdersFilter(f);
      setTab("orders");
    },
    products: (f) => {
      setProductsFilter(f);
      setTab("products");
    },
    messages: () => setTab("messages"),
  };

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
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => {
              // Un clic direct sur l'onglet repart de la liste complète.
              if (t === "orders") setOrdersFilter("all");
              if (t === "products") setProductsFilter("all");
              setTab(t);
            }}
            className={`whitespace-nowrap px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "overview" ? "Vue d'ensemble" : t === "products" ? "Produits" : t === "categories" ? "Catégories" : t === "orders" ? "Commandes" : t === "customers" ? "Clients" : t === "delivery" ? "Livraison" : "Messages"}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "overview" && <AdminDashboard nav={nav} />}
        {tab === "products" && <ProductsAdmin filter={productsFilter} onFilter={setProductsFilter} />}
        {tab === "categories" && <CategoriesAdmin />}
        {tab === "orders" && <OrdersAdmin filter={ordersFilter} onFilter={setOrdersFilter} />}
        {tab === "customers" && <CustomersAdmin />}
        {tab === "delivery" && <ZonesAdmin />}
        {tab === "messages" && <MessagesAdmin />}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function FilterChips<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Filtrer">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            value === o.value
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
          {o.count != null && <span className="ml-1.5 tabular-nums opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

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
  discount_price: number | null;
  discount_label: string | null;
}

const emptyProduct: Partial<ProductRow> = {
  name: "", slug: "", description: "", price: 0, stock: 0, unit: "kg",
  image_url: "", is_active: true, is_featured: false, category_id: null,
  discount_price: null, discount_label: "",
};

/* ---------- Products admin ---------- */
function ProductsAdmin({ filter, onFilter }: { filter: ProductsFilter; onFilter: (f: ProductsFilter) => void }) {
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
        .select("id, name, slug, description, price, stock, is_active, is_featured, unit, image_url, category_id, discount_price, discount_label")
        .order("name");
      if (error) throw error;
      return data as ProductRow[];
    },
  });

  const shownProducts = products?.filter((p) =>
    filter === "out" ? p.stock <= 0 : filter === "low" ? p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD : true,
  );

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
      discount_price:
        editing.discount_price != null && Number(editing.discount_price) > 0
          ? Number(editing.discount_price)
          : null,
      discount_label: editing.discount_label?.trim() ? editing.discount_label.trim() : null,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          value={filter}
          onChange={onFilter}
          options={[
            { value: "all", label: "Tous", count: products?.length },
            { value: "low", label: `Stock bas (≤ ${LOW_STOCK_THRESHOLD})`, count: products?.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD).length },
            { value: "out", label: "Épuisés", count: products?.filter((p) => p.stock <= 0).length },
          ]}
        />
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
            {shownProducts?.map((p) => (
              <tr key={p.id} className="hover:bg-secondary/40">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 tabular-nums">
                  {p.discount_price != null && Number(p.discount_price) < Number(p.price) ? (
                    <>
                      <span className="text-destructive">{formatPrice(Number(p.discount_price))}</span>
                      <span className="ml-1 text-xs text-muted-foreground line-through">{formatPrice(Number(p.price))}</span>
                    </>
                  ) : (
                    formatPrice(Number(p.price))
                  )}
                  <span className="text-xs text-muted-foreground"> / {p.unit}</span>
                </td>
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
              <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">Aucun produit. Créez-en un.</td></tr>
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
              <Field label="Prix (FCFA)">
                <input type="number" step="1" className="input" value={editing.price ?? 0}
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
              <Field label="Prix promo (FCFA, optionnel)">
                <input type="number" step="1" className="input" value={editing.discount_price ?? ""}
                  placeholder="Laisser vide si pas de promo"
                  onChange={(e) => setEditing({ ...editing, discount_price: e.target.value === "" ? null : Number(e.target.value) })} />
              </Field>
              <Field label="Étiquette promo">
                <input className="input" value={editing.discount_label ?? ""}
                  placeholder="Promo, Bon plan, -20%…"
                  onChange={(e) => setEditing({ ...editing, discount_label: e.target.value })} />
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
function OrdersAdmin({ filter, onFilter }: { filter: OrdersFilter; onFilter: (f: OrdersFilter) => void }) {
  const qc = useQueryClient();
  const { data: orders } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, created_at, total_amount, status, payment_status, payment_method, shipping_full_name, shipping_city, confirmation_email_sent_at, confirmation_sms_sent_at")
        .order("created_at", { ascending: false })
        // Assez large pour que les compteurs des filtres correspondent au tableau de bord.
        .limit(2000);
      if (error) throw error;
      return data;
    },
  });

  const statuses: OrderStatus[] = ["pending", "processing", "shipped", "delivered", "cancelled"];

  const updateStatus = async (id: string, status: OrderStatus) => {
    // Annuler remet les articles en stock ; réactiver une commande annulée les reprend.
    if (status === "cancelled" && !window.confirm("Annuler cette commande ? Les articles seront remis en stock.")) {
      return;
    }
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Statut mis à jour");
      void qc.invalidateQueries({ queryKey: ["admin-orders"] });
      void qc.invalidateQueries({ queryKey: ["admin-products"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    }
  };

  const matches = (o: NonNullable<typeof orders>[number], f: OrdersFilter) =>
    f === "all"
      ? true
      : f === "wave_unpaid"
        ? o.payment_method === "wave" && o.payment_status !== "paid" && o.status !== "cancelled"
        : o.status === f;
  const shownOrders = orders?.filter((o) => matches(o, filter));
  const chip = (value: OrdersFilter, label: string) => ({
    value,
    label,
    count: orders?.filter((o) => matches(o, value)).length,
  });

  return (
    <div className="space-y-4">
    <FilterChips
      value={filter}
      onChange={onFilter}
      options={[
        chip("all", "Toutes"),
        chip("pending", "À préparer"),
        chip("processing", "En préparation"),
        chip("shipped", "Expédiées"),
        chip("delivered", "Livrées"),
        chip("cancelled", "Annulées"),
        chip("wave_unpaid", "Wave en attente"),
      ]}
    />
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
            <th className="p-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shownOrders?.map((o) => (
            <tr key={o.id} className="hover:bg-secondary/40">
              <td className="p-3 text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleDateString("fr-FR")}
                <Link
                  to="/admin/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="block font-mono font-medium text-primary hover:underline"
                >
                  #{orderNumber(o.id)}
                </Link>
              </td>
              <td className="p-3">
                <Link to="/admin/orders/$orderId" params={{ orderId: o.id }} className="font-medium hover:underline">
                  {o.shipping_full_name}
                </Link>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {/* Confirmations envoyées au client */}
                  E-mail {o.confirmation_email_sent_at ? "✓" : "—"} · SMS {o.confirmation_sms_sent_at ? "✓" : "—"}
                </span>
              </td>
              <td className="p-3">{o.shipping_city}</td>
              <td className="p-3 tabular-nums">{formatPrice(Number(o.total_amount))}</td>
              <td className="p-3">
                <span className={`rounded px-2 py-0.5 text-xs ${o.payment_status === "paid" ? "bg-primary/10 text-primary" : "bg-secondary"}`}>
                  {PAYMENT_STATUS_LABEL[o.payment_status] ?? o.payment_status}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {PAYMENT_METHOD_LABEL[o.payment_method] ?? o.payment_method}
                </span>
              </td>
              <td className="p-3">
                <select
                  value={o.status}
                  onChange={(e) => updateStatus(o.id, e.target.value as OrderStatus)}
                  className="rounded border border-border bg-background px-2 py-1 text-xs"
                >
                  {statuses.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
                </select>
              </td>
              <td className="p-3 text-right">
                <Link
                  to="/admin/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
                >
                  Ouvrir la fiche →
                </Link>
              </td>
            </tr>
          ))}
          {shownOrders?.length === 0 && (
            <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">Aucune commande pour le moment.</td></tr>
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}

/* ---------- Customers admin ---------- */
interface CustomerRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  created_at: string;
  is_admin: boolean;
  order_count: number;
  total_spent: number;
}

function CustomersAdmin() {
  const [search, setSearch] = useState("");

  const { data: customers, isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async (): Promise<CustomerRow[]> => {
      const [{ data: profiles, error: pErr }, { data: roles }, { data: orders }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone, city, created_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("orders").select("user_id, total_amount"),
      ]);
      if (pErr) throw pErr;
      const adminSet = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
      const orderMap = new Map<string, { count: number; total: number }>();
      for (const o of orders ?? []) {
        const cur = orderMap.get(o.user_id) ?? { count: 0, total: 0 };
        cur.count += 1;
        cur.total += Number(o.total_amount);
        orderMap.set(o.user_id, cur);
      }
      return (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        phone: p.phone,
        city: p.city,
        created_at: p.created_at,
        is_admin: adminSet.has(p.id),
        order_count: orderMap.get(p.id)?.count ?? 0,
        total_spent: orderMap.get(p.id)?.total ?? 0,
      }));
    },
  });

  const filtered = useMemo(() => {
    if (!customers) return [];
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      (c.full_name ?? "").toLowerCase().includes(q) ||
      (c.city ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q),
    );
  }, [customers, search]);

  return (
    <div className="space-y-4">
      <input
        className="input w-full max-w-sm"
        placeholder="Rechercher un client…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Nom</th>
              <th className="p-3">Téléphone</th>
              <th className="p-3">Ville</th>
              <th className="p-3">Inscrit le</th>
              <th className="p-3">Commandes</th>
              <th className="p-3">Total dépensé</th>
              <th className="p-3">Rôle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">Chargement…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">Aucun client.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-secondary/40">
                <td className="p-3 font-medium">{c.full_name || <span className="text-muted-foreground">—</span>}</td>
                <td className="p-3">{c.phone || <span className="text-muted-foreground">—</span>}</td>
                <td className="p-3">{c.city || <span className="text-muted-foreground">—</span>}</td>
                <td className="p-3 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("fr-FR")}</td>
                <td className="p-3 tabular-nums">{c.order_count}</td>
                <td className="p-3 tabular-nums">{formatPrice(c.total_spent)}</td>
                <td className="p-3">
                  {c.is_admin ? (
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">admin</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">client</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function ImagePicker({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const [mode, setMode] = useState<"url" | "upload">(value && !value.includes("/storage/v1/") ? "url" : "upload");
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ fileName: string; url: string; local: boolean } | null>(null);

  useEffect(() => {
    return () => {
      if (selectedImage?.local) URL.revokeObjectURL(selectedImage.url);
    };
  }, [selectedImage]);

  const handleFile = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    onChange(data.publicUrl);
    toast.success("Image téléversée");
  };

  const chooseFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez un fichier image.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error("L’image ne doit pas dépasser 12 Mo.");
      return;
    }
    setSelectedImage({ fileName: file.name, url: URL.createObjectURL(file), local: true });
  };

  const editExistingImage = () => {
    if (!value) return;
    const fileName = value.split("/").pop()?.split("?")[0] || "produit.jpg";
    setSelectedImage({ fileName, url: value, local: false });
  };

  const cancelCrop = () => setSelectedImage(null);

  const confirmCrop = (file: File) => {
    setSelectedImage(null);
    void handleFile(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <button type="button" onClick={() => setMode("url")}
          className={`rounded px-2 py-1 ${mode === "url" ? "bg-primary text-primary-foreground" : "border border-border"}`}>
          URL
        </button>
        <button type="button" onClick={() => setMode("upload")}
          className={`rounded px-2 py-1 ${mode === "upload" ? "bg-primary text-primary-foreground" : "border border-border"}`}>
          Téléverser
        </button>
      </div>
      {mode === "url" ? (
        <input className="input" value={value} placeholder="https://…"
          onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) chooseFile(file);
            e.target.value = "";
          }}
          className="block w-full text-xs"
        />
      )}
      {mode === "upload" && (
        <p className="text-[11px] text-muted-foreground">
          L’image sera conservée entière et centrée. Vous pourrez zoomer si nécessaire.
        </p>
      )}
      {value && (
        <div className="mt-2 flex items-end gap-3">
          <img src={value} alt="Aperçu du produit" className="aspect-[4/5] h-28 rounded border border-border bg-warm object-contain" />
          <Button type="button" size="sm" variant="outline" onClick={editExistingImage} disabled={uploading}>
            <Crop />Modifier le cadrage
          </Button>
        </div>
      )}
      <ImageCropDialog
        imageUrl={selectedImage?.url ?? null}
        fileName={selectedImage?.fileName ?? "produit.jpg"}
        open={selectedImage !== null}
        onCancel={cancelCrop}
        onConfirm={confirmCrop}
      />
    </div>
  );
}

/* ---------- Messages admin ---------- */
function MessagesAdmin() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: threads } = useQuery({
    queryKey: ["admin-message-threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("user_id, content, created_at, is_from_admin, read_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // group by user_id, keep latest + count unread (from client, not yet read)
      const map = new Map<string, { user_id: string; last: string; at: string; unread: number }>();
      for (const m of data ?? []) {
        const cur = map.get(m.user_id);
        const isUnread = !m.is_from_admin && !m.read_at;
        if (!cur) {
          map.set(m.user_id, { user_id: m.user_id, last: m.content, at: m.created_at, unread: isUnread ? 1 : 0 });
        } else if (isUnread) {
          cur.unread += 1;
        }
      }
      const list = Array.from(map.values()).sort((a, b) => b.at.localeCompare(a.at));
      const ids = list.map((t) => t.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return list.map((t) => ({ ...t, name: nameMap.get(t.user_id) || t.user_id.slice(0, 8) }));
    },
  });

  // realtime refresh thread list
  useEffect(() => {
    const channel = supabase
      .channel("admin-threads")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" },
        () => qc.invalidateQueries({ queryKey: ["admin-message-threads"] }))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);

  // Mark messages as read when opening a thread
  useEffect(() => {
    if (!selected) return;
    void supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", selected)
      .eq("is_from_admin", false)
      .is("read_at", null)
      .then(() => qc.invalidateQueries({ queryKey: ["admin-message-threads"] }));
  }, [selected, qc]);

  const deleteThread = async (userId: string) => {
    if (!confirm("Supprimer toute cette conversation ? Cette action est irréversible.")) return;
    const { error } = await supabase.from("messages").delete().eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("Conversation supprimée");
    if (selected === userId) setSelected(null);
    qc.invalidateQueries({ queryKey: ["admin-message-threads"] });
    qc.invalidateQueries({ queryKey: ["messages", userId] });
  };

  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <div className="rounded-lg border border-border">
        <p className="border-b border-border p-3 text-xs uppercase tracking-wider text-muted-foreground">Conversations</p>
        <ul className="max-h-[500px] overflow-y-auto">
          {threads?.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">Aucune conversation.</li>
          )}
          {threads?.map((t) => (
            <li key={t.user_id} className="group relative border-b border-border">
              <button
                onClick={() => setSelected(t.user_id)}
                className={`w-full p-3 pr-10 text-left hover:bg-secondary/40 ${
                  selected === t.user_id ? "bg-secondary/60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  {t.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                      {t.unread}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{t.last}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {new Date(t.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </button>
              <button
                onClick={() => void deleteThread(t.user_id)}
                aria-label="Supprimer la conversation"
                className="absolute right-2 top-2 rounded p-1 text-xs text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/10"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        {selected ? (
          <ChatBox userId={selected} asAdmin />
        ) : (
          <div className="flex h-[500px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            Sélectionnez une conversation
          </div>
        )}
      </div>
    </div>
  );
}
