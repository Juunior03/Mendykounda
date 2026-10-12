/**
 * Zones de livraison (communes). La liste fait foi côté base : place_order
 * refuse toute commande hors zone active.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DeliveryZone {
  id: string;
  region: string;
  department: string;
  commune: string;
  is_active: boolean;
  sort_order: number;
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
