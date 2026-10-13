/**
 * Clients (admin) : statistiques calculées à partir des commandes et
 * segments pour cibler les relances. Les commandes annulées ne comptent
 * ni dans le total dépensé ni dans le nombre de commandes.
 */

export interface CustomerOrder {
  user_id: string;
  total_amount: number | string;
  status: string;
  created_at: string;
}

export interface CustomerStats {
  orderCount: number;
  cancelledCount: number;
  totalSpent: number;
  averageBasket: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

export const emptyStats = (): CustomerStats => ({
  orderCount: 0,
  cancelledCount: 0,
  totalSpent: 0,
  averageBasket: 0,
  firstOrderAt: null,
  lastOrderAt: null,
});

/** Statistiques par client (clé : user_id). */
export function statsByCustomer(orders: CustomerOrder[]) {
  const map = new Map<string, CustomerStats>();
  for (const o of orders) {
    const s = map.get(o.user_id) ?? emptyStats();
    if (o.status === "cancelled") {
      s.cancelledCount += 1;
    } else {
      s.orderCount += 1;
      s.totalSpent += Number(o.total_amount);
      if (!s.firstOrderAt || o.created_at < s.firstOrderAt) s.firstOrderAt = o.created_at;
      if (!s.lastOrderAt || o.created_at > s.lastOrderAt) s.lastOrderAt = o.created_at;
    }
    map.set(o.user_id, s);
  }
  for (const s of map.values()) {
    s.averageBasket = s.orderCount ? Math.round(s.totalSpent / s.orderCount) : 0;
  }
  return map;
}

/** Seuils des segments (jours / nombre de commandes). */
export const NEW_DAYS = 30;
export const INACTIVE_DAYS = 60;
export const LOYAL_ORDERS = 3;

export type Segment = "all" | "new" | "loyal" | "inactive" | "never";

export const SEGMENT_LABEL: Record<Segment, string> = {
  all: "Tous",
  new: "Nouveaux",
  loyal: "Fidèles",
  inactive: "Inactifs",
  never: "Sans commande",
};

export const SEGMENT_HELP: Record<Exclude<Segment, "all">, string> = {
  new: `inscrits depuis moins de ${NEW_DAYS} jours`,
  loyal: `${LOYAL_ORDERS} commandes ou plus`,
  inactive: `pas de commande depuis plus de ${INACTIVE_DAYS} jours`,
  never: "inscrits mais n'ont jamais commandé",
};

const daysSince = (iso: string, now = Date.now()) => (now - new Date(iso).getTime()) / 864e5;

export function inSegment(
  segment: Segment,
  c: { created_at: string; stats: CustomerStats },
  now = Date.now(),
) {
  switch (segment) {
    case "new":
      return daysSince(c.created_at, now) <= NEW_DAYS;
    case "loyal":
      return c.stats.orderCount >= LOYAL_ORDERS;
    case "inactive":
      return !!c.stats.lastOrderAt && daysSince(c.stats.lastOrderAt, now) > INACTIVE_DAYS;
    case "never":
      return c.stats.orderCount === 0;
    default:
      return true;
  }
}

/** Fichier CSV (séparateur « ; » pour Excel en français). */
export function toCsv(rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // BOM pour que les accents s'affichent correctement dans Excel.
  return String.fromCharCode(0xfeff) + rows.map((r) => r.map(cell).join(";")).join("\n");
}

/** Clé de cache de la liste des clients (admin). */
export const customersQueryKey = ["admin-customers"];
