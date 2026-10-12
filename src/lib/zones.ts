/**
 * Zones de livraison (communes). La liste fait foi côté base : place_order
 * refuse toute commande hors zone active.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";

export interface DeliveryRate {
  id: string;
  name: string;
  /** Montant d'articles à partir duquel la livraison est offerte (0 = toujours, null = jamais). */
  free_from: number | null;
  /** Barème : on applique la ligne au « from » le plus élevé ne dépassant pas le montant. */
  brackets: { from: number; fee: number }[];
  sort_order: number;
}

export interface DeliveryZone {
  id: string;
  region: string;
  department: string;
  commune: string;
  is_active: boolean;
  sort_order: number;
  rate_id: string | null;
  delivery_rates: DeliveryRate | null;
}

/** Texte affiché partout sur le site pour la zone desservie. */
export const DELIVERY_AREA = "la région de Ziguinchor";

export const deliveryZonesQuery = (includeInactive = false) =>
  queryOptions({
    queryKey: ["delivery-zones", includeInactive],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DeliveryZone[]> => {
      let q = supabase.from("delivery_zones").select("*, delivery_rates(*)");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q.order("sort_order").order("commune");
      if (error) throw error;
      return (data ?? []) as unknown as DeliveryZone[];
    },
  });

export const deliveryRatesQuery = () =>
  queryOptions({
    queryKey: ["delivery-rates"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DeliveryRate[]> => {
      const { data, error } = await supabase.from("delivery_rates").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as DeliveryRate[];
    },
  });

/**
 * Frais de livraison pour un montant d'articles.
 * Même règle que la fonction SQL delivery_fee (qui fait foi à la commande).
 */
export function deliveryFee(rate: DeliveryRate | null | undefined, subtotal: number): number {
  if (!rate) return 0;
  if (rate.free_from != null && subtotal >= Number(rate.free_from)) return 0;
  const applicable = (rate.brackets ?? [])
    .filter((b) => typeof b?.from === "number" && typeof b?.fee === "number" && b.from <= subtotal)
    .sort((a, b) => b.from - a.from)[0];
  return applicable ? applicable.fee : 0;
}

/** Montant restant pour obtenir la livraison gratuite (null si impossible ou déjà gratuite). */
export function freeDeliveryGap(
  rate: DeliveryRate | null | undefined,
  subtotal: number,
): number | null {
  if (!rate || rate.free_from == null) return null;
  const gap = Number(rate.free_from) - subtotal;
  return gap > 0 && deliveryFee(rate, subtotal) > 0 ? gap : null;
}

/** Résumé lisible d'un tarif, ex. « gratuite dès 15 000 F CFA, sinon 1 000 à 2 000 F CFA ». */
export function rateSummary(rate: DeliveryRate | null | undefined): string {
  if (!rate) return "gratuite";
  if (rate.free_from != null && Number(rate.free_from) <= 0) return "gratuite";
  const fees = (rate.brackets ?? [])
    .map((b) => b.fee)
    .filter((f) => typeof f === "number" && f > 0);
  const min = fees.length ? Math.min(...fees) : 0;
  const max = fees.length ? Math.max(...fees) : 0;
  const range = !fees.length
    ? ""
    : min === max
      ? formatPrice(min)
      : `${formatPrice(min)} à ${formatPrice(max)} selon le montant`;
  if (rate.free_from == null) return range || "gratuite";
  return range ? `gratuite dès ${formatPrice(Number(rate.free_from))}, sinon ${range}` : "gratuite";
}

/** Libellé d'une zone ; précise le département si le nom de commune est en double (Mlomp). */
export const zoneLabel = (z: DeliveryZone, all: DeliveryZone[]) =>
  all.some((o) => o.id !== z.id && o.commune === z.commune)
    ? `${z.commune} (${z.department})`
    : z.commune;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Retrouve la zone correspondant à une ville saisie (profil existant). */
export function matchZone(
  city: string | null | undefined,
  zones: DeliveryZone[],
): DeliveryZone | undefined {
  if (!city) return undefined;
  const c = norm(city);
  return (
    zones.find((z) => norm(zoneLabel(z, zones)) === c) ??
    zones.find(
      (z) => norm(z.commune) === c && zones.filter((o) => o.commune === z.commune).length === 1,
    )
  );
}

/** Zones regroupées par département, dans l'ordre d'affichage. */
export function groupByDepartment(zones: DeliveryZone[]) {
  const groups = new Map<string, DeliveryZone[]>();
  for (const z of zones) groups.set(z.department, [...(groups.get(z.department) ?? []), z]);
  return [...groups.entries()];
}
