/**
 * Shared TanStack Query factories. Centralised so cache keys stay
 * consistent between loaders and components.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
}

export interface Product {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  stock: number;
  unit: string;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  discount_price: number | null;
  discount_label: string | null;
  /** Formats d'un même produit (ex. groupe « cochon-de-lait » : « Sur pied » / « En viande »). */
  variant_group: string | null;
  variant_label: string | null;
  /** Viande livrée à partir du prochain jour d'abattage. */
  needs_slaughter: boolean;
  /** Mois de disponibilité (1 à 12), null = toute l'année. */
  season_months: number[] | null;
  /** Prix au kilo, montant final selon le poids pesé. */
  sold_by_weight: boolean;
  /** Note moyenne et nombre d'avis (listes produits uniquement). */
  rating_avg?: number;
  rating_count?: number;
}

export interface Review {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

/** Nom affiché avec le format, ex. « Cochon de lait — Sur pied » (comme dans place_order). */
export const productDisplayName = (p: Pick<Product, "name" | "variant_label">) =>
  p.variant_label ? `${p.name} — ${p.variant_label}` : p.name;

/* ----- Categories ----- */
export const categoriesQuery = () =>
  queryOptions({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

/* ----- Products list (with optional filters) ----- */
export interface ProductsFilter {
  categorySlug?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "price_asc" | "price_desc" | "name";
  featuredOnly?: boolean;
  includeInactive?: boolean;
}

export const productsQuery = (filter: ProductsFilter = {}) =>
  queryOptions({
    queryKey: ["products", filter],
    queryFn: async (): Promise<Product[]> => {
      let q = supabase.from("products").select("*, categories(slug), reviews(rating)");
      if (!filter.includeInactive) q = q.eq("is_active", true);
      if (filter.featuredOnly) q = q.eq("is_featured", true);
      if (filter.minPrice != null) q = q.gte("price", filter.minPrice);
      if (filter.maxPrice != null) q = q.lte("price", filter.maxPrice);
      if (filter.search) {
        const safeSearch = filter.search.trim().replaceAll(/[,%()]/g, "");
        const searchVariants = [
          ...new Set([
            safeSearch,
            safeSearch.replaceAll(/oe/gi, "œ"),
            safeSearch.replaceAll(/œ/gi, "oe"),
          ]),
        ].filter(Boolean);
        if (searchVariants.length > 0) {
          q = q.or(searchVariants.map((term) => `name.ilike.%${term}%`).join(","));
        }
      }

      switch (filter.sort) {
        case "price_asc":
          q = q.order("price", { ascending: true });
          break;
        case "price_desc":
          q = q.order("price", { ascending: false });
          break;
        case "name":
          q = q.order("name", { ascending: true });
          break;
        default:
          q = q.order("created_at", { ascending: false });
      }

      const { data, error } = await q;
      if (error) throw error;
      type Row = Product & {
        categories: { slug: string } | null;
        reviews: { rating: number }[] | null;
      };
      let rows = (data ?? []) as unknown as Row[];
      if (filter.categorySlug) {
        rows = rows.filter((r) => r.categories?.slug === filter.categorySlug);
      }
      return rows.map(({ reviews, ...r }) => {
        const ratings = reviews ?? [];
        return {
          ...r,
          rating_count: ratings.length,
          rating_avg: ratings.length
            ? ratings.reduce((sum, x) => sum + x.rating, 0) / ratings.length
            : 0,
        };
      });
    },
  });

export const productBySlugQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug],
    queryFn: async (): Promise<Product | null> => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

/** Les formats actifs d'un même groupe, pour le sélecteur de la fiche produit. */
export const productVariantsQuery = (group: string) =>
  queryOptions({
    queryKey: ["product-variants", group],
    queryFn: async (): Promise<Product[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("variant_group", group)
        .eq("is_active", true)
        .order("price");
      if (error) throw error;
      return data ?? [];
    },
  });

/* ----- Reviews ----- */
export const reviewsByProductQuery = (productId: string) =>
  queryOptions({
    queryKey: ["reviews", productId],
    queryFn: async (): Promise<Review[]> => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
