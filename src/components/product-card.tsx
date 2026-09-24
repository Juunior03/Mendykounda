/**
 * Reusable product card — editorial style with hover image zoom.
 */
import { Link } from "@tanstack/react-router";
import type { Product } from "@/lib/queries";
import { formatPrice } from "@/lib/format";
import { resolveProductImage } from "@/lib/product-images";

export function ProductCard({ product }: { product: Product }) {
  const img = resolveProductImage(product.image_url);
  const hasPromo = product.discount_price != null && Number(product.discount_price) < Number(product.price);
  return (
    <Link
      to="/products/$slug"
      params={{ slug: product.slug }}
      className="group block fade-in-up"
    >
      <div className="image-zoom relative aspect-[4/5] overflow-hidden rounded-lg bg-warm">
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
          <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider backdrop-blur">
            Coup de cœur
          </span>
        )}
        {hasPromo && (
          <span className="absolute left-3 bottom-3 rounded-full bg-destructive px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-destructive-foreground">
            {product.discount_label || "Promo"}
          </span>
        )}
        {product.stock === 0 && (
          <span className="absolute right-3 top-3 rounded-full bg-foreground/90 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-background">
            Épuisé
          </span>
        )}
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium tracking-tight group-hover:text-primary">
          {product.name}
        </h3>
        <p className="text-sm tabular-nums text-foreground">
          {hasPromo ? (
            <>
              <span className="text-destructive">{formatPrice(Number(product.discount_price))}</span>
              <span className="ml-1 text-xs text-muted-foreground line-through">{formatPrice(Number(product.price))}</span>
            </>
          ) : (
            formatPrice(Number(product.price))
          )}
          <span className="ml-1 text-xs text-muted-foreground">/ {product.unit}</span>
        </p>
      </div>
    </Link>
  );
}
