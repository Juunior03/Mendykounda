/**
 * Reusable product card — editorial style with hover image zoom.
 */
import { Link } from "@tanstack/react-router";
import type { Product } from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import { resolveProductImage } from "@/lib/product-images";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cartStore } from "@/lib/cart";

export function ProductCard({ product }: { product: Product }) {
  const img = resolveProductImage(product.image_url);
  const hasPromo = product.discount_price != null && Number(product.discount_price) < Number(product.price);
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
            height={1280}
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
        {hasPromo && (
          <span className="absolute right-2 top-2 rounded-sm bg-accent px-2 py-1 text-[10px] font-semibold text-accent-foreground">
            {product.discount_label || "Promo"}
          </span>
        )}
        {product.stock === 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-foreground/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-background">
            Épuisé
          </span>
        )}
      </div>
      <div className="mt-3 min-w-0">
        <h3 className="truncate text-sm font-medium group-hover:text-primary">
          {product.name}
        </h3>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1 text-sm font-semibold tabular-nums text-foreground sm:text-base">
          {hasPromo ? (
            <>
              <span className="text-destructive">{formatPrice(Number(product.discount_price))}</span>
              <span className="text-xs font-normal text-muted-foreground line-through">{formatPrice(Number(product.price))}</span>
            </>
          ) : (
            formatPrice(Number(product.price))
          )}
          <span className="text-[10px] font-normal text-muted-foreground">/ {product.unit}</span>
        </p>
      </div>
      </Link>
      <Button size="sm" className="mt-3 w-full opacity-100 sm:opacity-0 sm:group-hover:opacity-100" disabled={product.stock === 0} onClick={() => cartStore.add({ productId: product.id, name: product.name, price: hasPromo ? Number(product.discount_price) : Number(product.price), unit: product.unit, imageUrl: product.image_url })}><ShoppingCart /> {product.stock === 0 ? "Épuisé" : "Ajouter"}</Button>
    </article>
  );
}
