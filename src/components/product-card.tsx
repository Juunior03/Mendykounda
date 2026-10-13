/**
 * Carte produit : image, titre, note, prix (promo), disponibilité,
 * date de livraison estimée et ajout rapide au panier.
 */
import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { productDisplayName, type Product } from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import { resolveProductImage } from "@/lib/product-images";
import { Button } from "@/components/ui/button";
import { Stars } from "@/components/stars";
import { cartStore } from "@/lib/cart";
import { effectivePrice, hasPromo, promoPercent, LOW_STOCK_THRESHOLD } from "@/lib/pricing";
import { useQuery } from "@tanstack/react-query";
import { deliveryWindow, formatLongDate } from "@/lib/delivery";
import { formatSlaughterDay, upcomingSlaughterQuery } from "@/lib/slaughter";
import { backInLabel, inSeason, isSeasonal } from "@/lib/season";

export function ProductCard({ product }: { product: Product }) {
  const img = resolveProductImage(product.image_url);
  const promo = hasPromo(product);
  const price = effectivePrice(product);
  const { data: upcoming } = useQuery({
    ...upcomingSlaughterQuery(),
    enabled: product.needs_slaughter,
  });
  const slaughter = product.needs_slaughter ? (upcoming?.[0] ?? null) : null;
  const noSlaughter = product.needs_slaughter && upcoming !== undefined && !slaughter;
  const offSeason = !inSeason(product);
  const outOfStock = product.stock <= 0 || noSlaughter || offSeason;
  const ratingCount = product.rating_count ?? 0;

  const add = () => {
    cartStore.add({
      productId: product.id,
      name: productDisplayName(product),
      price,
      unit: product.unit,
      imageUrl: product.image_url,
    });
    toast.success(`${product.name} ajouté au panier`);
  };

  return (
    <article className="group flex h-full min-w-0 flex-col rounded-md bg-card p-2.5 transition-shadow hover:shadow-elevated sm:p-3">
      <Link to="/products/$slug" params={{ slug: product.slug }} className="block min-w-0">
        <div className="image-zoom relative aspect-square overflow-hidden rounded-md bg-warm">
          {img ? (
            <img
              src={img}
              alt={product.name}
              loading="lazy"
              width={1024}
              height={1024}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
              {product.name}
            </div>
          )}
          {product.is_featured && (
            <span className="absolute left-2 top-2 rounded-sm bg-background/90 px-2 py-1 text-[9px] font-semibold uppercase backdrop-blur">
              Coup de cœur
            </span>
          )}
          {isSeasonal(product) && !offSeason && (
            <span className="absolute bottom-2 left-2 rounded-sm bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
              De saison
            </span>
          )}
          {promo && (
            <span className="absolute right-2 top-2 rounded-sm bg-destructive px-2 py-1 text-[10px] font-semibold text-destructive-foreground">
              -{promoPercent(product)} %
            </span>
          )}
        </div>

        <h3 className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm leading-5 group-hover:text-primary">
          {product.name}
        </h3>
        {product.variant_label && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Format : <span className="font-medium text-foreground">{product.variant_label}</span>
          </p>
        )}
      </Link>

      {ratingCount > 0 && (
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          hash="avis"
          className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <Stars rating={product.rating_avg ?? 0} />
          <span className="tabular-nums">{ratingCount}</span>
        </Link>
      )}

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
        <span
          className={`text-base font-semibold tabular-nums sm:text-lg ${promo ? "text-destructive" : ""}`}
        >
          {formatPrice(price)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          / {product.unit}
          {product.sold_by_weight && " · au poids réel"}
        </span>
      </div>
      {promo && (
        <p className="text-[11px] text-muted-foreground">
          Prix habituel :{" "}
          <span className="line-through tabular-nums">{formatPrice(Number(product.price))}</span>
          {product.discount_label && (
            <span className="ml-1 font-medium text-destructive">· {product.discount_label}</span>
          )}
        </p>
      )}

      <div className="mt-1.5 text-[11px] leading-4">
        {offSeason ? (
          <p className="font-medium text-muted-foreground">
            Hors saison{backInLabel(product) ? ` · ${backInLabel(product)}` : ""}
          </p>
        ) : noSlaughter ? (
          <p className="font-medium text-muted-foreground">Prochain abattage bientôt programmé</p>
        ) : outOfStock ? (
          <p className="font-medium text-destructive">Actuellement indisponible</p>
        ) : (
          <>
            <p className="text-muted-foreground">
              {slaughter ? "Abattage du " : "Livraison dès le "}
              <span className="font-medium text-foreground">
                {slaughter
                  ? formatSlaughterDay(slaughter.day)
                  : formatLongDate(deliveryWindow().start)}
              </span>
            </p>
            {product.stock <= LOW_STOCK_THRESHOLD && (
              <p className="font-medium text-destructive">Plus que {product.stock} en stock</p>
            )}
          </>
        )}
      </div>

      <div className="flex-1" />
      <Button
        size="sm"
        variant={outOfStock ? "outline" : "default"}
        className="mt-3 w-full"
        disabled={outOfStock}
        onClick={add}
      >
        <ShoppingCart />{" "}
        {offSeason
          ? "Hors saison"
          : noSlaughter
            ? "Bientôt disponible"
            : outOfStock
              ? "Épuisé"
              : "Ajouter au panier"}
      </Button>
    </article>
  );
}
