/**
 * Zones de livraison (communes). La liste fait foi côté base : place_order
 * refuse toute commande hors zone active.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/format";

export interface DeliveryZone {
  id: string;
  region: string;
  department: string;
  commune: string;
  is_active: boolean;
  sort_order: number;
  /** Frais de livraison = coût du transport depuis la ferme (0 = toujours gratuite). */
  delivery_fee: number;
  /** Montant d'articles à partir duquel la livraison est offerte (null = jamais). */
  free_from: number | null;
}

/** Texte affiché partout sur le site pour la zone desservie. */
export const DELIVERY_AREA = "la région de Ziguinchor";

export const deliveryZonesQuery = (includeInactive = false) =>
  queryOptions({
    queryKey: ["delivery-zones", includeInactive],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DeliveryZone[]> => {
      let q = supabase.from("delivery_zones").select("*");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q.order("sort_order").order("commune");
      if (error) throw error;
      return data ?? [];
    },
  });

/**
 * Frais de livraison pour un montant d'articles.
 * Même règle que la fonction SQL delivery_fee (qui fait foi à la commande).
 */
export function deliveryFee(zone: DeliveryZone | null | undefined, subtotal: number): number {
  if (!zone) return 0;
  if (zone.free_from != null && subtotal >= Number(zone.free_from)) return 0;
  return Number(zone.delivery_fee);
}

/** Montant restant pour obtenir la livraison gratuite (null si impossible ou déjà gratuite). */
export function freeDeliveryGap(
  zone: DeliveryZone | null | undefined,
  subtotal: number,
): number | null {
  if (zone?.free_from == null || deliveryFee(zone, subtotal) === 0) return null;
  const gap = Number(zone.free_from) - subtotal;
  return gap > 0 ? gap : null;
}

/** Résumé lisible, ex. « 5 000 F CFA, offerte dès 15 000 F CFA d'achats ». */
export function feeSummary(zone: DeliveryZone | null | undefined): string {
  if (
    !zone ||
    Number(zone.delivery_fee) <= 0 ||
    (zone.free_from != null && Number(zone.free_from) <= 0)
  ) {
    return "gratuite";
  }
  const fee = formatPrice(Number(zone.delivery_fee));
  return zone.free_from == null
    ? fee
    : `${fee}, offerte dès ${formatPrice(Number(zone.free_from))} d'achats`;
}

/** Libellé d'une zone ; précise le département si le nom de commune est en double (Mlomp). */
export const zoneLabel = (z: DeliveryZone, all: DeliveryZone[]) =>
  all.some((o) => o.id !== z.id && o.commune === z.commune)
    ? `${z.commune} (${z.department})`
    : z.commune;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replaceAll(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, " ")
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
