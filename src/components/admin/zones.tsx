/**
 * Admin — zones de livraison : ouvrir / fermer une commune, en ajouter.
 * Une commande n'est acceptée que vers une zone ouverte (contrôlé en base).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deliveryZonesQuery, groupByDepartment, type DeliveryZone } from "@/lib/zones";

export function ZonesAdmin() {
  const qc = useQueryClient();
  const { data: zones = [], isLoading } = useQuery(deliveryZonesQuery(true));
  const [department, setDepartment] = useState("");
  const [commune, setCommune] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey: ["delivery-zones"] });

  const toggle = async (z: DeliveryZone) => {
    const { error } = await supabase
      .from("delivery_zones")
      .update({ is_active: !z.is_active })
      .eq("id", z.id);
    if (error) toast.error(error.message);
    else void refresh();
  };

  const setAll = async (ids: string[], active: boolean) => {
    const { error } = await supabase
      .from("delivery_zones")
      .update({ is_active: active })
      .in("id", ids);
    if (error) toast.error(error.message);
    else void refresh();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const dep = department.trim();
    const com = commune.trim();
    if (dep.length < 2 || com.length < 2) return;
    setBusy(true);
    const maxSort = Math.max(
      0,
      ...zones.filter((z) => z.department === dep).map((z) => z.sort_order),
    );
    const region = zones.find((z) => z.department === dep)?.region ?? "Ziguinchor";
    const { error } = await supabase
      .from("delivery_zones")
      .insert({ region, department: dep, commune: com, sort_order: maxSort + 1 });
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Cette commune existe déjà" : error.message);
      return;
    }
    toast.success(`${com} ajoutée`);
    setCommune("");
    void refresh();
  };

  const activeCount = zones.filter((z) => z.is_active).length;
  const departments = [...new Set(zones.map((z) => z.department))];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{activeCount}</span> commune
        {activeCount > 1 ? "s" : ""} desservie{activeCount > 1 ? "s" : ""} sur {zones.length}. Les
        clients ne peuvent commander que vers une commune ouverte.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {groupByDepartment(zones).map(([dep, list]) => {
          const allOn = list.every((z) => z.is_active);
          return (
            <section key={dep} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">Département de {dep}</h3>
                <button
                  onClick={() =>
                    void setAll(
                      list.map((z) => z.id),
                      !allOn,
                    )
                  }
                  className="text-xs text-primary hover:underline"
                >
                  {allOn ? "Tout fermer" : "Tout ouvrir"}
                </button>
              </div>
              <ul className="divide-y divide-border">
                {list.map((z) => (
                  <li key={z.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className={z.is_active ? "" : "text-muted-foreground line-through"}>
                      {z.commune}
                    </span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      {z.is_active ? "Ouverte" : "Fermée"}
                      <input
                        type="checkbox"
                        checked={z.is_active}
                        onChange={() => void toggle(z)}
                        className="h-4 w-4 accent-[var(--primary)]"
                        aria-label={`Livrer à ${z.commune}`}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <form onSubmit={add} className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-semibold">Ajouter une zone</h3>
        <p className="text-xs text-muted-foreground">
          Pour étendre la livraison (nouvelle commune ou nouveau département).
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-medium">
            Département
            <input
              list="departments"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              required
              minLength={2}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal"
            />
            <datalist id="departments">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="text-xs font-medium">
            Commune
            <input
              value={commune}
              onChange={(e) => setCommune(e.target.value)}
              required
              minLength={2}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal"
            />
          </label>
          <button
            disabled={busy}
            className="self-end rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      </form>
    </div>
  );
}
