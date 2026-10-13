/**
 * Admin — clients : segments, tri, recherche, export CSV et accès à la
 * fiche détaillée de chaque client.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";
import {
  SEGMENT_HELP,
  SEGMENT_LABEL,
  emptyStats,
  inSegment,
  customersQueryKey,
  statsByCustomer,
  toCsv,
  type CustomerStats,
  type Segment,
} from "@/lib/customers";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Customer {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  created_at: string;
  is_admin: boolean;
  stats: CustomerStats;
}

type Sort = "spent" | "recent_order" | "orders" | "signup" | "name";

const SORT_LABEL: Record<Sort, string> = {
  spent: "Total dépensé",
  recent_order: "Dernière commande",
  orders: "Nombre de commandes",
  signup: "Date d'inscription",
  name: "Nom",
};

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
    : "—";

export function CustomersAdmin() {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("all");
  const [sort, setSort] = useState<Sort>("spent");

  const { data: customers = [], isLoading } = useQuery({
    queryKey: customersQueryKey,
    queryFn: async (): Promise<Customer[]> => {
      const [{ data: profiles, error: pErr }, { data: roles }, { data: orders, error: oErr }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, full_name, phone, city, address, created_at")
            .order("created_at", { ascending: false }),
          supabase.from("user_roles").select("user_id, role"),
          supabase.from("orders").select("user_id, total_amount, status, created_at").limit(10000),
        ]);
      if (pErr) throw pErr;
      if (oErr) throw oErr;
      const admins = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
      const stats = statsByCustomer(orders ?? []);
      return (profiles ?? []).map((p) => ({
        ...p,
        is_admin: admins.has(p.id),
        stats: stats.get(p.id) ?? emptyStats(),
      }));
    },
  });

  // Les comptes administrateurs ne sont pas des clients : exclus des segments.
  const clients = useMemo(() => customers.filter((c) => !c.is_admin), [customers]);

  const shown = useMemo(() => {
    const q = search
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
    const norm = (s: string | null) =>
      (s ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "");
    const digits = q.replace(/\D/g, "");
    const rows = (segment === "all" ? customers : clients).filter(
      (c) =>
        inSegment(segment, c) &&
        (!q ||
          norm(c.full_name).includes(q) ||
          norm(c.city).includes(q) ||
          (digits.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digits))),
    );
    return [...rows].sort((a, b) => {
      switch (sort) {
        case "recent_order":
          return (b.stats.lastOrderAt ?? "").localeCompare(a.stats.lastOrderAt ?? "");
        case "orders":
          return b.stats.orderCount - a.stats.orderCount;
        case "signup":
          return b.created_at.localeCompare(a.created_at);
        case "name":
          return (a.full_name ?? "").localeCompare(b.full_name ?? "", "fr");
        default:
          return b.stats.totalSpent - a.stats.totalSpent;
      }
    });
  }, [customers, clients, search, segment, sort]);

  const exportCsv = () => {
    const csv = toCsv([
      [
        "Nom",
        "Téléphone",
        "Commune",
        "Adresse",
        "Inscrit le",
        "Commandes",
        "Total dépensé (F CFA)",
        "Panier moyen (F CFA)",
        "Dernière commande",
      ],
      ...shown.map((c) => [
        c.full_name,
        c.phone,
        c.city,
        c.address,
        c.created_at.slice(0, 10),
        c.stats.orderCount,
        c.stats.totalSpent,
        c.stats.averageBasket,
        c.stats.lastOrderAt?.slice(0, 10) ?? "",
      ]),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `clients-mendykounda-${SEGMENT_LABEL[segment].toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const segments: Segment[] = ["all", "new", "loyal", "inactive", "never"];
  const totalSpent = clients.reduce((s, c) => s + c.stats.totalSpent, 0);
  const buyers = clients.filter((c) => c.stats.orderCount > 0).length;

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
        <Kpi label="Clients inscrits" value={String(clients.length)} />
        <Kpi
          label="Ont déjà commandé"
          value={`${buyers}${clients.length ? ` (${Math.round((buyers / clients.length) * 100)} %)` : ""}`}
        />
        <Kpi
          label="Dépense moyenne par client acheteur"
          value={formatPrice(buyers ? Math.round(totalSpent / buyers) : 0)}
        />
      </dl>

      <div className="flex flex-wrap gap-2">
        {segments.map((s) => {
          const count =
            s === "all" ? customers.length : clients.filter((c) => inSegment(s, c)).length;
          return (
            <button
              key={s}
              onClick={() => setSegment(s)}
              title={s === "all" ? undefined : SEGMENT_HELP[s]}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                segment === s
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:bg-secondary",
              )}
            >
              {SEGMENT_LABEL[s]} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>
      {segment !== "all" && (
        <p className="text-xs text-muted-foreground">
          {SEGMENT_LABEL[segment]} : {SEGMENT_HELP[segment]}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input w-full max-w-sm"
          placeholder="Nom, commune ou téléphone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rechercher un client"
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Trier par</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={exportCsv}
          disabled={!shown.length}
        >
          <Download className="h-4 w-4" /> Exporter ({shown.length})
        </Button>
      </div>

      {/* Mobile : une carte par client. */}
      <ul className="space-y-2 md:hidden">
        {isLoading && (
          <li className="p-6 text-center text-sm text-muted-foreground">Chargement…</li>
        )}
        {!isLoading && shown.length === 0 && (
          <li className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
            Aucun client.
          </li>
        )}
        {shown.map((c) => (
          <li key={c.id}>
            <Link
              to="/admin/customers/$customerId"
              params={{ customerId: c.id }}
              className="block rounded-lg border border-border bg-card p-3 active:bg-secondary"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {c.full_name || "Sans nom"}
                    {c.is_admin && (
                      <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                        admin
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[c.city, c.phone].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <p className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">
                    {formatPrice(c.stats.totalSpent)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {c.stats.orderCount} commande{c.stats.orderCount > 1 ? "s" : ""}
                  </span>
                </p>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Dernière commande : {fmtDate(c.stats.lastOrderAt)}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Client</th>
              <th className="p-3">Téléphone</th>
              <th className="p-3">Commandes</th>
              <th className="p-3">Total dépensé</th>
              <th className="p-3">Dernière commande</th>
              <th className="p-3">Inscrit le</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  Chargement…
                </td>
              </tr>
            )}
            {!isLoading && shown.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">
                  Aucun client.
                </td>
              </tr>
            )}
            {shown.map((c) => (
              <tr key={c.id} className="hover:bg-secondary/40">
                <td className="p-3">
                  <Link
                    to="/admin/customers/$customerId"
                    params={{ customerId: c.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    {c.full_name || "Sans nom"}
                  </Link>
                  {c.is_admin && (
                    <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                      admin
                    </span>
                  )}
                  <span className="block text-xs text-muted-foreground">{c.city || "—"}</span>
                </td>
                <td className="p-3 tabular-nums">
                  {c.phone || <span className="text-muted-foreground">—</span>}
                </td>
                <td className="p-3 tabular-nums">
                  {c.stats.orderCount}
                  {c.stats.cancelledCount > 0 && (
                    <span className="block text-[11px] text-muted-foreground">
                      + {c.stats.cancelledCount} annulée{c.stats.cancelledCount > 1 ? "s" : ""}
                    </span>
                  )}
                </td>
                <td className="p-3 tabular-nums">{formatPrice(c.stats.totalSpent)}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {fmtDate(c.stats.lastOrderAt)}
                </td>
                <td className="p-3 text-xs text-muted-foreground">{fmtDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-3 last:col-span-2 sm:p-4 sm:last:col-span-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums sm:text-xl">{value}</dd>
    </div>
  );
}
