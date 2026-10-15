/**
 * Panier « vivant » : relit en base le prix, le stock et la disponibilité
 * des produits du panier. Le prix stocké localement peut être périmé ;
 * le total réellement facturé est calculé par la fonction SQL place_order.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cartStore, type CartItem } from "@/lib/cart";
import { effectivePrice } from "@/lib/pricing";
import { upcomingSlaughterQuery, type SlaughterDay } from "@/lib/slaughter";
import { backInLabel, inSeason } from "@/lib/season";

interface LiveProduct {
  id: string;
  slug: string;
  name: string;
  price: number;
  discount_price: number | null;
  stock: number;
  is_active: boolean;
  unit: string;
  image_url: string | null;
  needs_slaughter: boolean;
  season_months: number[] | null;
  sold_by_weight: boolean;
}

export interface CartLine {
  item: CartItem;
  product: LiveProduct | null;
  /** Prix unitaire actuel (promo incluse). */
  price: number;
  /** Ancien prix si le prix a changé depuis l'ajout au panier. */
  previousPrice: number | null;
  /** Problème bloquant la commande, sinon null. */
  issue: string | null;
}

export function useCartLines(items: CartItem[]) {
  const ids = items.map((i) => i.productId).sort((a, b) => a.localeCompare(b));

  const { data: products, isLoading } = useQuery({
    queryKey: ["cart-products", ids],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<LiveProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, slug, name, price, discount_price, stock, is_active, unit, image_url, needs_slaughter, season_months, sold_by_weight",
        )
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Viande à l'abattage : livrée à partir du prochain abattage programmé.
  const hasSlaughterItems = (products ?? []).some(
    (p) => p.needs_slaughter && items.some((i) => i.productId === p.id),
  );
  const { data: upcoming } = useQuery({ ...upcomingSlaughterQuery(), enabled: hasSlaughterItems });
  const slaughterDay: SlaughterDay | null = hasSlaughterItems ? (upcoming?.[0] ?? null) : null;

  const lines: CartLine[] = items.map((item) => {
    const product = products?.find((p) => p.id === item.productId) ?? null;
    if (!products)
      return { item, product: null, price: item.price, previousPrice: null, issue: null };
    if (!product?.is_active) {
      return {
        item,
        product,
        price: item.price,
        previousPrice: null,
        issue: "Ce produit n'est plus disponible.",
      };
    }
    const price = effectivePrice(product);
    let issue: string | null = null;
    if (!inSeason(product)) {
      const back = backInLabel(product);
      issue = back
        ? `Hors saison, ${back} : retirez cet article.`
        : "Hors saison : retirez cet article.";
    } else if (product.stock <= 0) issue = "Actuellement indisponible.";
    else if (item.quantity > product.stock)
      issue = `Plus que ${product.stock} en stock : réduisez la quantité.`;
    else if (product.needs_slaughter && upcoming?.length === 0)
      issue = "Aucun abattage programmé pour le moment : retirez cet article ou revenez plus tard.";
    return { item, product, price, previousPrice: price === item.price ? null : item.price, issue };
  });

  // Après quelques secondes d'affichage de l'écart, on mémorise le prix
  // actuel dans le panier pour ne plus le signaler.
  useEffect(() => {
    const changed = (products ?? []).filter((p) => {
      const item = items.find((i) => i.productId === p.id);
      return item && p.is_active && effectivePrice(p) !== item.price;
    });
    if (changed.length === 0) return;
    const t = setTimeout(() => {
      for (const p of changed) cartStore.update(p.id, { price: effectivePrice(p) });
    }, 8000);
    return () => clearTimeout(t);
  }, [products, items]);

  const available = lines.filter((l) => !l.issue);
  const subtotal = available.reduce((s, l) => s + l.price * l.item.quantity, 0);
  const itemCount = available.reduce((s, l) => s + l.item.quantity, 0);
  const blocked = lines.some((l) => l.issue);

  return {
    lines,
    subtotal,
    itemCount,
    blocked,
    loading: isLoading && ids.length > 0,
    /** Prochain abattage si le panier contient de la viande à l'abattage. */
    slaughterDay,
    /** Le panier contient des articles au poids réel : montant estimé. */
    hasWeighed: (products ?? []).some(
      (p) => p.sold_by_weight && items.some((i) => i.productId === p.id),
    ),
  };
}
