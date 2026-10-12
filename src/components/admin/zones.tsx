/**
 * Admin — livraison : tarifs (seuil de gratuité + barème selon le montant),
 * tarif de chaque commune, ouverture / fermeture des communes, ajout de zones.
 * Les frais sont recalculés en base à chaque commande (fonction delivery_fee).
 */
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  deliveryRatesQuery,
  deliveryZonesQuery,
  groupByDepartment,
  rateSummary,
  type DeliveryRate,
  type DeliveryZone,
} from "@/lib/zones";
import { formatPrice } from "@/lib/format";

export function ZonesAdmin() {
  const qc = useQueryClient();
  const { data: zones = [], isLoading } = useQuery(deliveryZonesQuery(true));
  const { data: rates = [] } = useQuery(deliveryRatesQuery());
  const [department, setDepartment] = useState("");
  const [newRateId, setNewRateId] = useState("");
  const [commune, setCommune] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["delivery-zones"] });
    void qc.invalidateQueries({ queryKey: ["delivery-rates"] });
  };

  const setRate = async (z: DeliveryZone, rateId: string) => {
    const { error } = await supabase
      .from("delivery_zones")
      .update({ rate_id: rateId || null })
      .eq("id", z.id);
    if (error) toast.error(error.message);
    else void refresh();
  };

  // Tarif proposé par défaut pour une nouvelle commune : le plus utilisé.
  const mostUsedRate = rates
    .map((r) => ({ r, n: zones.filter((z) => z.rate_id === r.id).length }))
    .sort((a, b) => b.n - a.n)[0]?.r.id;

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
    const { error } = await supabase.from("delivery_zones").insert({
      region,
      department: dep,
      commune: com,
      sort_order: maxSort + 1,
      rate_id: (newRateId || mostUsedRate) ?? null,
    });
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

      <RatesAdmin rates={rates} zones={zones} onChange={refresh} />

      <h3 className="pt-2 text-base font-semibold">Communes desservies et tarif appliqué</h3>

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
                  <li
                    key={z.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2 text-sm"
                  >
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
                    <select
                      value={z.rate_id ?? ""}
                      onChange={(e) => void setRate(z, e.target.value)}
                      className="col-span-2 rounded border border-border bg-background px-2 py-1 text-xs"
                      aria-label={`Tarif de livraison pour ${z.commune}`}
                    >
                      <option value="">Sans tarif (gratuite)</option>
                      {rates.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
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
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
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
            Tarif
            <select
              value={newRateId || mostUsedRate || ""}
              onChange={(e) => setNewRateId(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-normal"
            >
              <option value="">Sans tarif (gratuite)</option>
              {rates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
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

/* ------------------------------------------------------------------ */
/* Tarifs                                                              */
/* ------------------------------------------------------------------ */

type FreeMode = "always" | "from" | "never";
interface Draft {
  name: string;
  mode: FreeMode;
  freeFrom: string;
  brackets: { from: string; fee: string }[];
}

const toDraft = (r?: DeliveryRate): Draft => ({
  name: r?.name ?? "",
  mode: !r ? "from" : r.free_from == null ? "never" : Number(r.free_from) <= 0 ? "always" : "from",
  freeFrom: r?.free_from != null && Number(r.free_from) > 0 ? String(Number(r.free_from)) : "15000",
  brackets: (r?.brackets ?? []).map((b) => ({ from: String(b.from), fee: String(b.fee) })),
});

function RatesAdmin({
  rates,
  zones,
  onChange,
}: {
  rates: DeliveryRate[];
  zones: DeliveryZone[];
  onChange: () => void;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Tarifs de livraison</h3>
          <p className="text-xs text-muted-foreground">
            Créez un tarif par type de zone (distance, accessibilité), puis attribuez-le aux
            communes ci-dessous. Les frais s'appliquent sur le montant des articles.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          <Plus className="h-4 w-4" /> Nouveau tarif
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {rates.map((r) => (
          <RateCard
            key={r.id}
            rate={r}
            usedBy={zones.filter((z) => z.rate_id === r.id).map((z) => z.commune)}
            onChange={onChange}
          />
        ))}
        {creating && (
          <RateCard
            usedBy={[]}
            sortOrder={rates.length}
            onChange={onChange}
            onDone={() => setCreating(false)}
          />
        )}
      </div>
    </section>
  );
}

function RateCard({
  rate,
  usedBy,
  sortOrder = 0,
  onChange,
  onDone,
}: {
  rate?: DeliveryRate;
  usedBy: string[];
  sortOrder?: number;
  onChange: () => void;
  onDone?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(rate));
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(toDraft(rate)), [rate]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setBracket = (i: number, patch: Partial<Draft["brackets"][number]>) =>
    set({ brackets: draft.brackets.map((b, j) => (j === i ? { ...b, ...patch } : b)) });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (name.length < 2) return toast.error("Donnez un nom au tarif");
    const brackets = draft.brackets
      .filter((b) => b.from !== "" && b.fee !== "")
      .map((b) => ({
        from: Math.max(0, Math.round(Number(b.from))),
        fee: Math.max(0, Math.round(Number(b.fee))),
      }))
      .filter((b) => Number.isFinite(b.from) && Number.isFinite(b.fee))
      .sort((a, b) => a.from - b.from);
    const free_from =
      draft.mode === "always"
        ? 0
        : draft.mode === "never"
          ? null
          : Math.max(0, Math.round(Number(draft.freeFrom) || 0));
    if (draft.mode !== "always" && brackets.length === 0) {
      return toast.error(
        "Ajoutez au moins une tranche de frais (sinon choisissez « Toujours gratuite »)",
      );
    }
    setBusy(true);
    const payload = { name, free_from, brackets };
    const { error } = rate
      ? await supabase.from("delivery_rates").update(payload).eq("id", rate.id)
      : await supabase.from("delivery_rates").insert({ ...payload, sort_order: sortOrder });
    setBusy(false);
    if (error)
      return toast.error(error.code === "23505" ? "Un tarif porte déjà ce nom" : error.message);
    toast.success("Tarif enregistré");
    onChange();
    onDone?.();
  };

  const remove = async () => {
    if (!rate) return onDone?.();
    if (!window.confirm(`Supprimer le tarif « ${rate.name} » ?`)) return;
    const { error } = await supabase.from("delivery_rates").delete().eq("id", rate.id);
    if (error) return toast.error(error.message);
    onChange();
  };

  const preview: DeliveryRate = {
    id: "",
    name: draft.name,
    sort_order: 0,
    free_from:
      draft.mode === "always" ? 0 : draft.mode === "never" ? null : Number(draft.freeFrom) || 0,
    brackets: draft.brackets
      .filter((b) => b.from !== "" && b.fee !== "")
      .map((b) => ({ from: Number(b.from), fee: Number(b.fee) })),
  };

  return (
    <form onSubmit={save} className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Nom du tarif (ex. Zone éloignée)"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-semibold"
          aria-label="Nom du tarif"
        />
        {usedBy.length === 0 && (
          <button
            type="button"
            onClick={() => void remove()}
            className="rounded-md p-2 text-muted-foreground hover:text-destructive"
            aria-label="Supprimer ce tarif"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <fieldset className="space-y-1 text-sm">
        <legend className="mb-1 text-xs font-medium">Livraison gratuite</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={draft.mode === "always"}
            onChange={() => set({ mode: "always" })}
            className="accent-[var(--primary)]"
          />
          Toujours gratuite
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <input
            type="radio"
            checked={draft.mode === "from"}
            onChange={() => set({ mode: "from" })}
            className="accent-[var(--primary)]"
          />
          Gratuite dès
          <input
            type="number"
            min={0}
            step={500}
            value={draft.freeFrom}
            onChange={(e) => set({ freeFrom: e.target.value, mode: "from" })}
            className="w-28 rounded border border-border bg-background px-2 py-1 text-sm"
            aria-label="Montant de gratuité"
          />
          F CFA d'achats
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={draft.mode === "never"}
            onChange={() => set({ mode: "never" })}
            className="accent-[var(--primary)]"
          />
          Jamais gratuite
        </label>
      </fieldset>

      {draft.mode !== "always" && (
        <div className="text-sm">
          <p className="mb-1 text-xs font-medium">Frais selon le montant des articles</p>
          <ul className="space-y-1.5">
            {draft.brackets.map((b, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">À partir de</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={b.from}
                  onChange={(e) => setBracket(i, { from: e.target.value })}
                  className="w-24 rounded border border-border bg-background px-2 py-1"
                  aria-label="Montant minimum"
                />
                <span className="text-muted-foreground">F : frais de</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={b.fee}
                  onChange={(e) => setBracket(i, { fee: e.target.value })}
                  className="w-24 rounded border border-border bg-background px-2 py-1"
                  aria-label="Frais de livraison"
                />
                <span className="text-muted-foreground">F</span>
                <button
                  type="button"
                  onClick={() => set({ brackets: draft.brackets.filter((_, j) => j !== i) })}
                  className="p-1 text-muted-foreground hover:text-destructive"
                  aria-label="Retirer cette tranche"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() =>
              set({
                brackets: [...draft.brackets, { from: draft.brackets.length ? "" : "0", fee: "" }],
              })
            }
            className="mt-2 text-xs text-primary hover:underline"
          >
            + Ajouter une tranche
          </button>
        </div>
      )}

      <p className="rounded-md bg-secondary px-2 py-1.5 text-xs">
        Résultat : <span className="font-medium">{rateSummary(preview)}</span>
        {preview.free_from !== 0 && preview.brackets.length > 0 && (
          <span className="text-muted-foreground">
            {" "}
            · ex. commande de {formatPrice(4000)} :{" "}
            {preview.free_from != null && 4000 >= preview.free_from
              ? "gratuite"
              : formatPrice(
                  [...preview.brackets]
                    .filter((b) => b.from <= 4000)
                    .sort((a, b) => b.from - a.from)[0]?.fee ?? 0,
                )}
          </span>
        )}
      </p>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {usedBy.length
            ? `${usedBy.length} commune${usedBy.length > 1 ? "s" : ""} : ${usedBy.slice(0, 4).join(", ")}${usedBy.length > 4 ? "…" : ""}`
            : "Aucune commune"}
        </p>
        <div className="flex gap-2">
          {onDone && !rate && (
            <button
              type="button"
              onClick={onDone}
              className="rounded-md px-3 py-1.5 text-sm hover:bg-secondary"
            >
              Annuler
            </button>
          )}
          <button
            disabled={busy}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </form>
  );
}
