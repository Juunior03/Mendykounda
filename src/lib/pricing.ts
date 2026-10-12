/**
 * Prix effectif d'un produit : la promo si elle est inférieure au prix normal.
 * Même règle que la fonction SQL place_order (qui fait foi pour le total).
 */
interface Priced {
  price: number;
  discount_price: number | null;
}

export const hasPromo = (p: Priced) =>
  p.discount_price != null && Number(p.discount_price) < Number(p.price);

export const effectivePrice = (p: Priced) =>
  hasPromo(p) ? Number(p.discount_price) : Number(p.price);

/** Remise en pourcentage arrondie (ex. 17 pour -17 %), 0 sans promo. */
export const promoPercent = (p: Priced) =>
  hasPromo(p) ? Math.round((1 - Number(p.discount_price) / Number(p.price)) * 100) : 0;

/** Seuil sous lequel on affiche « Plus que N en stock ». */
export const LOW_STOCK_THRESHOLD = 5;
