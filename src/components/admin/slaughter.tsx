/**
 * Admin — jours d'abattage : programmation des dates (avec heure limite de
 * commande) et, pour chaque date, la viande déjà commandée à préparer.
 * Heure de Dakar = UTC : les heures saisies sont enregistrées telles quelles en UTC.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  defaultDeadline,
  formatDeadline,
  formatSlaughterDay,
  type SlaughterDay,
} from "@/lib/slaughter";
import { orderNumber } from "@/lib/orders";
import { Button } from "@/components/ui/button";

const today = () => new Date().toISOString().slice(0, 10);
const toLocalInput = (iso: string) => iso.slice(0, 16);
const fromLocalInput = (v: string) => new Date(`${v}:00Z`).toISOString();

interface SlaughterOrder {
  id: string;
  slaughter_date: string | null;
  shipping_full_name: string;
  order_items: {
    product_name: string;
    quantity: number;
    products: { needs_slaughter: boolean; unit: string } | null;
  }[];
}

export function SlaughterAdmin() {
  const qc = useQueryClient();
  const since = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 14);
    return d.toISOString().slice(0, 10);
  }, []);

  const { data: days = [], isLoading } = useQuery({
    queryKey: ["slaughter-days", "admin", since],
    queryFn: async (): Promise<SlaughterDay[]> => {
      const { data, error } = await supabase
        .from("slaughter_days")
        .select("*")
        .gte("day", since)
        .order("day");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["slaughter-orders", since],
    queryFn: async (): Promise<SlaughterOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, slaughter_date, shipping_full_name, order_items(product_name, quantity, products(needs_slaughter, unit))",
        )
        .gte("slaughter_date", since)
        .neq("status", "cancelled");
      if (error) throw error;
      return (data ?? []) as unknown as SlaughterOrder[];
    },
  });

  const [day, setDay] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["slaughter-days"] });

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!day || !deadline) return;
    const deadlineIso = fromLocalInput(deadline);
    if (deadlineIso > `${day}T23:59:59.999Z`) {
      toast.error("L'heure limite doit être au plus tard le jour de l'abattage.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("slaughter_days")
      .insert({ day, order_deadline: deadlineIso, note: note.trim() || null });
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Cette date est déjà programmée." : error.message);
      return;
    }
    toast.success(`Abattage programmé le ${formatSlaughterDay(day)}`);
    setDay("");
    setDeadline("");
    setNote("");
    refresh();
  };

  const remove = async (d: SlaughterDay, orderCount: number) => {
    const warning = orderCount
      ? `${orderCount} commande(s) sont rattachées à cet abattage et resteront prévues ce jour-là. Supprimer quand même ?`
      : `Supprimer l'abattage du ${formatSlaughterDay(d.day)} ?`;
    if (!window.confirm(warning)) return;
    const { error } = await supabase.from("slaughter_days").delete().eq("id", d.id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const upcoming = days.filter((d) => d.day >= today());
  const past = days.filter((d) => d.day < today()).reverse();

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        La viande marquée « à l'abattage » n'est commandable que s'il y a un abattage programmé dont
        l'heure limite n'est pas passée. Chaque commande est rattachée au prochain abattage et
        livrée à partir de ce jour.
      </p>

      <form
        onSubmit={add}
        className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:items-end"
      >
        <label className="block text-xs">
          <span className="text-muted-foreground">Jour d'abattage</span>
          <input
            type="date"
            required
            min={today()}
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              if (e.target.value) setDeadline(toLocalInput(defaultDeadline(e.target.value)));
            }}
            className="input mt-1"
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Commandes jusqu'au (heure de Dakar)</span>
          <input
            type="datetime-local"
            required
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="input mt-1"
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Note affichée aux clients (facultatif)</span>
          <input
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Porc adulte et cochons de lait"
            className="input mt-1"
          />
        </label>
        <Button type="submit" disabled={busy || !day || !deadline}>
          Programmer
        </Button>
      </form>

      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {!isLoading && upcoming.length === 0 && (
        <p className="rounded-lg bg-accent/15 p-4 text-sm">
          Aucun abattage à venir : la viande à l'abattage est affichée « Bientôt disponible » et ne
          peut pas être commandée.
        </p>
      )}

      <div className="space-y-4">
        {upcoming.map((d) => (
          <SlaughterCard
            key={d.id}
            day={d}
            orders={orders.filter((o) => o.slaughter_date === d.day)}
            onRemove={remove}
          />
        ))}
      </div>

      {past.length > 0 && (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Abattages passés (14 derniers jours)
          </summary>
          <div className="mt-4 space-y-4">
            {past.map((d) => (
              <SlaughterCard
                key={d.id}
                day={d}
                orders={orders.filter((o) => o.slaughter_date === d.day)}
                onRemove={remove}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function SlaughterCard({
  day: d,
  orders,
  onRemove,
}: {
  day: SlaughterDay;
  orders: SlaughterOrder[];
  onRemove: (d: SlaughterDay, orderCount: number) => void;
}) {
  // Quantités de viande à l'abattage commandées pour ce jour, par produit.
  const totals = new Map<string, { quantity: number; unit: string }>();
  for (const o of orders) {
    for (const i of o.order_items) {
      if (!i.products?.needs_slaughter) continue;
      const t = totals.get(i.product_name) ?? { quantity: 0, unit: i.products.unit };
      t.quantity += i.quantity;
      totals.set(i.product_name, t);
    }
  }
  const open = new Date(d.order_deadline).getTime() > Date.now();

  return (
    <section className="rounded-lg bg-card p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h3 className="font-semibold first-letter:uppercase">{formatSlaughterDay(d.day)}</h3>
            <p className="text-sm text-muted-foreground">
              {open ? "Commandes ouvertes jusqu'au " : "Commandes closes depuis le "}
              {formatDeadline(d.order_deadline)}
            </p>
            {d.note && <p className="mt-1 text-sm">{d.note}</p>}
          </div>
        </div>
        <button
          onClick={() => onRemove(d, orders.length)}
          className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
        >
          <Trash2 className="h-3.5 w-3.5" /> Supprimer
        </button>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <p className="text-sm font-medium">
          À préparer : {orders.length} commande{orders.length > 1 ? "s" : ""}
        </p>
        {totals.size === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Aucune viande commandée pour l'instant.
          </p>
        ) : (
          <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
            {[...totals].map(([name, t]) => (
              <li
                key={name}
                className="flex justify-between gap-3 rounded-md bg-secondary px-3 py-2"
              >
                <span>{name}</span>
                <span className="font-semibold tabular-nums">
                  {t.quantity} {t.unit}
                </span>
              </li>
            ))}
          </ul>
        )}
        {orders.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {orders.map((o) => (
              <Link
                key={o.id}
                to="/admin/orders/$orderId"
                params={{ orderId: o.id }}
                className="text-primary hover:underline"
              >
                #{orderNumber(o.id)} · {o.shipping_full_name}
              </Link>
            ))}
          </p>
        )}
      </div>
    </section>
  );
}
