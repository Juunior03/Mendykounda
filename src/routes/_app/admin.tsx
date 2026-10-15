/**
 * Dashboard Admin — KPIs, graphique ventes, gestion produits & commandes.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { formatPrice, plural } from "@/lib/format";
import {
  ALLOWED_TRANSITIONS,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
  PAYMENT_METHOD_LABEL,
  orderNumber,
  type OrderStatus,
} from "@/lib/orders";
import { LOW_STOCK_THRESHOLD } from "@/lib/pricing";
import { formatSlaughterDayShort } from "@/lib/slaughter";
import { MONTHS_SHORT, formatSeason, inSeason, isSeasonal } from "@/lib/season";
import {
  AdminDashboard,
  type DashboardNav,
  type OrdersFilter,
  type ProductsFilter,
} from "@/components/admin/dashboard";
import { ChatBox } from "@/components/chat-box";
import { ZonesAdmin } from "@/components/admin/zones";
import { SlaughterAdmin } from "@/components/admin/slaughter";
import { CustomersAdmin } from "@/components/admin/customers";
import { FarmAdmin } from "@/components/admin/farm";
import { LegalAdmin } from "@/components/admin/legal";
import { AlertBadge } from "@/components/alert-badge";
import { ADMIN_ALERTS_KEY, useAdminAlerts } from "@/lib/admin-alerts";
import { ImagePicker } from "@/components/admin/image-picker";
import { CancelOrderDialog, DeliverOrderDialog } from "@/components/admin/order-status-dialogs";

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Non payée",
  paid: "Payée",
  refunded: "Remboursée",
  failed: "Échec",
};

const TABS = [
  "overview",
  "products",
  "categories",
  "orders",
  "customers",
  "delivery",
  "slaughter",
  "messages",
  "farm",
  "legal",
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "Vue d'ensemble",
  products: "Produits",
  categories: "Catégories",
  orders: "Commandes",
  customers: "Clients",
  delivery: "Livraison",
  slaughter: "Abattages",
  messages: "Messages",
  farm: "Ferme",
  legal: "Pages légales",
};

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
  // ?tab=orders : retour depuis une fiche commande sur le bon onglet.
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(search.tab as Tab) ? { tab: search.tab as Tab } : {},
  head: () => ({
    meta: [
      { title: "Administration — MendyKounda" },
      { name: "description", content: "Console vendeur sécurisée de MendyKounda." },
      { property: "og:title", content: "Administration — MendyKounda" },
      { property: "og:description", content: "Gestion sécurisée de la boutique MendyKounda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AdminPage() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [tab, setTab] = useState<Tab>(search.tab ?? "overview");
  const [ordersFilter, setOrdersFilter] = useState<OrdersFilter>("all");
  const [productsFilter, setProductsFilter] = useState<ProductsFilter>("all");
  const alerts = useAdminAlerts();
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
    if (!loading && !user) void navigate({ to: "/auth", search: { redirect: "/admin" } });
  }, [loading, user, navigate]);

  if (loading)
    return (
      <div className="container-editorial py-20 text-sm text-muted-foreground">Chargement…</div>
    );

  if (!isAdmin) {
    return (
      <div className="container-editorial py-20">
        <p className="editorial-eyebrow">Accès restreint</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Réservé aux administrateurs</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Votre compte n'a pas les permissions nécessaires. Contactez un administrateur.
        </p>
        <Link to="/" className="mt-6 inline-block underline-grow text-sm">
          ← Accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="container-editorial py-6 md:py-16">
      <p className="editorial-eyebrow">Tableau de bord</p>
      <h1 className="mt-2 text-2xl font-medium tracking-tight md:mt-3 md:text-4xl">
        Administration
      </h1>

      {/* Mobile : menu déroulant (les sections ne tiennent pas en onglets). */}
      {alerts.total > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 md:hidden">
          {alerts.orders > 0 && (
            <button
              onClick={() => {
                setOrdersFilter("pending");
                setTab("orders");
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs"
            >
              <AlertBadge count={alerts.orders} label="" /> commande{alerts.orders > 1 ? "s" : ""} à
              préparer
            </button>
          )}
          {alerts.messages > 0 && (
            <button
              onClick={() => setTab("messages")}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs"
            >
              <AlertBadge count={alerts.messages} label="" /> message
              {alerts.messages > 1 ? "s" : ""} non lu{alerts.messages > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}
      <label className="mt-6 block md:hidden">
        <span className="sr-only">Section de l'administration</span>
        <select
          value={tab}
          onChange={(e) => {
            const t = e.target.value as Tab;
            if (t === "orders") setOrdersFilter(alerts.orders ? "pending" : "all");
            if (t === "products") setProductsFilter("all");
            setTab(t);
          }}
          className="w-full rounded-md border border-border bg-card px-3 py-2.5 text-base font-medium shadow-soft"
        >
          {TABS.map((t) => (
            <option key={t} value={t}>
              {TAB_LABEL[t]}
              {t === "orders" && alerts.orders ? ` · ${alerts.orders} à préparer` : ""}
              {t === "messages" && alerts.messages
                ? ` · ${alerts.messages} non lu${plural(alerts.messages)}`
                : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-8 hidden gap-1 overflow-x-auto border-b border-border md:flex">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => {
              // Un clic direct sur l'onglet repart de la liste complète
              // (ou des commandes à préparer s'il y en a de nouvelles).
              if (t === "orders") setOrdersFilter(alerts.orders ? "pending" : "all");
              if (t === "products") setProductsFilter("all");
              setTab(t);
            }}
            className={`whitespace-nowrap px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              {TAB_LABEL[t]}
              {t === "orders" && <AlertBadge count={alerts.orders} label="commandes à préparer" />}
              {t === "messages" && <AlertBadge count={alerts.messages} label="messages non lus" />}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 md:mt-8">
        {tab === "overview" && <AdminDashboard nav={nav} />}
        {tab === "products" && (
          <ProductsAdmin filter={productsFilter} onFilter={setProductsFilter} />
        )}
        {tab === "categories" && <CategoriesAdmin />}
        {tab === "orders" && <OrdersAdmin filter={ordersFilter} onFilter={setOrdersFilter} />}
        {tab === "customers" && <CustomersAdmin />}
        {tab === "delivery" && <ZonesAdmin />}
        {tab === "slaughter" && <SlaughterAdmin />}
        {tab === "farm" && <FarmAdmin />}
        {tab === "legal" && <LegalAdmin />}
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
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

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
  variant_group: string | null;
  variant_label: string | null;
  needs_slaughter: boolean;
  season_months: number[] | null;
  sold_by_weight: boolean;
}

const emptyProduct: Partial<ProductRow> = {
  name: "",
  slug: "",
  description: "",
  price: 0,
  stock: 0,
  unit: "kg",
  image_url: "",
  is_active: true,
  is_featured: false,
  category_id: null,
  discount_price: null,
  discount_label: "",
  variant_group: "",
  variant_label: "",
  needs_slaughter: false,
  season_months: null,
  sold_by_weight: false,
};

/* ---------- Products admin ---------- */
function matchesStockFilter(stock: number, f: ProductsFilter) {
  if (f === "out") return stock <= 0;
  if (f === "low") return stock > 0 && stock <= LOW_STOCK_THRESHOLD;
  return true;
}

function ProductsAdmin({
  filter,
  onFilter,
}: {
  filter: ProductsFilter;
  onFilter: (f: ProductsFilter) => void;
}) {
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
        .select(
          "id, name, slug, description, price, stock, is_active, is_featured, unit, image_url, category_id, discount_price, discount_label, variant_group, variant_label, needs_slaughter, season_months, sold_by_weight",
        )
        .order("name");
      if (error) throw error;
      return data as ProductRow[];
    },
  });

  const shownProducts = products?.filter((p) => matchesStockFilter(p.stock, filter));

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
    else {
      toast.success("Mis à jour");
      invalidateAll();
    }
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
    else {
      toast.success("Supprimé");
      invalidateAll();
    }
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
      variant_group: editing.variant_group?.trim() ? slugify(editing.variant_group) : null,
      variant_label: editing.variant_label?.trim() ? editing.variant_label.trim() : null,
      needs_slaughter: !!editing.needs_slaughter,
      sold_by_weight: !!editing.sold_by_weight,
      // Aucun mois ou les 12 cochés = toute l'année.
      season_months:
        editing.season_months?.length && editing.season_months.length < 12
          ? [...editing.season_months].sort((a, b) => a - b)
          : null,
    };
    if (!payload.name) {
      toast.error("Nom requis");
      return;
    }

    const { error } = editing.id
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    if (error) toast.error(error.message);
    else {
      toast.success(editing.id ? "Produit mis à jour" : "Produit créé");
      setEditing(null);
      invalidateAll();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          value={filter}
          onChange={onFilter}
          options={[
            { value: "all", label: "Tous", count: products?.length },
            {
              value: "low",
              label: `Stock bas (≤ ${LOW_STOCK_THRESHOLD})`,
              count: products?.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD).length,
            },
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

      {/* Mobile : une carte par produit. */}
      <ul className="space-y-2 md:hidden">
        {shownProducts?.map((p) => (
          <li key={p.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                <p className="text-sm tabular-nums">
                  {formatPrice(
                    Number(
                      p.discount_price != null && Number(p.discount_price) < Number(p.price)
                        ? p.discount_price
                        : p.price,
                    ),
                  )}
                  <span className="text-xs text-muted-foreground"> / {p.unit}</span>
                </p>
                <span className="mt-1 flex flex-wrap gap-1 text-[11px]">
                  {p.variant_label && (
                    <span className="rounded bg-secondary px-1.5 py-0.5">
                      Format : {p.variant_label}
                    </span>
                  )}
                  {p.needs_slaughter && (
                    <span className="rounded bg-accent/15 px-1.5 py-0.5">À l'abattage</span>
                  )}
                  {p.sold_by_weight && (
                    <span className="rounded bg-secondary px-1.5 py-0.5">Au poids réel</span>
                  )}
                  {isSeasonal(p) && (
                    <span
                      className={`rounded px-1.5 py-0.5 ${inSeason(p) ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
                    >
                      {inSeason(p) ? "De saison" : "Hors saison"}
                    </span>
                  )}
                </span>
              </div>
              <button
                onClick={() => setEditing(p)}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm"
              >
                Éditer
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Stock</span>
                <input
                  type="number"
                  inputMode="numeric"
                  defaultValue={p.stock}
                  onBlur={(e) => updateStock(p.id, Number(e.target.value))}
                  className={`w-20 rounded border bg-background px-2 py-1.5 ${p.stock <= 0 ? "border-destructive" : "border-border"}`}
                />
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={p.is_active}
                  onChange={(e) => toggle(p.id, "is_active", e.target.checked)}
                />{" "}
                Actif
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={p.is_featured}
                  onChange={(e) => toggle(p.id, "is_featured", e.target.checked)}
                />{" "}
                Vedette
              </label>
              <button onClick={() => remove(p.id)} className="ml-auto text-xs text-destructive">
                Supprimer
              </button>
            </div>
          </li>
        ))}
        {products?.length === 0 && (
          <li className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
            Aucun produit. Créez-en un.
          </li>
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
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
                <td className="p-3 font-medium">
                  {p.name}
                  {(p.variant_label || p.needs_slaughter || isSeasonal(p) || p.sold_by_weight) && (
                    <span className="mt-1 flex flex-wrap gap-1 text-[11px] font-normal">
                      {p.variant_label && (
                        <span className="rounded bg-secondary px-1.5 py-0.5">
                          Format : {p.variant_label}
                        </span>
                      )}
                      {p.needs_slaughter && (
                        <span className="rounded bg-accent/15 px-1.5 py-0.5">À l'abattage</span>
                      )}
                      {p.sold_by_weight && (
                        <span className="rounded bg-secondary px-1.5 py-0.5">Au poids réel</span>
                      )}
                      {isSeasonal(p) && (
                        <span
                          className={`rounded px-1.5 py-0.5 ${inSeason(p) ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
                        >
                          {inSeason(p) ? "De saison" : "Hors saison"} :{" "}
                          {formatSeason(p.season_months)}
                        </span>
                      )}
                    </span>
                  )}
                </td>
                <td className="p-3 tabular-nums">
                  {p.discount_price != null && Number(p.discount_price) < Number(p.price) ? (
                    <>
                      <span className="text-destructive">
                        {formatPrice(Number(p.discount_price))}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground line-through">
                        {formatPrice(Number(p.price))}
                      </span>
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
                <td className="p-3 text-right space-x-2">
                  <button onClick={() => setEditing(p)} className="text-xs underline-grow">
                    Éditer
                  </button>
                  <button onClick={() => remove(p.id)} className="text-xs text-destructive">
                    Suppr.
                  </button>
                </td>
              </tr>
            ))}
            {products?.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  Aucun produit. Créez-en un.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium">
              {editing.id ? "Éditer le produit" : "Nouveau produit"}
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Nom">
                <input
                  className="input"
                  value={editing.name ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      name: e.target.value,
                      slug: editing.id ? editing.slug : slugify(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Slug">
                <input
                  className="input"
                  value={editing.slug ?? ""}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                />
              </Field>
              <Field label="Prix (FCFA)">
                <input
                  type="number"
                  step="1"
                  className="input"
                  value={editing.price ?? 0}
                  onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })}
                />
              </Field>
              <Field label="Stock">
                <input
                  type="number"
                  className="input"
                  value={editing.stock ?? 0}
                  onChange={(e) => setEditing({ ...editing, stock: Number(e.target.value) })}
                />
              </Field>
              <Field label="Unité">
                <input
                  className="input"
                  value={editing.unit ?? ""}
                  onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                  placeholder="kg, pièce…"
                />
              </Field>
              <Field label="Catégorie">
                <select
                  className="input"
                  value={editing.category_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, category_id: e.target.value || null })}
                >
                  <option value="">— Aucune —</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Prix promo (FCFA, optionnel)">
                <input
                  type="number"
                  step="1"
                  className="input"
                  value={editing.discount_price ?? ""}
                  placeholder="Laisser vide si pas de promo"
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      discount_price: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Étiquette promo">
                <input
                  className="input"
                  value={editing.discount_label ?? ""}
                  placeholder="Promo, Bon plan, -20%…"
                  onChange={(e) => setEditing({ ...editing, discount_label: e.target.value })}
                />
              </Field>
              <div className="rounded-md border border-border p-3 sm:col-span-2">
                <p className="text-xs font-medium">Formats (facultatif)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Donnez le même groupe à plusieurs produits pour les proposer sur une seule fiche,
                  par exemple groupe « poulet » : « Vivant » et « Au kg, déplumé, vidé, emballé ».
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Field label="Groupe">
                    <input
                      className="input"
                      list="variant-groups"
                      value={editing.variant_group ?? ""}
                      placeholder="poulet, cochon-de-lait…"
                      onChange={(e) => setEditing({ ...editing, variant_group: e.target.value })}
                    />
                    <datalist id="variant-groups">
                      {[
                        ...new Set((products ?? []).map((p) => p.variant_group).filter(Boolean)),
                      ].map((g) => (
                        <option key={g} value={g!} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Nom du format">
                    <input
                      className="input"
                      value={editing.variant_label ?? ""}
                      placeholder="Sur pied, Vivant, En viande, Au kg…"
                      onChange={(e) => setEditing({ ...editing, variant_label: e.target.value })}
                    />
                  </Field>
                </div>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!!editing.sold_by_weight}
                    onChange={(e) => setEditing({ ...editing, sold_by_weight: e.target.checked })}
                  />
                  <span>
                    Vendu au poids réel
                    <span className="block text-xs text-muted-foreground">
                      Prix au kilo : le client commande une quantité estimée, vous saisissez le
                      poids pesé dans la fiche commande et le montant est recalculé.
                    </span>
                  </span>
                </label>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!!editing.needs_slaughter}
                    onChange={(e) => setEditing({ ...editing, needs_slaughter: e.target.checked })}
                  />
                  <span>
                    Viande à l'abattage
                    <span className="block text-xs text-muted-foreground">
                      Commandable seulement s'il y a un abattage programmé (onglet Abattages),
                      livrée à partir de ce jour.
                    </span>
                  </span>
                </label>
              </div>
              <div className="rounded-md border border-border p-3 sm:col-span-2">
                <p className="text-xs font-medium">Saison (facultatif)</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Cochez les mois où le produit est disponible. Hors saison, il reste visible mais
                  ne peut pas être commandé. Aucun mois coché = toute l'année.
                </p>
                <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                  {MONTHS_SHORT.map((label, i) => {
                    const m = i + 1;
                    const on = !!editing.season_months?.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          const cur = editing.season_months ?? [];
                          setEditing({
                            ...editing,
                            season_months: on ? cur.filter((x) => x !== m) : [...cur, m],
                          });
                        }}
                        className={`rounded-md border px-2 py-1.5 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Disponible : {formatSeason(editing.season_months)}
                </p>
              </div>
              <Field label="Image" className="sm:col-span-2">
                <ImagePicker
                  value={editing.image_url ?? ""}
                  onChange={(url) => setEditing({ ...editing, image_url: url })}
                />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <textarea
                  className="input min-h-[100px]"
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!editing.is_active}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
                />{" "}
                Actif (visible)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!editing.is_featured}
                  onChange={(e) => setEditing({ ...editing, is_featured: e.target.checked })}
                />{" "}
                Mis en avant
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-md border border-border px-4 py-2 text-sm"
              >
                Annuler
              </button>
              <button
                onClick={save}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-xs ${className}`}>
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/* ---------- Categories admin ---------- */
interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
}

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
    if (!draft.name) {
      toast.error("Nom requis");
      return;
    }
    const { error } = await supabase.from("categories").insert({
      name: draft.name,
      slug: draft.slug || slugify(draft.name),
      description: draft.description || null,
      image_url: draft.image_url || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Catégorie créée");
      setDraft({ name: "", slug: "" });
      invalidate();
    }
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
    else {
      toast.success("Supprimée");
      invalidate();
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-4">
        <p className="editorial-eyebrow">Nouvelle catégorie</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <input
            className="input"
            placeholder="Nom"
            value={draft.name ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, name: e.target.value, slug: slugify(e.target.value) })
            }
          />
          <input
            className="input"
            placeholder="Slug"
            value={draft.slug ?? ""}
            onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
          />
          <input
            className="input"
            placeholder="URL image (optionnel)"
            value={draft.image_url ?? ""}
            onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
          />
          <button
            onClick={create}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Ajouter
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Nom</th>
              <th className="p-3">Slug</th>
              <th className="p-3">Description</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories?.map((c) => (
              <tr key={c.id}>
                <td className="p-3">
                  <input
                    defaultValue={c.name}
                    onBlur={(e) =>
                      e.target.value !== c.name && update(c.id, { name: e.target.value })
                    }
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-3">
                  <input
                    defaultValue={c.slug}
                    onBlur={(e) =>
                      e.target.value !== c.slug && update(c.id, { slug: e.target.value })
                    }
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-3">
                  <input
                    defaultValue={c.description ?? ""}
                    onBlur={(e) => update(c.id, { description: e.target.value || null })}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
                  />
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => remove(c.id)} className="text-xs text-destructive">
                    Suppr.
                  </button>
                </td>
              </tr>
            ))}
            {categories?.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">
                  Aucune catégorie.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function matchesOrdersFilter(
  o: { status: string; payment_status: string; payment_method: string },
  f: OrdersFilter,
) {
  switch (f) {
    case "all":
      return true;
    case "refund_due":
      return o.status === "cancelled" && o.payment_status === "paid";
    case "wave_unpaid":
      return o.payment_method === "wave" && o.payment_status !== "paid" && o.status !== "cancelled";
    default:
      return o.status === f;
  }
}

/* ---------- Orders admin ---------- */
function OrdersAdmin({
  filter,
  onFilter,
}: {
  filter: OrdersFilter;
  onFilter: (f: OrdersFilter) => void;
}) {
  const qc = useQueryClient();
  const { data: orders } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, created_at, total_amount, status, payment_status, payment_method, shipping_full_name, shipping_city, confirmation_email_sent_at, confirmation_sms_sent_at, slaughter_date",
        )
        .order("created_at", { ascending: false })
        // Assez large pour que les compteurs des filtres correspondent au tableau de bord.
        .limit(2000);
      if (error) throw error;
      return data;
    },
  });

  // Demande en attente de confirmation (annulation ou livraison).
  const [pending, setPending] = useState<{ id: string; to: "cancelled" | "delivered" } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const pendingOrder = orders?.find((o) => o.id === pending?.id);

  const saveStatus = async (id: string, values: TablesUpdate<"orders">) => {
    setBusy(true);
    const { error } = await supabase.from("orders").update(values).eq("id", id);
    setBusy(false);
    setPending(null);
    if (error) toast.error(error.message);
    else toast.success("Statut mis à jour");
    void qc.invalidateQueries({ queryKey: ["admin-orders"] });
    void qc.invalidateQueries({ queryKey: ADMIN_ALERTS_KEY });
    void qc.invalidateQueries({ queryKey: ["admin-products"] });
    void qc.invalidateQueries({ queryKey: ["products"] });
  };

  const updateStatus = (id: string, status: OrderStatus) => {
    // Annuler (motif) et livrer (encaissement) passent par une confirmation.
    if (status === "cancelled" || status === "delivered") setPending({ id, to: status });
    else void saveStatus(id, { status });
  };
  const matches = matchesOrdersFilter;
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
          chip("ready", "Prêtes"),
          chip("shipped", "En livraison"),
          chip("delivered", "Livrées"),
          chip("cancelled", "Annulées"),
          chip("wave_unpaid", "Wave en attente"),
          chip("refund_due", "À rembourser"),
        ]}
      />
      {/* Mobile : une carte par commande, qui ouvre la fiche. */}
      <ul className="space-y-2 md:hidden">
        {shownOrders?.map((o) => (
          <li key={o.id}>
            <Link
              to="/admin/orders/$orderId"
              params={{ orderId: o.id }}
              className="block rounded-lg border border-border bg-card p-3 active:bg-secondary"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{o.shipping_full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">#{orderNumber(o.id)}</span> ·{" "}
                    {new Date(o.created_at).toLocaleDateString("fr-FR", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    · {o.shipping_city}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {formatPrice(Number(o.total_amount))}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span
                  className={`rounded px-2 py-0.5 ${ORDER_STATUS_TONE[o.status as OrderStatus]}`}
                >
                  {ORDER_STATUS_LABEL[o.status as OrderStatus]}
                </span>
                <span
                  className={`rounded px-2 py-0.5 ${o.payment_status === "paid" ? "bg-primary/10 text-primary" : "bg-secondary"}`}
                >
                  {PAYMENT_STATUS_LABEL[o.payment_status] ?? o.payment_status}
                </span>
                {o.slaughter_date && (
                  <span className="rounded bg-secondary px-2 py-0.5">
                    Abattage {formatSlaughterDayShort(o.slaughter_date)}
                  </span>
                )}
                <span className="ml-auto text-primary">Ouvrir →</span>
              </div>
            </Link>
          </li>
        ))}
        {shownOrders?.length === 0 && (
          <li className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
            Aucune commande pour le moment.
          </li>
        )}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
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
                  <Link
                    to="/admin/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="font-medium hover:underline"
                  >
                    {o.shipping_full_name}
                  </Link>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {/* Confirmations envoyées au client */}
                    E-mail {o.confirmation_email_sent_at ? "✓" : "—"} · SMS{" "}
                    {o.confirmation_sms_sent_at ? "✓" : "—"}
                  </span>
                </td>
                <td className="p-3">
                  {o.shipping_city}
                  {o.slaughter_date && (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Abattage {formatSlaughterDayShort(o.slaughter_date)}
                    </span>
                  )}
                </td>
                <td className="p-3 tabular-nums">{formatPrice(Number(o.total_amount))}</td>
                <td className="p-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${o.payment_status === "paid" ? "bg-primary/10 text-primary" : "bg-secondary"}`}
                  >
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
                    {/* Seuls les passages autorisés depuis le statut actuel sont proposés. */}
                    {[o.status as OrderStatus, ...ALLOWED_TRANSITIONS[o.status as OrderStatus]].map(
                      (s) => (
                        <option key={s} value={s}>
                          {s === o.status ? ORDER_STATUS_LABEL[s] : `→ ${ORDER_STATUS_LABEL[s]}`}
                        </option>
                      ),
                    )}
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
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  Aucune commande pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <CancelOrderDialog
        open={pending?.to === "cancelled"}
        onOpenChange={(open) => !open && setPending(null)}
        paid={pendingOrder?.payment_status === "paid"}
        busy={busy}
        onConfirm={(reason) =>
          pending &&
          void saveStatus(pending.id, {
            status: "cancelled",
            cancel_reason: reason,
            cancelled_by: "farm",
          })
        }
      />
      <DeliverOrderDialog
        open={pending?.to === "delivered"}
        onOpenChange={(open) => !open && setPending(null)}
        amount={Number(pendingOrder?.total_amount ?? 0)}
        toCollect={
          pendingOrder?.payment_status !== "paid" &&
          pendingOrder?.payment_method === "cash_on_delivery"
        }
        busy={busy}
        onConfirm={(collected) =>
          pending &&
          void saveStatus(pending.id, {
            status: "delivered",
            ...(collected ? { payment_status: "paid", paid_at: new Date().toISOString() } : {}),
          })
        }
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
          map.set(m.user_id, {
            user_id: m.user_id,
            last: m.content,
            at: m.created_at,
            unread: isUnread ? 1 : 0,
          });
        } else if (isUnread) {
          cur.unread += 1;
        }
      }
      const list = Array.from(map.values()).sort((a, b) => b.at.localeCompare(a.at));
      const ids = list.map((t) => t.user_id);
      if (ids.length === 0) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return list.map((t) => ({ ...t, name: nameMap.get(t.user_id) || t.user_id.slice(0, 8) }));
    },
  });

  // realtime refresh thread list
  useEffect(() => {
    const channel = supabase
      .channel("admin-threads")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-message-threads"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
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
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["admin-message-threads"] });
        void qc.invalidateQueries({ queryKey: ADMIN_ALERTS_KEY });
      });
  }, [selected, qc]);

  const deleteThread = async (userId: string) => {
    if (!confirm("Supprimer toute cette conversation ? Cette action est irréversible.")) return;
    const { error } = await supabase.from("messages").delete().eq("user_id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conversation supprimée");
    if (selected === userId) setSelected(null);
    qc.invalidateQueries({ queryKey: ["admin-message-threads"] });
    qc.invalidateQueries({ queryKey: ["messages", userId] });
  };

  return (
    <div className="grid gap-6 md:grid-cols-[280px_1fr]">
      <div className="rounded-lg border border-border">
        <p className="border-b border-border p-3 text-xs uppercase tracking-wider text-muted-foreground">
          Conversations
        </p>
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
                  {new Date(t.at).toLocaleString("fr-FR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
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
