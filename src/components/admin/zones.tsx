/**
 * Admin — livraison : pour chaque commune, ouverture, frais de livraison
 * (= coût du transport depuis la ferme) et seuil de gratuité ; ajout de zones.
 * Les frais sont recalculés en base à chaque commande (fonction delivery_fee).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deliveryZonesQuery, feeSummary, groupByDepartment, type DeliveryZone } from "@/lib/zones";
import { formatPrice } from "@/lib/format";

/** Seuil de gratuité proposé par défaut. */
const DEFAULT_FREE_FROM = 15000;

type ZonePatch = Partial<Pick<DeliveryZone, "is_active" | "delivery_fee" | "free_from">>;

const toInt = (v: string) => {
  const n = Math.round(Number(v));
  return v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};

export function ZonesAdmin() {
  const qc = useQueryClient();
  const { data: zones = [], isLoading } = useQuery(deliveryZonesQuery(true));
  const [department, setDepartment] = useState("");
  const [commune, setCommune] = useState("");
  const [newFee, setNewFee] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkThreshold, setBulkThreshold] = useState(String(DEFAULT_FREE_FROM));

  const refresh = () => qc.invalidateQueries({ queryKey: ["delivery-zones"] });

  const patch = async (ids: string[], values: ZonePatch) => {
    const { error } = await supabase.from("delivery_zones").update(values).in("id", ids);
    if (error) toast.error(error.message);
    else void refresh();
    return !error;
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
    const { error } = await supabase.from("delivery_zones").insert({
      region,
      department: dep,
      commune: com,
      sort_order: maxSort + 1,
      delivery_fee: toInt(newFee) ?? 0,
      free_from: DEFAULT_FREE_FROM,
    });
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Cette commune existe déjà" : error.message);
      return;
    }
    toast.success(`${com} ajoutée`);
    setCommune("");
    setNewFee("");
    void refresh();
  };

  // Communes payantes (hors gratuité permanente) : cible du seuil commun.
  const paying = zones.filter(
    (z) => Number(z.delivery_fee) > 0 && !(z.free_from != null && Number(z.free_from) <= 0),
  );
  const applyThresholdToAll = async () => {
    const t = toInt(bulkThreshold);
    if (t == null || paying.length === 0) return;
    if (
      !window.confirm(
        `Appliquer « offerte dès ${formatPrice(t)} » aux ${paying.length} communes payantes ?`,
      )
    )
      return;
    if (
      await patch(
        paying.map((z) => z.id),
        { free_from: t },
      )
    )
      toast.success("Seuil appliqué");
  };

  const activeCount = zones.filter((z) => z.is_active).length;
  const departments = [...new Set(zones.map((z) => z.department))];

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p>
          <span className="font-medium">{activeCount}</span> commune{activeCount > 1 ? "s" : ""}{" "}
          desservie{activeCount > 1 ? "s" : ""} sur {zones.length}.
        </p>
        <p className="mt-1 text-muted-foreground">
          Pour chaque commune, indiquez les{" "}
          <strong className="text-foreground">frais de livraison</strong> (le coût du transport
          depuis la ferme) et le montant d'achats à partir duquel la livraison est{" "}
          <strong className="text-foreground">offerte</strong>. Frais à 0 = toujours gratuite ;
          seuil vide = jamais offerte.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span>Seuil de gratuité commun :</span>
          <input
            type="number"
            min={0}
            step={500}
            value={bulkThreshold}
            onChange={(e) => setBulkThreshold(e.target.value)}
            className="w-28 rounded border border-border bg-background px-2 py-1"
            aria-label="Seuil de gratuité commun"
          />
          <span>F</span>
          <button
            onClick={() => void applyThresholdToAll()}
            className="rounded-md border border-border px-3 py-1 hover:bg-secondary"
          >
            Appliquer aux communes payantes
          </button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}

      <div className="grid gap-4 xl:grid-cols-3">
        {groupByDepartment(zones).map(([dep, list]) => {
          const allOn = list.every((z) => z.is_active);
          return (
            <section key={dep} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-semibold">Département de {dep}</h3>
                <button
                  onClick={() =>
                    void patch(
                      list.map((z) => z.id),
                      { is_active: !allOn },
                    )
                  }
                  className="text-xs text-primary hover:underline"
                >
                  {allOn ? "Tout fermer" : "Tout ouvrir"}
                </button>
              </div>
              <div className="mb-1 grid grid-cols-[1fr_5.5rem_5.5rem] gap-2 text-[11px] uppercase text-muted-foreground">
                <span>Commune</span>
                <span className="text-right">Frais (F)</span>
                <span className="text-right">Offerte dès</span>
              </div>
              <ul className="divide-y divide-border">
                {list.map((z) => (
                  <ZoneRow key={z.id} zone={z} onPatch={(v) => patch([z.id], v)} />
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
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_10rem_auto]">
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
          <label className="text-xs font-medium">
            Frais de livraison (F)
            <input
              type="number"
              min={0}
              step={500}
              value={newFee}
              onChange={(e) => setNewFee(e.target.value)}
              placeholder="ex. 5000"
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

/** Ligne d'une commune : enregistrement à la sortie du champ (ou Entrée). */
function ZoneRow({
  zone: z,
  onPatch,
}: {
  zone: DeliveryZone;
  onPatch: (v: ZonePatch) => Promise<boolean>;
}) {
  const feeText = String(Number(z.delivery_fee));
  const freeText = z.free_from == null ? "" : String(Number(z.free_from));
  const [fee, setFee] = useState(feeText);
  const [freeFrom, setFreeFrom] = useState(freeText);
  useEffect(() => setFee(feeText), [feeText]);
  useEffect(() => setFreeFrom(freeText), [freeText]);

  const saveFee = () => {
    const n = toInt(fee);
    if (n == null) return setFee(feeText);
    if (n !== Number(z.delivery_fee)) void onPatch({ delivery_fee: n });
  };
  const saveFreeFrom = () => {
    // Champ vide = jamais offerte.
    if (freeFrom.trim() === "") {
      if (z.free_from != null) void onPatch({ free_from: null });
      return;
    }
    const n = toInt(freeFrom);
    if (n == null) return setFreeFrom(freeText);
    if (n !== (z.free_from == null ? null : Number(z.free_from))) void onPatch({ free_from: n });
  };
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  return (
    <li className="py-2 text-sm">
      <div className="grid grid-cols-[1fr_5.5rem_5.5rem] items-center gap-2">
        <label className="flex min-w-0 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={z.is_active}
            onChange={() => void onPatch({ is_active: !z.is_active })}
            className="h-4 w-4 shrink-0 accent-[var(--primary)]"
            aria-label={`Livrer à ${z.commune}`}
          />
          <span className={`truncate ${z.is_active ? "" : "text-muted-foreground line-through"}`}>
            {z.commune}
          </span>
        </label>
        <input
          type="number"
          min={0}
          step={500}
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          onBlur={saveFee}
          onKeyDown={onEnter}
          className="w-full rounded border border-border bg-background px-2 py-1 text-right tabular-nums"
          aria-label={`Frais de livraison pour ${z.commune}`}
        />
        <input
          type="number"
          min={0}
          step={500}
          value={freeFrom}
          onChange={(e) => setFreeFrom(e.target.value)}
          onBlur={saveFreeFrom}
          onKeyDown={onEnter}
          placeholder="jamais"
          className="w-full rounded border border-border bg-background px-2 py-1 text-right tabular-nums"
          aria-label={`Livraison offerte dès, pour ${z.commune}`}
        />
      </div>
      <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground">{feeSummary(z)}</p>
    </li>
  );
}
