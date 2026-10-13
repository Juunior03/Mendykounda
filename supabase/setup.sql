-- =========================================================
-- MendyKounda : installation complète de la base sur un projet Supabase vierge.
-- À coller une seule fois dans Supabase > SQL Editor > New query, puis "Run".
-- Contenu = les migrations de supabase/migrations/, dans l'ordre.
-- =========================================================

-- ---------- 20260502125301_8e3eeea1-3cab-4da9-bf1d-cd79f7531a87.sql ----------

-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'customer');
CREATE TYPE public.order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('unpaid', 'paid', 'refunded', 'failed');

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- USER ROLES (separate table for security)
-- =========================================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================================================
-- CATEGORIES
-- =========================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- PRODUCTS
-- =========================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  unit TEXT NOT NULL DEFAULT 'unit', -- e.g. 'kg', 'douzaine', 'L'
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_active ON public.products(is_active);

-- =========================================================
-- REVIEWS
-- =========================================================
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, user_id)
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_reviews_product ON public.reviews(product_id);

-- =========================================================
-- ORDERS
-- =========================================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  status order_status NOT NULL DEFAULT 'pending',
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  stripe_session_id TEXT UNIQUE,
  shipping_full_name TEXT NOT NULL,
  shipping_phone TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  shipping_city TEXT NOT NULL,
  shipping_postal_code TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);

-- =========================================================
-- ORDER ITEMS
-- =========================================================
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL, -- snapshot
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_order_items_order ON public.order_items(order_id);

-- =========================================================
-- TRIGGERS: updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- TRIGGER: auto-create profile + customer role on signup
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- RLS POLICIES
-- =========================================================

-- PROFILES
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- USER ROLES
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- CATEGORIES (public read, admin write)
CREATE POLICY "Anyone views categories" ON public.categories
  FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.categories
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PRODUCTS (public read active, admin manage all)
CREATE POLICY "Anyone views active products" ON public.products
  FOR SELECT USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage products" ON public.products
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- REVIEWS (public read, authenticated users write own)
CREATE POLICY "Anyone views reviews" ON public.reviews
  FOR SELECT USING (true);
CREATE POLICY "Authenticated users create own reviews" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own reviews" ON public.reviews
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own reviews" ON public.reviews
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins delete any review" ON public.reviews
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- ORDERS
CREATE POLICY "Users view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all orders" ON public.orders
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users create own orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update orders" ON public.orders
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- ORDER ITEMS
CREATE POLICY "Users view own order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid())
  );
CREATE POLICY "Admins view all order items" ON public.order_items
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users create own order items" ON public.order_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid())
  );


-- ---------- 20260502125314_3553faf0-a36f-4124-9f1e-eb1efaa1a585.sql ----------

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- ---------- 20260505141844_b500b8eb-7cee-4313-a425-3c072fd700ec.sql ----------
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;

-- ---------- 20260506081529_221b1adf-6968-47d0-a1b1-d14e7d259e96.sql ----------

-- Messages table for customer ↔ admin chat
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  sender_id UUID NOT NULL,
  is_from_admin BOOLEAN NOT NULL DEFAULT false,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_user_id ON public.messages(user_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users send messages in own thread"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND (
      (auth.uid() = user_id AND is_from_admin = false)
      OR (public.has_role(auth.uid(), 'admin') AND is_from_admin = true)
    )
  );

CREATE POLICY "Recipients mark messages read"
  ON public.messages FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read product images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "Admins upload product images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update product images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete product images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));


-- ---------- 20260507080444_977d166f-e522-406c-a6b1-9ce153a30353.sql ----------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS discount_price numeric,
  ADD COLUMN IF NOT EXISTS discount_label text;

CREATE POLICY "Admins delete messages"
ON public.messages
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));


-- ---------- 20261012090000_secure_place_order.sql ----------
-- =========================================================
-- Sécurisation des commandes : les prix et le total sont calculés en base.
--
-- Avant : le navigateur insérait lui-même orders.total_amount et
-- order_items.unit_price, donc un client pouvait commander à 1 FCFA.
-- Après : le client appelle place_order() avec uniquement les produits et
-- quantités ; la fonction relit les prix dans public.products.
-- =========================================================

CREATE OR REPLACE FUNCTION public.place_order(_items jsonb, _shipping jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET client_min_messages = warning
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _total numeric(10,2);
  _invalid text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e->>'quantity', '') !~ '^[0-9]{1,4}$'
  ) THEN
    RAISE EXCEPTION 'Panier invalide' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(_shipping->>'full_name', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'phone', ''))) < 6
     OR length(btrim(coalesce(_shipping->>'address', ''))) < 4
     OR length(btrim(coalesce(_shipping->>'city', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'postal_code', ''))) < 3 THEN
    RAISE EXCEPTION 'Informations de livraison incomplètes' USING ERRCODE = '22023';
  END IF;

  -- Lignes demandées, regroupées par produit (un même produit envoyé deux fois
  -- est additionné). Quantité totale par produit : entre 1 et 1000.
  DROP TABLE IF EXISTS _req;
  CREATE TEMP TABLE _req ON COMMIT DROP AS
  SELECT (e->>'product_id')::uuid AS product_id,
         SUM((e->>'quantity')::int)::int AS quantity
  FROM jsonb_array_elements(_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _req WHERE quantity < 1 OR quantity > 1000) THEN
    RAISE EXCEPTION 'Quantité invalide' USING ERRCODE = '22023';
  END IF;

  -- Chaque produit doit exister, être en vente et avoir assez de stock.
  SELECT string_agg(COALESCE(p.name, 'produit inconnu'), ', ')
  INTO _invalid
  FROM _req r
  LEFT JOIN products p ON p.id = r.product_id AND p.is_active
  WHERE p.id IS NULL OR p.stock < r.quantity;

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Produit indisponible ou stock insuffisant : %', _invalid
      USING ERRCODE = '22023';
  END IF;

  -- Prix effectif : la promo si elle est inférieure au prix normal.
  SELECT SUM(r.quantity * CASE
           WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
           THEN p.discount_price ELSE p.price END)
  INTO _total
  FROM _req r JOIN products p ON p.id = r.product_id;

  INSERT INTO orders (
    user_id, total_amount,
    shipping_full_name, shipping_phone, shipping_address,
    shipping_city, shipping_postal_code, notes
  ) VALUES (
    _user_id, _total,
    left(btrim(_shipping->>'full_name'), 120),
    left(btrim(_shipping->>'phone'), 30),
    left(btrim(_shipping->>'address'), 200),
    left(btrim(_shipping->>'city'), 80),
    left(btrim(_shipping->>'postal_code'), 20),
    NULLIF(left(btrim(_shipping->>'notes'), 500), '')
  )
  RETURNING id INTO _order_id;

  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
  SELECT _order_id, p.id, p.name, r.quantity,
         CASE WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
              THEN p.discount_price ELSE p.price END
  FROM _req r JOIN products p ON p.id = r.product_id;

  RETURN _order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb) TO authenticated;

-- Plus aucune écriture directe des clients : tout passe par place_order().
DROP POLICY IF EXISTS "Users create own orders" ON public.orders;
DROP POLICY IF EXISTS "Users create own order items" ON public.order_items;

-- ---------- 20261013090000_order_stock_and_tracking.sql ----------
-- =========================================================
-- Stock et suivi des commandes
--
-- 1. place_order() décrémente le stock (lignes produits verrouillées pour
--    éviter de vendre deux fois le dernier article).
-- 2. Passer une commande à « cancelled » remet les articles en stock ;
--    la sortir de « cancelled » les reprend (refusé si stock insuffisant).
-- 3. Dates de suivi (préparation, expédition, livraison, annulation)
--    remplies automatiquement au changement de statut.
-- 4. cancel_order() : le client annule lui-même tant que rien n'est expédié.
-- =========================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS processing_at timestamptz,
  ADD COLUMN IF NOT EXISTS shipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- ---------------------------------------------------------
-- place_order : identique à la version précédente + décrément du stock
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_order(_items jsonb, _shipping jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET client_min_messages = warning
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _total numeric(10,2);
  _invalid text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e->>'quantity', '') !~ '^[0-9]{1,4}$'
  ) THEN
    RAISE EXCEPTION 'Panier invalide' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(_shipping->>'full_name', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'phone', ''))) < 6
     OR length(btrim(coalesce(_shipping->>'address', ''))) < 4
     OR length(btrim(coalesce(_shipping->>'city', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'postal_code', ''))) < 3 THEN
    RAISE EXCEPTION 'Informations de livraison incomplètes' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS _req;
  CREATE TEMP TABLE _req ON COMMIT DROP AS
  SELECT (e->>'product_id')::uuid AS product_id,
         SUM((e->>'quantity')::int)::int AS quantity
  FROM jsonb_array_elements(_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _req WHERE quantity < 1 OR quantity > 1000) THEN
    RAISE EXCEPTION 'Quantité invalide' USING ERRCODE = '22023';
  END IF;

  -- Verrouille les produits concernés (toujours dans le même ordre pour
  -- éviter les interblocages) : deux commandes simultanées ne peuvent pas
  -- se partager le même stock.
  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM _req)
  ORDER BY id
  FOR UPDATE;

  SELECT string_agg(COALESCE(p.name, 'produit inconnu'), ', ')
  INTO _invalid
  FROM _req r
  LEFT JOIN products p ON p.id = r.product_id AND p.is_active
  WHERE p.id IS NULL OR p.stock < r.quantity;

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Produit indisponible ou stock insuffisant : %', _invalid
      USING ERRCODE = '22023';
  END IF;

  SELECT SUM(r.quantity * CASE
           WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
           THEN p.discount_price ELSE p.price END)
  INTO _total
  FROM _req r JOIN products p ON p.id = r.product_id;

  INSERT INTO orders (
    user_id, total_amount,
    shipping_full_name, shipping_phone, shipping_address,
    shipping_city, shipping_postal_code, notes
  ) VALUES (
    _user_id, _total,
    left(btrim(_shipping->>'full_name'), 120),
    left(btrim(_shipping->>'phone'), 30),
    left(btrim(_shipping->>'address'), 200),
    left(btrim(_shipping->>'city'), 80),
    left(btrim(_shipping->>'postal_code'), 20),
    NULLIF(left(btrim(_shipping->>'notes'), 500), '')
  )
  RETURNING id INTO _order_id;

  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
  SELECT _order_id, p.id, p.name, r.quantity,
         CASE WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
              THEN p.discount_price ELSE p.price END
  FROM _req r JOIN products p ON p.id = r.product_id;

  UPDATE products p
  SET stock = p.stock - r.quantity
  FROM _req r
  WHERE p.id = r.product_id;

  RETURN _order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb) TO authenticated;

-- ---------------------------------------------------------
-- Changement de statut : stock + dates de suivi
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _short text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    -- Annulation : on remet les articles en stock.
    UPDATE products p
    SET stock = p.stock + i.qty
    FROM (
      SELECT product_id, SUM(quantity)::int AS qty
      FROM order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id
    ) i
    WHERE p.id = i.product_id;
    NEW.cancelled_at := now();

  ELSIF OLD.status = 'cancelled' THEN
    -- Réactivation d'une commande annulée : on reprend le stock.
    PERFORM 1 FROM products
    WHERE id IN (SELECT product_id FROM order_items WHERE order_id = NEW.id)
    ORDER BY id
    FOR UPDATE;

    SELECT string_agg(p.name, ', ') INTO _short
    FROM (
      SELECT product_id, SUM(quantity)::int AS qty
      FROM order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id
    ) i
    JOIN products p ON p.id = i.product_id
    WHERE p.stock < i.qty;

    IF _short IS NOT NULL THEN
      RAISE EXCEPTION 'Stock insuffisant pour réactiver la commande : %', _short
        USING ERRCODE = '22023';
    END IF;

    UPDATE products p
    SET stock = p.stock - i.qty
    FROM (
      SELECT product_id, SUM(quantity)::int AS qty
      FROM order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id
    ) i
    WHERE p.id = i.product_id;
    NEW.cancelled_at := NULL;
  END IF;

  IF NEW.status = 'processing' THEN
    NEW.processing_at := coalesce(NEW.processing_at, now());
  ELSIF NEW.status = 'shipped' THEN
    NEW.processing_at := coalesce(NEW.processing_at, now());
    NEW.shipped_at := coalesce(NEW.shipped_at, now());
  ELSIF NEW.status = 'delivered' THEN
    NEW.processing_at := coalesce(NEW.processing_at, now());
    NEW.shipped_at := coalesce(NEW.shipped_at, now());
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.orders_on_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_status_change ON public.orders;
CREATE TRIGGER trg_orders_status_change
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_on_status_change();

-- ---------------------------------------------------------
-- Annulation par le client (avant expédition uniquement)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _order FROM orders
  WHERE id = _order_id AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable' USING ERRCODE = '22023';
  END IF;

  IF _order.status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'Cette commande ne peut plus être annulée' USING ERRCODE = '22023';
  END IF;

  IF _order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Commande déjà payée : contactez-nous pour l''annuler' USING ERRCODE = '22023';
  END IF;

  UPDATE orders SET status = 'cancelled' WHERE id = _order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid) TO authenticated;

-- ---------- 20261014090000_wave_payment.sql ----------
-- =========================================================
-- Paiement Wave
--
-- 1. orders.payment_method ('cash_on_delivery' | 'wave'),
--    orders.payment_session_id (session Wave « cos-… »), orders.paid_at.
-- 2. place_order() accepte un 3e paramètre optionnel _payment_method.
-- 3. expire_unpaid_wave_orders() annule (et remet en stock) les commandes
--    Wave jamais payées, à planifier avec pg_cron (voir docs/PAIEMENT-WAVE.md).
--
-- Le passage à payment_status = 'paid' est fait par les Edge Functions
-- (clé service_role) après vérification auprès de l'API Wave, ou par un admin.
-- =========================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash_on_delivery',
  ADD COLUMN IF NOT EXISTS payment_session_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash_on_delivery', 'wave'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_session
  ON public.orders(payment_session_id) WHERE payment_session_id IS NOT NULL;

-- L'ancienne signature à 2 paramètres est remplacée (le 3e a une valeur par défaut).
DROP FUNCTION IF EXISTS public.place_order(jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _shipping jsonb,
  _payment_method text DEFAULT 'cash_on_delivery'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET client_min_messages = warning
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _total numeric(10,2);
  _invalid text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  IF _payment_method IS NULL OR _payment_method NOT IN ('cash_on_delivery', 'wave') THEN
    RAISE EXCEPTION 'Mode de paiement invalide' USING ERRCODE = '22023';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e->>'quantity', '') !~ '^[0-9]{1,4}$'
  ) THEN
    RAISE EXCEPTION 'Panier invalide' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(_shipping->>'full_name', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'phone', ''))) < 6
     OR length(btrim(coalesce(_shipping->>'address', ''))) < 4
     OR length(btrim(coalesce(_shipping->>'city', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'postal_code', ''))) < 3 THEN
    RAISE EXCEPTION 'Informations de livraison incomplètes' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS _req;
  CREATE TEMP TABLE _req ON COMMIT DROP AS
  SELECT (e->>'product_id')::uuid AS product_id,
         SUM((e->>'quantity')::int)::int AS quantity
  FROM jsonb_array_elements(_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _req WHERE quantity < 1 OR quantity > 1000) THEN
    RAISE EXCEPTION 'Quantité invalide' USING ERRCODE = '22023';
  END IF;

  -- Verrouille les produits concernés (toujours dans le même ordre pour
  -- éviter les interblocages) : deux commandes simultanées ne peuvent pas
  -- se partager le même stock.
  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM _req)
  ORDER BY id
  FOR UPDATE;

  SELECT string_agg(COALESCE(p.name, 'produit inconnu'), ', ')
  INTO _invalid
  FROM _req r
  LEFT JOIN products p ON p.id = r.product_id AND p.is_active
  WHERE p.id IS NULL OR p.stock < r.quantity;

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Produit indisponible ou stock insuffisant : %', _invalid
      USING ERRCODE = '22023';
  END IF;

  SELECT SUM(r.quantity * CASE
           WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
           THEN p.discount_price ELSE p.price END)
  INTO _total
  FROM _req r JOIN products p ON p.id = r.product_id;

  INSERT INTO orders (
    user_id, total_amount, payment_method,
    shipping_full_name, shipping_phone, shipping_address,
    shipping_city, shipping_postal_code, notes
  ) VALUES (
    _user_id, _total, _payment_method,
    left(btrim(_shipping->>'full_name'), 120),
    left(btrim(_shipping->>'phone'), 30),
    left(btrim(_shipping->>'address'), 200),
    left(btrim(_shipping->>'city'), 80),
    left(btrim(_shipping->>'postal_code'), 20),
    NULLIF(left(btrim(_shipping->>'notes'), 500), '')
  )
  RETURNING id INTO _order_id;

  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
  SELECT _order_id, p.id, p.name, r.quantity,
         CASE WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
              THEN p.discount_price ELSE p.price END
  FROM _req r JOIN products p ON p.id = r.product_id;

  UPDATE products p
  SET stock = p.stock - r.quantity
  FROM _req r
  WHERE p.id = r.product_id;

  RETURN _order_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) TO authenticated;

-- ---------------------------------------------------------
-- Commandes Wave abandonnées : annulation automatique
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_unpaid_wave_orders(_older_than interval DEFAULT interval '2 hours')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  -- Le trigger orders_on_status_change remet les articles en stock.
  UPDATE orders
  SET status = 'cancelled'
  WHERE payment_method = 'wave'
    AND payment_status <> 'paid'
    AND status = 'pending'
    AND created_at < now() - _older_than;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

-- Réservé à pg_cron / service_role : pas d'appel depuis le navigateur.
REVOKE EXECUTE ON FUNCTION public.expire_unpaid_wave_orders(interval) FROM PUBLIC, anon, authenticated;

-- ---------- 20261015090000_order_notifications.sql ----------
-- =========================================================
-- Notifications de commande (e-mail et SMS via Brevo)
--
-- Dates d'envoi des confirmations : l'Edge Function order-notify les
-- « réserve » avant d'envoyer (UPDATE … WHERE … IS NULL), ce qui garantit
-- un seul e-mail et un seul SMS par commande, même si la fonction est
-- appelée plusieurs fois.
-- =========================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_sms_sent_at timestamptz;

-- ---------- 20261016090000_delivery_zones.sql ----------
-- =========================================================
-- Zones de livraison
--
-- La boutique ne livre que dans les zones actives (au départ : les 30
-- communes de la région de Ziguinchor). L'admin peut en ouvrir, en fermer
-- ou en ajouter depuis l'onglet « Livraison ».
-- place_order() refuse toute commande hors zone active et enregistre la
-- commune de la zone comme ville de livraison. Le code postal devient
-- facultatif.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region text NOT NULL DEFAULT 'Ziguinchor',
  department text NOT NULL,
  commune text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region, department, commune)
);
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone views delivery zones" ON public.delivery_zones;
CREATE POLICY "Anyone views delivery zones" ON public.delivery_zones
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage delivery zones" ON public.delivery_zones;
CREATE POLICY "Admins manage delivery zones" ON public.delivery_zones
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Région de Ziguinchor : 3 départements, 30 communes.
INSERT INTO public.delivery_zones (department, commune, sort_order) VALUES
  ('Ziguinchor', 'Ziguinchor', 0),
  ('Ziguinchor', 'Adéane', 1),
  ('Ziguinchor', 'Boutoupa-Camaracounda', 2),
  ('Ziguinchor', 'Enampore', 3),
  ('Ziguinchor', 'Niaguis', 4),
  ('Ziguinchor', 'Nyassia', 5),
  ('Bignona', 'Bignona', 100),
  ('Bignona', 'Balinghore', 101),
  ('Bignona', 'Coubalan', 102),
  ('Bignona', 'Diégoune', 103),
  ('Bignona', 'Diouloulou', 104),
  ('Bignona', 'Djibidione', 105),
  ('Bignona', 'Djinaky', 106),
  ('Bignona', 'Kafountine', 107),
  ('Bignona', 'Kartiack', 108),
  ('Bignona', 'Kataba 1', 109),
  ('Bignona', 'Mangagoulack', 110),
  ('Bignona', 'Mlomp', 111),
  ('Bignona', 'Niamone', 112),
  ('Bignona', 'Oulampane', 113),
  ('Bignona', 'Ouonck', 114),
  ('Bignona', 'Sindian', 115),
  ('Bignona', 'Suelle', 116),
  ('Bignona', 'Tenghory', 117),
  ('Bignona', 'Thionck-Essyl', 118),
  ('Oussouye', 'Oussouye', 200),
  ('Oussouye', 'Diembéring', 201),
  ('Oussouye', 'Mlomp', 202),
  ('Oussouye', 'Oukout', 203),
  ('Oussouye', 'Santhiaba Manjack', 204)
ON CONFLICT (region, department, commune) DO NOTHING;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _shipping jsonb,
  _payment_method text DEFAULT 'cash_on_delivery'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET client_min_messages = warning
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _total numeric(10,2);
  _invalid text;
  _zone delivery_zones%ROWTYPE;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  IF _payment_method IS NULL OR _payment_method NOT IN ('cash_on_delivery', 'wave') THEN
    RAISE EXCEPTION 'Mode de paiement invalide' USING ERRCODE = '22023';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e->>'quantity', '') !~ '^[0-9]{1,4}$'
  ) THEN
    RAISE EXCEPTION 'Panier invalide' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(_shipping->>'full_name', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'phone', ''))) < 6
     OR length(btrim(coalesce(_shipping->>'address', ''))) < 4 THEN
    RAISE EXCEPTION 'Informations de livraison incomplètes' USING ERRCODE = '22023';
  END IF;

  -- Zone de livraison : doit exister et être ouverte. La ville enregistrée
  -- est celle de la zone (et non un texte libre envoyé par le navigateur).
  IF coalesce(_shipping->>'zone_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Choisissez votre commune de livraison' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _zone FROM delivery_zones
  WHERE id = (_shipping->>'zone_id')::uuid AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nous ne livrons pas encore cette zone' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS _req;
  CREATE TEMP TABLE _req ON COMMIT DROP AS
  SELECT (e->>'product_id')::uuid AS product_id,
         SUM((e->>'quantity')::int)::int AS quantity
  FROM jsonb_array_elements(_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _req WHERE quantity < 1 OR quantity > 1000) THEN
    RAISE EXCEPTION 'Quantité invalide' USING ERRCODE = '22023';
  END IF;

  -- Verrouille les produits concernés (toujours dans le même ordre pour
  -- éviter les interblocages) : deux commandes simultanées ne peuvent pas
  -- se partager le même stock.
  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM _req)
  ORDER BY id
  FOR UPDATE;

  SELECT string_agg(COALESCE(p.name, 'produit inconnu'), ', ')
  INTO _invalid
  FROM _req r
  LEFT JOIN products p ON p.id = r.product_id AND p.is_active
  WHERE p.id IS NULL OR p.stock < r.quantity;

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Produit indisponible ou stock insuffisant : %', _invalid
      USING ERRCODE = '22023';
  END IF;

  SELECT SUM(r.quantity * CASE
           WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
           THEN p.discount_price ELSE p.price END)
  INTO _total
  FROM _req r JOIN products p ON p.id = r.product_id;

  INSERT INTO orders (
    user_id, total_amount, payment_method, delivery_zone_id,
    shipping_full_name, shipping_phone, shipping_address,
    shipping_city, shipping_postal_code, notes
  ) VALUES (
    _user_id, _total, _payment_method, _zone.id,
    left(btrim(_shipping->>'full_name'), 120),
    left(btrim(_shipping->>'phone'), 30),
    left(btrim(_shipping->>'address'), 200),
    -- Deux communes portent le même nom (Mlomp) : on précise le département.
    CASE WHEN EXISTS (
      SELECT 1 FROM delivery_zones z WHERE z.commune = _zone.commune AND z.id <> _zone.id
    ) THEN _zone.commune || ' (' || _zone.department || ')' ELSE _zone.commune END,
    -- Le code postal est facultatif au Sénégal.
    left(btrim(coalesce(_shipping->>'postal_code', '')), 20),
    NULLIF(left(btrim(_shipping->>'notes'), 500), '')
  )
  RETURNING id INTO _order_id;

  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
  SELECT _order_id, p.id, p.name, r.quantity,
         CASE WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
              THEN p.discount_price ELSE p.price END
  FROM _req r JOIN products p ON p.id = r.product_id;

  UPDATE products p
  SET stock = p.stock - r.quantity
  FROM _req r
  WHERE p.id = r.product_id;

  RETURN _order_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) TO authenticated;

-- ---------- 20261017090000_delivery_fees.sql ----------
-- =========================================================
-- Frais de livraison
--
-- Tarifs (delivery_rates) attribués à chaque commune selon la distance et
-- l'accessibilité :
--   free_from : montant d'articles à partir duquel la livraison est offerte
--               (0 = toujours gratuite, NULL = jamais gratuite) ;
--   brackets  : barème [{"from": montant, "fee": frais}, …] — on applique
--               la ligne au « from » le plus élevé ne dépassant pas le montant.
-- place_order() calcule les frais en base et enregistre
--   orders.delivery_fee, et orders.total_amount = articles + livraison.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.delivery_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  free_from numeric(10,2) CHECK (free_from IS NULL OR free_from >= 0),
  brackets jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(brackets) = 'array'),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.delivery_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone views delivery rates" ON public.delivery_rates;
CREATE POLICY "Anyone views delivery rates" ON public.delivery_rates
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage delivery rates" ON public.delivery_rates;
CREATE POLICY "Admins manage delivery rates" ON public.delivery_rates
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS rate_id uuid REFERENCES public.delivery_rates(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0);

-- Tarifs de départ. Les frais du tarif « Hors ville » sont des EXEMPLES
-- à ajuster dans l'admin (onglet Livraison).
INSERT INTO public.delivery_rates (name, free_from, brackets, sort_order) VALUES
  ('Ville de Ziguinchor', 0, '[]', 0),
  ('Hors ville de Ziguinchor', 15000,
   '[{"from": 0, "fee": 2000}, {"from": 5000, "fee": 1500}, {"from": 10000, "fee": 1000}]', 1)
ON CONFLICT (name) DO NOTHING;

UPDATE public.delivery_zones z
SET rate_id = r.id
FROM public.delivery_rates r
WHERE z.rate_id IS NULL
  AND r.name = CASE
    WHEN z.department = 'Ziguinchor' AND z.commune = 'Ziguinchor' THEN 'Ville de Ziguinchor'
    ELSE 'Hors ville de Ziguinchor'
  END;

-- Calcul des frais (aussi utilisé pour vérifier l'affichage côté site).
CREATE OR REPLACE FUNCTION public.delivery_fee(_zone_id uuid, _subtotal numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN r.id IS NULL THEN 0
    WHEN r.free_from IS NOT NULL AND _subtotal >= r.free_from THEN 0
    ELSE coalesce((
      SELECT (b->>'fee')::numeric
      FROM jsonb_array_elements(r.brackets) b
      WHERE jsonb_typeof(b->'from') = 'number'
        AND jsonb_typeof(b->'fee') = 'number'
        AND (b->>'from')::numeric <= _subtotal
      ORDER BY (b->>'from')::numeric DESC
      LIMIT 1
    ), 0)
  END
  FROM delivery_zones z
  LEFT JOIN delivery_rates r ON r.id = z.rate_id
  WHERE z.id = _zone_id
$$;

GRANT EXECUTE ON FUNCTION public.delivery_fee(uuid, numeric) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _shipping jsonb,
  _payment_method text DEFAULT 'cash_on_delivery'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET client_min_messages = warning
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _total numeric(10,2);
  _fee numeric(10,2);
  _invalid text;
  _zone delivery_zones%ROWTYPE;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  IF _payment_method IS NULL OR _payment_method NOT IN ('cash_on_delivery', 'wave') THEN
    RAISE EXCEPTION 'Mode de paiement invalide' USING ERRCODE = '22023';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e->>'quantity', '') !~ '^[0-9]{1,4}$'
  ) THEN
    RAISE EXCEPTION 'Panier invalide' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(_shipping->>'full_name', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'phone', ''))) < 6
     OR length(btrim(coalesce(_shipping->>'address', ''))) < 4 THEN
    RAISE EXCEPTION 'Informations de livraison incomplètes' USING ERRCODE = '22023';
  END IF;

  -- Zone de livraison : doit exister et être ouverte. La ville enregistrée
  -- est celle de la zone (et non un texte libre envoyé par le navigateur).
  IF coalesce(_shipping->>'zone_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Choisissez votre commune de livraison' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _zone FROM delivery_zones
  WHERE id = (_shipping->>'zone_id')::uuid AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nous ne livrons pas encore cette zone' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS _req;
  CREATE TEMP TABLE _req ON COMMIT DROP AS
  SELECT (e->>'product_id')::uuid AS product_id,
         SUM((e->>'quantity')::int)::int AS quantity
  FROM jsonb_array_elements(_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _req WHERE quantity < 1 OR quantity > 1000) THEN
    RAISE EXCEPTION 'Quantité invalide' USING ERRCODE = '22023';
  END IF;

  -- Verrouille les produits concernés (toujours dans le même ordre pour
  -- éviter les interblocages) : deux commandes simultanées ne peuvent pas
  -- se partager le même stock.
  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM _req)
  ORDER BY id
  FOR UPDATE;

  SELECT string_agg(COALESCE(p.name, 'produit inconnu'), ', ')
  INTO _invalid
  FROM _req r
  LEFT JOIN products p ON p.id = r.product_id AND p.is_active
  WHERE p.id IS NULL OR p.stock < r.quantity;

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Produit indisponible ou stock insuffisant : %', _invalid
      USING ERRCODE = '22023';
  END IF;

  SELECT SUM(r.quantity * CASE
           WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
           THEN p.discount_price ELSE p.price END)
  INTO _total
  FROM _req r JOIN products p ON p.id = r.product_id;

  -- Frais de livraison selon le tarif de la commune et le montant des articles.
  _fee := delivery_fee(_zone.id, _total);

  INSERT INTO orders (
    user_id, total_amount, delivery_fee, payment_method, delivery_zone_id,
    shipping_full_name, shipping_phone, shipping_address,
    shipping_city, shipping_postal_code, notes
  ) VALUES (
    _user_id, _total + _fee, _fee, _payment_method, _zone.id,
    left(btrim(_shipping->>'full_name'), 120),
    left(btrim(_shipping->>'phone'), 30),
    left(btrim(_shipping->>'address'), 200),
    -- Deux communes portent le même nom (Mlomp) : on précise le département.
    CASE WHEN EXISTS (
      SELECT 1 FROM delivery_zones z WHERE z.commune = _zone.commune AND z.id <> _zone.id
    ) THEN _zone.commune || ' (' || _zone.department || ')' ELSE _zone.commune END,
    -- Le code postal est facultatif au Sénégal.
    left(btrim(coalesce(_shipping->>'postal_code', '')), 20),
    NULLIF(left(btrim(_shipping->>'notes'), 500), '')
  )
  RETURNING id INTO _order_id;

  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
  SELECT _order_id, p.id, p.name, r.quantity,
         CASE WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
              THEN p.discount_price ELSE p.price END
  FROM _req r JOIN products p ON p.id = r.product_id;

  UPDATE products p
  SET stock = p.stock - r.quantity
  FROM _req r
  WHERE p.id = r.product_id;

  RETURN _order_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) TO authenticated;

-- ---------- 20261018090000_zone_delivery_fee.sql ----------
-- =========================================================
-- Frais de livraison simplifiés : un montant fixe par commune
--
-- Chaque commune a :
--   delivery_fee : frais de livraison = coût du transport depuis la ferme
--                  (0 = livraison toujours gratuite, ex. ville de Ziguinchor) ;
--   free_from    : montant d'articles à partir duquel la livraison est
--                  offerte (NULL = jamais offerte).
-- Frais facturés = 0 si articles >= free_from, sinon delivery_fee.
--
-- Remplace les « tarifs à tranches » (delivery_rates) : les valeurs
-- existantes sont reprises, puis la table est supprimée.
-- place_order() est inchangée (elle appelle delivery_fee()).
-- =========================================================

ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  ADD COLUMN IF NOT EXISTS free_from numeric(10,2) DEFAULT 15000 CHECK (free_from IS NULL OR free_from >= 0);

-- Reprise des anciens tarifs, s'ils existent : seuil identique, frais =
-- ceux de la première tranche (à remplacer par le vrai coût du transport).
DO $$
BEGIN
  IF to_regclass('public.delivery_rates') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'delivery_zones' AND column_name = 'rate_id'
     ) THEN
    UPDATE public.delivery_zones z
    SET free_from = r.free_from,
        delivery_fee = CASE
          WHEN r.free_from IS NOT NULL AND r.free_from <= 0 THEN 0
          ELSE coalesce((
            SELECT (b->>'fee')::numeric
            FROM jsonb_array_elements(r.brackets) b
            WHERE jsonb_typeof(b->'fee') = 'number' AND jsonb_typeof(b->'from') = 'number'
            ORDER BY (b->>'from')::numeric
            LIMIT 1
          ), 0)
        END
    FROM public.delivery_rates r
    WHERE r.id = z.rate_id;
  END IF;
END $$;

-- Ville de Ziguinchor : toujours gratuite (qu'il y ait eu des tarifs ou non).
UPDATE public.delivery_zones
SET delivery_fee = 0, free_from = 0
WHERE department = 'Ziguinchor' AND commune = 'Ziguinchor';

ALTER TABLE public.delivery_zones DROP COLUMN IF EXISTS rate_id;
DROP TABLE IF EXISTS public.delivery_rates;

CREATE OR REPLACE FUNCTION public.delivery_fee(_zone_id uuid, _subtotal numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN z.free_from IS NOT NULL AND _subtotal >= z.free_from THEN 0
    ELSE z.delivery_fee
  END
  FROM delivery_zones z
  WHERE z.id = _zone_id
$$;

GRANT EXECUTE ON FUNCTION public.delivery_fee(uuid, numeric) TO anon, authenticated;


-- ---------- 20261019090000_slaughter_days.sql ----------
-- =========================================================
-- Porcs sur pied ou en viande : formats et jours d'abattage
--
-- 1. Formats : plusieurs produits d'un même groupe (variant_group) sont
--    présentés sur une seule fiche avec un sélecteur (variant_label), par
--    exemple « Cochon de lait » : « Sur pied » / « En viande ». Chaque
--    format reste un produit à part entière (prix, stock, unité).
-- 2. Viande à l'abattage (needs_slaughter) : commandable uniquement s'il
--    existe un abattage programmé dont la date limite de commande n'est
--    pas passée. La commande est rattachée à ce jour (orders.slaughter_date)
--    et livrée à partir de ce jour-là.
-- =========================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_group text,
  ADD COLUMN IF NOT EXISTS variant_label text,
  ADD COLUMN IF NOT EXISTS needs_slaughter boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_variant_group
  ON public.products(variant_group) WHERE variant_group IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.slaughter_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day date NOT NULL UNIQUE,
  -- Au-delà, les commandes de viande passent à l'abattage suivant.
  order_deadline timestamptz NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.slaughter_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone views slaughter days" ON public.slaughter_days;
CREATE POLICY "Anyone views slaughter days" ON public.slaughter_days
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage slaughter days" ON public.slaughter_days;
CREATE POLICY "Admins manage slaughter days" ON public.slaughter_days
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.slaughter_days TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.slaughter_days TO authenticated;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS slaughter_date date;

CREATE INDEX IF NOT EXISTS idx_orders_slaughter_date
  ON public.orders(slaughter_date) WHERE slaughter_date IS NOT NULL;

-- place_order : rattache la commande au prochain abattage si elle contient
-- de la viande à l'abattage (le reste est inchangé).
CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _shipping jsonb,
  _payment_method text DEFAULT 'cash_on_delivery'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET client_min_messages = warning
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _total numeric(10,2);
  _fee numeric(10,2);
  _invalid text;
  _zone delivery_zones%ROWTYPE;
  _slaughter date;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  IF _payment_method IS NULL OR _payment_method NOT IN ('cash_on_delivery', 'wave') THEN
    RAISE EXCEPTION 'Mode de paiement invalide' USING ERRCODE = '22023';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e->>'quantity', '') !~ '^[0-9]{1,4}$'
  ) THEN
    RAISE EXCEPTION 'Panier invalide' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(_shipping->>'full_name', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'phone', ''))) < 6
     OR length(btrim(coalesce(_shipping->>'address', ''))) < 4 THEN
    RAISE EXCEPTION 'Informations de livraison incomplètes' USING ERRCODE = '22023';
  END IF;

  -- Zone de livraison : doit exister et être ouverte. La ville enregistrée
  -- est celle de la zone (et non un texte libre envoyé par le navigateur).
  IF coalesce(_shipping->>'zone_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Choisissez votre commune de livraison' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _zone FROM delivery_zones
  WHERE id = (_shipping->>'zone_id')::uuid AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nous ne livrons pas encore cette zone' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS _req;
  CREATE TEMP TABLE _req ON COMMIT DROP AS
  SELECT (e->>'product_id')::uuid AS product_id,
         SUM((e->>'quantity')::int)::int AS quantity
  FROM jsonb_array_elements(_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _req WHERE quantity < 1 OR quantity > 1000) THEN
    RAISE EXCEPTION 'Quantité invalide' USING ERRCODE = '22023';
  END IF;

  -- Verrouille les produits concernés (toujours dans le même ordre pour
  -- éviter les interblocages) : deux commandes simultanées ne peuvent pas
  -- se partager le même stock.
  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM _req)
  ORDER BY id
  FOR UPDATE;

  SELECT string_agg(COALESCE(p.name, 'produit inconnu'), ', ')
  INTO _invalid
  FROM _req r
  LEFT JOIN products p ON p.id = r.product_id AND p.is_active
  WHERE p.id IS NULL OR p.stock < r.quantity;

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Produit indisponible ou stock insuffisant : %', _invalid
      USING ERRCODE = '22023';
  END IF;

  -- Viande « à l'abattage » : rattachée au prochain abattage dont la date
  -- limite de commande n'est pas passée. Sans abattage programmé, refus.
  IF EXISTS (
    SELECT 1 FROM _req r JOIN products p ON p.id = r.product_id WHERE p.needs_slaughter
  ) THEN
    SELECT day INTO _slaughter FROM slaughter_days
    WHERE order_deadline > now()
    ORDER BY day
    LIMIT 1;

    IF _slaughter IS NULL THEN
      RAISE EXCEPTION 'Aucun abattage programmé pour le moment : retirez la viande de votre panier ou réessayez plus tard'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT SUM(r.quantity * CASE
           WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
           THEN p.discount_price ELSE p.price END)
  INTO _total
  FROM _req r JOIN products p ON p.id = r.product_id;

  -- Frais de livraison selon le tarif de la commune et le montant des articles.
  _fee := delivery_fee(_zone.id, _total);

  INSERT INTO orders (
    user_id, total_amount, delivery_fee, payment_method, delivery_zone_id, slaughter_date,
    shipping_full_name, shipping_phone, shipping_address,
    shipping_city, shipping_postal_code, notes
  ) VALUES (
    _user_id, _total + _fee, _fee, _payment_method, _zone.id, _slaughter,
    left(btrim(_shipping->>'full_name'), 120),
    left(btrim(_shipping->>'phone'), 30),
    left(btrim(_shipping->>'address'), 200),
    -- Deux communes portent le même nom (Mlomp) : on précise le département.
    CASE WHEN EXISTS (
      SELECT 1 FROM delivery_zones z WHERE z.commune = _zone.commune AND z.id <> _zone.id
    ) THEN _zone.commune || ' (' || _zone.department || ')' ELSE _zone.commune END,
    -- Le code postal est facultatif au Sénégal.
    left(btrim(coalesce(_shipping->>'postal_code', '')), 20),
    NULLIF(left(btrim(_shipping->>'notes'), 500), '')
  )
  RETURNING id INTO _order_id;

  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
  -- Nom enregistré avec le format (ex. « Cochon de lait — Sur pied »).
  SELECT _order_id, p.id, p.name || coalesce(' — ' || p.variant_label, ''), r.quantity,
         CASE WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
              THEN p.discount_price ELSE p.price END
  FROM _req r JOIN products p ON p.id = r.product_id;

  UPDATE products p
  SET stock = p.stock - r.quantity
  FROM _req r
  WHERE p.id = r.product_id;

  RETURN _order_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) TO authenticated;


-- ---------- 20261020090000_seasonal_products.sql ----------
-- =========================================================
-- Produits de saison
--
-- products.season_months : mois de disponibilité (1 = janvier … 12 =
-- décembre). NULL = disponible toute l'année. Hors saison, le produit
-- reste visible dans la boutique mais ne peut pas être commandé.
-- =========================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS season_months smallint[];

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_season_months_check;
ALTER TABLE public.products ADD CONSTRAINT products_season_months_check CHECK (
  season_months IS NULL
  OR (cardinality(season_months) BETWEEN 1 AND 12
      AND season_months <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[])
);

-- place_order : refuse les produits hors saison (le reste est inchangé).
CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _shipping jsonb,
  _payment_method text DEFAULT 'cash_on_delivery'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET client_min_messages = warning
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _total numeric(10,2);
  _fee numeric(10,2);
  _invalid text;
  _zone delivery_zones%ROWTYPE;
  _slaughter date;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  IF _payment_method IS NULL OR _payment_method NOT IN ('cash_on_delivery', 'wave') THEN
    RAISE EXCEPTION 'Mode de paiement invalide' USING ERRCODE = '22023';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e->>'quantity', '') !~ '^[0-9]{1,4}$'
  ) THEN
    RAISE EXCEPTION 'Panier invalide' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(_shipping->>'full_name', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'phone', ''))) < 6
     OR length(btrim(coalesce(_shipping->>'address', ''))) < 4 THEN
    RAISE EXCEPTION 'Informations de livraison incomplètes' USING ERRCODE = '22023';
  END IF;

  -- Zone de livraison : doit exister et être ouverte. La ville enregistrée
  -- est celle de la zone (et non un texte libre envoyé par le navigateur).
  IF coalesce(_shipping->>'zone_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Choisissez votre commune de livraison' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _zone FROM delivery_zones
  WHERE id = (_shipping->>'zone_id')::uuid AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nous ne livrons pas encore cette zone' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS _req;
  CREATE TEMP TABLE _req ON COMMIT DROP AS
  SELECT (e->>'product_id')::uuid AS product_id,
         SUM((e->>'quantity')::int)::int AS quantity
  FROM jsonb_array_elements(_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _req WHERE quantity < 1 OR quantity > 1000) THEN
    RAISE EXCEPTION 'Quantité invalide' USING ERRCODE = '22023';
  END IF;

  -- Verrouille les produits concernés (toujours dans le même ordre pour
  -- éviter les interblocages) : deux commandes simultanées ne peuvent pas
  -- se partager le même stock.
  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM _req)
  ORDER BY id
  FOR UPDATE;

  SELECT string_agg(COALESCE(p.name, 'produit inconnu'), ', ')
  INTO _invalid
  FROM _req r
  LEFT JOIN products p ON p.id = r.product_id AND p.is_active
  WHERE p.id IS NULL OR p.stock < r.quantity;

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Produit indisponible ou stock insuffisant : %', _invalid
      USING ERRCODE = '22023';
  END IF;

  -- Produits de saison : refusés hors de leurs mois (heure de Dakar = UTC).
  SELECT string_agg(p.name, ', ')
  INTO _invalid
  FROM _req r JOIN products p ON p.id = r.product_id
  WHERE p.season_months IS NOT NULL
    AND NOT (extract(month FROM now() AT TIME ZONE 'Africa/Dakar')::smallint = ANY (p.season_months));

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Hors saison en ce moment : %', _invalid USING ERRCODE = '22023';
  END IF;

  -- Viande « à l'abattage » : rattachée au prochain abattage dont la date
  -- limite de commande n'est pas passée. Sans abattage programmé, refus.
  IF EXISTS (
    SELECT 1 FROM _req r JOIN products p ON p.id = r.product_id WHERE p.needs_slaughter
  ) THEN
    SELECT day INTO _slaughter FROM slaughter_days
    WHERE order_deadline > now()
    ORDER BY day
    LIMIT 1;

    IF _slaughter IS NULL THEN
      RAISE EXCEPTION 'Aucun abattage programmé pour le moment : retirez la viande de votre panier ou réessayez plus tard'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT SUM(r.quantity * CASE
           WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
           THEN p.discount_price ELSE p.price END)
  INTO _total
  FROM _req r JOIN products p ON p.id = r.product_id;

  -- Frais de livraison selon le tarif de la commune et le montant des articles.
  _fee := delivery_fee(_zone.id, _total);

  INSERT INTO orders (
    user_id, total_amount, delivery_fee, payment_method, delivery_zone_id, slaughter_date,
    shipping_full_name, shipping_phone, shipping_address,
    shipping_city, shipping_postal_code, notes
  ) VALUES (
    _user_id, _total + _fee, _fee, _payment_method, _zone.id, _slaughter,
    left(btrim(_shipping->>'full_name'), 120),
    left(btrim(_shipping->>'phone'), 30),
    left(btrim(_shipping->>'address'), 200),
    -- Deux communes portent le même nom (Mlomp) : on précise le département.
    CASE WHEN EXISTS (
      SELECT 1 FROM delivery_zones z WHERE z.commune = _zone.commune AND z.id <> _zone.id
    ) THEN _zone.commune || ' (' || _zone.department || ')' ELSE _zone.commune END,
    -- Le code postal est facultatif au Sénégal.
    left(btrim(coalesce(_shipping->>'postal_code', '')), 20),
    NULLIF(left(btrim(_shipping->>'notes'), 500), '')
  )
  RETURNING id INTO _order_id;

  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
  -- Nom enregistré avec le format (ex. « Cochon de lait — Sur pied »).
  SELECT _order_id, p.id, p.name || coalesce(' — ' || p.variant_label, ''), r.quantity,
         CASE WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
              THEN p.discount_price ELSE p.price END
  FROM _req r JOIN products p ON p.id = r.product_id;

  UPDATE products p
  SET stock = p.stock - r.quantity
  FROM _req r
  WHERE p.id = r.product_id;

  RETURN _order_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) TO authenticated;


-- ---------- 20261021090000_weighed_items.sql ----------
-- =========================================================
-- Pesée réelle
--
-- products.sold_by_weight : prix au kilo, montant final selon le poids
-- réellement pesé. Le client commande une quantité estimée (order_items.
-- quantity, en kg entiers) ; l'admin saisit ensuite le poids pesé
-- (order_items.actual_quantity) avec set_item_weight(), qui recalcule le
-- total de la commande (articles au poids réel + frais de livraison
-- inchangés). Le stock reste décompté sur la quantité commandée.
-- =========================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sold_by_weight boolean NOT NULL DEFAULT false;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS sold_by_weight boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS actual_quantity numeric(10,3)
    CHECK (actual_quantity IS NULL OR actual_quantity > 0);

-- Poids pesé d'un article (NULL pour revenir à la quantité commandée).
-- Renvoie le nouveau total de la commande.
CREATE OR REPLACE FUNCTION public.set_item_weight(_item_id uuid, _weight numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item order_items%ROWTYPE;
  _order orders%ROWTYPE;
  _total numeric(10,2);
BEGIN
  IF NOT has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Réservé aux administrateurs' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _item FROM order_items WHERE id = _item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article introuvable' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO _order FROM orders WHERE id = _item.order_id FOR UPDATE;

  IF NOT _item.sold_by_weight THEN
    RAISE EXCEPTION 'Cet article n''est pas vendu au poids' USING ERRCODE = '22023';
  END IF;
  IF _order.status IN ('cancelled', 'delivered') THEN
    RAISE EXCEPTION 'Commande % : le poids ne peut plus être modifié',
      CASE WHEN _order.status = 'cancelled' THEN 'annulée' ELSE 'livrée' END
      USING ERRCODE = '22023';
  END IF;
  IF _order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Commande déjà payée : le montant ne peut plus changer' USING ERRCODE = '22023';
  END IF;
  IF _weight IS NOT NULL AND (_weight <= 0 OR _weight > 1000) THEN
    RAISE EXCEPTION 'Poids invalide' USING ERRCODE = '22023';
  END IF;

  UPDATE order_items SET actual_quantity = round(_weight, 3) WHERE id = _item_id;

  SELECT coalesce(sum(round(unit_price * coalesce(actual_quantity, quantity))), 0)
  INTO _total
  FROM order_items WHERE order_id = _order.id;

  UPDATE orders SET total_amount = _total + delivery_fee
  WHERE id = _order.id
  RETURNING total_amount INTO _total;

  RETURN _total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_item_weight(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_item_weight(uuid, numeric) TO authenticated;

-- place_order : enregistre sold_by_weight sur chaque article (le reste est inchangé).
CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _shipping jsonb,
  _payment_method text DEFAULT 'cash_on_delivery'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET client_min_messages = warning
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _total numeric(10,2);
  _fee numeric(10,2);
  _invalid text;
  _zone delivery_zones%ROWTYPE;
  _slaughter date;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  IF _payment_method IS NULL OR _payment_method NOT IN ('cash_on_delivery', 'wave') THEN
    RAISE EXCEPTION 'Mode de paiement invalide' USING ERRCODE = '22023';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e->>'quantity', '') !~ '^[0-9]{1,4}$'
  ) THEN
    RAISE EXCEPTION 'Panier invalide' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(_shipping->>'full_name', ''))) < 2
     OR length(btrim(coalesce(_shipping->>'phone', ''))) < 6
     OR length(btrim(coalesce(_shipping->>'address', ''))) < 4 THEN
    RAISE EXCEPTION 'Informations de livraison incomplètes' USING ERRCODE = '22023';
  END IF;

  -- Zone de livraison : doit exister et être ouverte. La ville enregistrée
  -- est celle de la zone (et non un texte libre envoyé par le navigateur).
  IF coalesce(_shipping->>'zone_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Choisissez votre commune de livraison' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _zone FROM delivery_zones
  WHERE id = (_shipping->>'zone_id')::uuid AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nous ne livrons pas encore cette zone' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS _req;
  CREATE TEMP TABLE _req ON COMMIT DROP AS
  SELECT (e->>'product_id')::uuid AS product_id,
         SUM((e->>'quantity')::int)::int AS quantity
  FROM jsonb_array_elements(_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _req WHERE quantity < 1 OR quantity > 1000) THEN
    RAISE EXCEPTION 'Quantité invalide' USING ERRCODE = '22023';
  END IF;

  -- Verrouille les produits concernés (toujours dans le même ordre pour
  -- éviter les interblocages) : deux commandes simultanées ne peuvent pas
  -- se partager le même stock.
  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM _req)
  ORDER BY id
  FOR UPDATE;

  SELECT string_agg(COALESCE(p.name, 'produit inconnu'), ', ')
  INTO _invalid
  FROM _req r
  LEFT JOIN products p ON p.id = r.product_id AND p.is_active
  WHERE p.id IS NULL OR p.stock < r.quantity;

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Produit indisponible ou stock insuffisant : %', _invalid
      USING ERRCODE = '22023';
  END IF;

  -- Produits de saison : refusés hors de leurs mois (heure de Dakar = UTC).
  SELECT string_agg(p.name, ', ')
  INTO _invalid
  FROM _req r JOIN products p ON p.id = r.product_id
  WHERE p.season_months IS NOT NULL
    AND NOT (extract(month FROM now() AT TIME ZONE 'Africa/Dakar')::smallint = ANY (p.season_months));

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Hors saison en ce moment : %', _invalid USING ERRCODE = '22023';
  END IF;

  -- Viande « à l'abattage » : rattachée au prochain abattage dont la date
  -- limite de commande n'est pas passée. Sans abattage programmé, refus.
  IF EXISTS (
    SELECT 1 FROM _req r JOIN products p ON p.id = r.product_id WHERE p.needs_slaughter
  ) THEN
    SELECT day INTO _slaughter FROM slaughter_days
    WHERE order_deadline > now()
    ORDER BY day
    LIMIT 1;

    IF _slaughter IS NULL THEN
      RAISE EXCEPTION 'Aucun abattage programmé pour le moment : retirez la viande de votre panier ou réessayez plus tard'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT SUM(r.quantity * CASE
           WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
           THEN p.discount_price ELSE p.price END)
  INTO _total
  FROM _req r JOIN products p ON p.id = r.product_id;

  -- Frais de livraison selon le tarif de la commune et le montant des articles.
  _fee := delivery_fee(_zone.id, _total);

  INSERT INTO orders (
    user_id, total_amount, delivery_fee, payment_method, delivery_zone_id, slaughter_date,
    shipping_full_name, shipping_phone, shipping_address,
    shipping_city, shipping_postal_code, notes
  ) VALUES (
    _user_id, _total + _fee, _fee, _payment_method, _zone.id, _slaughter,
    left(btrim(_shipping->>'full_name'), 120),
    left(btrim(_shipping->>'phone'), 30),
    left(btrim(_shipping->>'address'), 200),
    -- Deux communes portent le même nom (Mlomp) : on précise le département.
    CASE WHEN EXISTS (
      SELECT 1 FROM delivery_zones z WHERE z.commune = _zone.commune AND z.id <> _zone.id
    ) THEN _zone.commune || ' (' || _zone.department || ')' ELSE _zone.commune END,
    -- Le code postal est facultatif au Sénégal.
    left(btrim(coalesce(_shipping->>'postal_code', '')), 20),
    NULLIF(left(btrim(_shipping->>'notes'), 500), '')
  )
  RETURNING id INTO _order_id;

  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, sold_by_weight)
  -- Nom enregistré avec le format (ex. « Cochon de lait — Sur pied »).
  SELECT _order_id, p.id, p.name || coalesce(' — ' || p.variant_label, ''), r.quantity,
         CASE WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
              THEN p.discount_price ELSE p.price END,
         p.sold_by_weight
  FROM _req r JOIN products p ON p.id = r.product_id;

  UPDATE products p
  SET stock = p.stock - r.quantity
  FROM _req r
  WHERE p.id = r.product_id;

  RETURN _order_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) TO authenticated;


-- ---------- 20261022090000_customer_notes.sql ----------
-- =========================================================
-- Notes internes sur les clients (visibles et modifiables par les
-- administrateurs uniquement, jamais par le client lui-même).
-- Table séparée de profiles, que le client peut modifier.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.customer_notes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage customer notes" ON public.customer_notes;
CREATE POLICY "Admins manage customer notes" ON public.customer_notes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;


-- ---------- 20261023090000_farm_settings.sql ----------
-- =========================================================
-- Informations de la ferme modifiables depuis l'admin (onglet « Ferme »)
-- au lieu d'être écrites dans le code : coordonnées, horaires, réseaux
-- sociaux, textes de l'accueil et de la page « Notre ferme ».
-- Une seule ligne (id = 1). Lecture publique, modification admin.
-- Les champs vides ne sont pas affichés sur le site.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.farm_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL DEFAULT 'Ferme MendyKounda',
  tagline text NOT NULL DEFAULT 'Ferme & terroir · Casamance',
  description text NOT NULL DEFAULT 'La ferme en ligne qui rapproche les produits locaux des familles de la région de Ziguinchor.',
  address text,
  location text NOT NULL DEFAULT 'Région de Ziguinchor, Sénégal',
  phone text,
  whatsapp text,
  email text,
  opening_hours text DEFAULT 'Du lundi au samedi',
  facebook_url text,
  instagram_url text,
  tiktok_url text,
  hero_title text NOT NULL DEFAULT 'Le frais de la Casamance, livré chez vous.',
  hero_subtitle text NOT NULL DEFAULT 'Légumes, fruits de saison, volailles, porcs, viandes, jus… tout vient de la ferme.',
  about_eyebrow text DEFAULT 'Depuis 1987',
  about_title text NOT NULL DEFAULT 'Trois générations, une même passion.',
  about_body text NOT NULL DEFAULT E'La ferme MendyKounda est née d''une conviction simple : un animal élevé avec respect donne un produit incomparable. Trois générations plus tard, cette intuition guide toujours chacun de nos gestes.\n\nNous cultivons des légumes et des fruits au fil des saisons, et nos volailles et nos porcs sont élevés au grand air. Les volailles se vendent vivantes ou en poulet de chair au kilo, déplumé, vidé et emballé. Les cochons, de lait ou adultes, se vendent sur pied ou en viande selon les jours d''abattage. Nos œufs sont ramassés chaque matin, et nous préparons aussi du lait et des jus.\n\nPas d''intermédiaire, pas de circuit long. Du champ et de l''élevage à votre table, tout simplement.',
  about_image_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(about_body) <= 8000 AND length(description) <= 500)
);
ALTER TABLE public.farm_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.farm_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone views farm settings" ON public.farm_settings;
CREATE POLICY "Anyone views farm settings" ON public.farm_settings
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins update farm settings" ON public.farm_settings;
CREATE POLICY "Admins update farm settings" ON public.farm_settings
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.farm_settings TO anon, authenticated;
GRANT UPDATE ON public.farm_settings TO authenticated;


-- ---------- 20261024090000_orders_realtime.sql ----------
-- =========================================================
-- Temps réel sur les commandes : la pastille « Admin » s'allume dès
-- qu'une commande arrive (sans recharger la page). Les règles RLS
-- s'appliquent : un client ne reçoit que ses propres commandes.
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;


-- ---------- 20261025090000_prelaunch_hardening.sql ----------
-- =========================================================
-- Vérification avant l'ouverture : durcissements
--
-- 1. Messages : un client ne peut plus modifier le contenu d'un message
--    (ni se faire passer pour la ferme) ; seule la date de lecture
--    (read_at) reste modifiable. Messages limités à 2000 caractères.
-- 2. Avis : réservés aux clients qui ont reçu le produit (commande
--    livrée) ; commentaires limités à 2000 caractères.
-- 3. place_order : téléphone de 8 à 15 chiffres, et au plus 5 commandes
--    en attente de préparation par client.
-- =========================================================

-- 1. Messages
REVOKE UPDATE ON public.messages FROM anon, authenticated;
GRANT UPDATE (read_at) ON public.messages TO authenticated;

ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_content_length;
ALTER TABLE public.messages ADD CONSTRAINT messages_content_length
  CHECK (length(btrim(content)) BETWEEN 1 AND 2000) NOT VALID;

-- 2. Avis
CREATE OR REPLACE FUNCTION public.can_review(_product_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM orders o
    JOIN order_items i ON i.order_id = o.id
    WHERE o.user_id = auth.uid()
      AND o.status = 'delivered'
      AND i.product_id = _product_id
  )
$$;
REVOKE EXECUTE ON FUNCTION public.can_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_review(uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users create own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Buyers create own reviews" ON public.reviews;
CREATE POLICY "Buyers create own reviews" ON public.reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id AND public.can_review(product_id));

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_comment_length;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_comment_length
  CHECK (comment IS NULL OR length(comment) <= 2000) NOT VALID;

-- 3. place_order (le reste est inchangé)
CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _shipping jsonb,
  _payment_method text DEFAULT 'cash_on_delivery'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET client_min_messages = warning
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _order_id uuid;
  _total numeric(10,2);
  _fee numeric(10,2);
  _invalid text;
  _zone delivery_zones%ROWTYPE;
  _slaughter date;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  IF _payment_method IS NULL OR _payment_method NOT IN ('cash_on_delivery', 'wave') THEN
    RAISE EXCEPTION 'Mode de paiement invalide' USING ERRCODE = '22023';
  END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR coalesce(e->>'quantity', '') !~ '^[0-9]{1,4}$'
  ) THEN
    RAISE EXCEPTION 'Panier invalide' USING ERRCODE = '22023';
  END IF;

  IF length(btrim(coalesce(_shipping->>'full_name', ''))) < 2
     -- Téléphone : de 8 à 15 chiffres (ex. +221 77 123 45 67 = 12 chiffres).
     OR length(regexp_replace(coalesce(_shipping->>'phone', ''), '\D', '', 'g')) NOT BETWEEN 8 AND 15
     OR length(btrim(coalesce(_shipping->>'address', ''))) < 4 THEN
    RAISE EXCEPTION 'Informations de livraison incomplètes' USING ERRCODE = '22023';
  END IF;

  -- Anti-abus : pas plus de 5 commandes en attente de préparation à la
  -- fois (elles bloquent du stock sans être payées).
  IF (SELECT count(*) FROM orders WHERE user_id = _user_id AND status = 'pending') >= 5 THEN
    RAISE EXCEPTION 'Vous avez déjà 5 commandes en attente : contactez la ferme ou attendez leur préparation'
      USING ERRCODE = '22023';
  END IF;

  -- Zone de livraison : doit exister et être ouverte. La ville enregistrée
  -- est celle de la zone (et non un texte libre envoyé par le navigateur).
  IF coalesce(_shipping->>'zone_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Choisissez votre commune de livraison' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _zone FROM delivery_zones
  WHERE id = (_shipping->>'zone_id')::uuid AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nous ne livrons pas encore cette zone' USING ERRCODE = '22023';
  END IF;

  DROP TABLE IF EXISTS _req;
  CREATE TEMP TABLE _req ON COMMIT DROP AS
  SELECT (e->>'product_id')::uuid AS product_id,
         SUM((e->>'quantity')::int)::int AS quantity
  FROM jsonb_array_elements(_items) e
  GROUP BY 1;

  IF EXISTS (SELECT 1 FROM _req WHERE quantity < 1 OR quantity > 1000) THEN
    RAISE EXCEPTION 'Quantité invalide' USING ERRCODE = '22023';
  END IF;

  -- Verrouille les produits concernés (toujours dans le même ordre pour
  -- éviter les interblocages) : deux commandes simultanées ne peuvent pas
  -- se partager le même stock.
  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM _req)
  ORDER BY id
  FOR UPDATE;

  SELECT string_agg(COALESCE(p.name, 'produit inconnu'), ', ')
  INTO _invalid
  FROM _req r
  LEFT JOIN products p ON p.id = r.product_id AND p.is_active
  WHERE p.id IS NULL OR p.stock < r.quantity;

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Produit indisponible ou stock insuffisant : %', _invalid
      USING ERRCODE = '22023';
  END IF;

  -- Produits de saison : refusés hors de leurs mois (heure de Dakar = UTC).
  SELECT string_agg(p.name, ', ')
  INTO _invalid
  FROM _req r JOIN products p ON p.id = r.product_id
  WHERE p.season_months IS NOT NULL
    AND NOT (extract(month FROM now() AT TIME ZONE 'Africa/Dakar')::smallint = ANY (p.season_months));

  IF _invalid IS NOT NULL THEN
    RAISE EXCEPTION 'Hors saison en ce moment : %', _invalid USING ERRCODE = '22023';
  END IF;

  -- Viande « à l'abattage » : rattachée au prochain abattage dont la date
  -- limite de commande n'est pas passée. Sans abattage programmé, refus.
  IF EXISTS (
    SELECT 1 FROM _req r JOIN products p ON p.id = r.product_id WHERE p.needs_slaughter
  ) THEN
    SELECT day INTO _slaughter FROM slaughter_days
    WHERE order_deadline > now()
    ORDER BY day
    LIMIT 1;

    IF _slaughter IS NULL THEN
      RAISE EXCEPTION 'Aucun abattage programmé pour le moment : retirez la viande de votre panier ou réessayez plus tard'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT SUM(r.quantity * CASE
           WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
           THEN p.discount_price ELSE p.price END)
  INTO _total
  FROM _req r JOIN products p ON p.id = r.product_id;

  -- Frais de livraison selon le tarif de la commune et le montant des articles.
  _fee := delivery_fee(_zone.id, _total);

  INSERT INTO orders (
    user_id, total_amount, delivery_fee, payment_method, delivery_zone_id, slaughter_date,
    shipping_full_name, shipping_phone, shipping_address,
    shipping_city, shipping_postal_code, notes
  ) VALUES (
    _user_id, _total + _fee, _fee, _payment_method, _zone.id, _slaughter,
    left(btrim(_shipping->>'full_name'), 120),
    left(btrim(_shipping->>'phone'), 30),
    left(btrim(_shipping->>'address'), 200),
    -- Deux communes portent le même nom (Mlomp) : on précise le département.
    CASE WHEN EXISTS (
      SELECT 1 FROM delivery_zones z WHERE z.commune = _zone.commune AND z.id <> _zone.id
    ) THEN _zone.commune || ' (' || _zone.department || ')' ELSE _zone.commune END,
    -- Le code postal est facultatif au Sénégal.
    left(btrim(coalesce(_shipping->>'postal_code', '')), 20),
    NULLIF(left(btrim(_shipping->>'notes'), 500), '')
  )
  RETURNING id INTO _order_id;

  INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, sold_by_weight)
  -- Nom enregistré avec le format (ex. « Cochon de lait — Sur pied »).
  SELECT _order_id, p.id, p.name || coalesce(' — ' || p.variant_label, ''), r.quantity,
         CASE WHEN p.discount_price IS NOT NULL AND p.discount_price < p.price
              THEN p.discount_price ELSE p.price END,
         p.sold_by_weight
  FROM _req r JOIN products p ON p.id = r.product_id;

  UPDATE products p
  SET stock = p.stock - r.quantity
  FROM _req r
  WHERE p.id = r.product_id;

  RETURN _order_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, jsonb, text) TO authenticated;


-- ---------- 20261026090000_order_workflow.sql ----------
-- =========================================================
-- Circuit des commandes revu
--
-- Statuts : Commandée (pending) → En préparation (processing) →
-- Prête (ready, nouveau) → En livraison (shipped) → Livrée (delivered).
-- Annulée (cancelled) possible avant la livraison.
--
-- 1. Nouveau statut « ready » + date ready_at.
-- 2. Passages autorisés uniquement (plus de « Livrée → Commandée » ni
--    d'annulation d'une commande livrée, qui remettait le stock à tort) :
--      Commandée      → En préparation, Annulée
--      En préparation → Prête, Commandée (retour), Annulée
--      Prête          → En livraison, Livrée (remise directe),
--                       En préparation (retour), Annulée
--      En livraison   → Livrée, Prête (livraison échouée), Annulée
--      Livrée         → En livraison (correction d'une erreur)
--      Annulée        → Commandée (réactivation, si le stock suffit)
-- 3. Annulation motivée : cancel_reason et cancelled_by (customer, farm,
--    system). Le client ne peut annuler que tant que la commande est
--    « Commandée » (avant la préparation).
-- =========================================================

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'ready' BEFORE 'shipped';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_by text;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cancelled_by_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_cancelled_by_check
  CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'farm', 'system'));
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cancel_reason_length;
ALTER TABLE public.orders ADD CONSTRAINT orders_cancel_reason_length
  CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 300);

CREATE OR REPLACE FUNCTION public.orders_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _short text;
  _allowed text[];
  _labels constant jsonb := '{"pending":"Commandée","processing":"En préparation","ready":"Prête","shipped":"En livraison","delivered":"Livrée","cancelled":"Annulée"}';
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  _allowed := CASE OLD.status::text
    WHEN 'pending' THEN ARRAY['processing', 'cancelled']
    WHEN 'processing' THEN ARRAY['ready', 'pending', 'cancelled']
    WHEN 'ready' THEN ARRAY['shipped', 'delivered', 'processing', 'cancelled']
    WHEN 'shipped' THEN ARRAY['delivered', 'ready', 'cancelled']
    WHEN 'delivered' THEN ARRAY['shipped']
    WHEN 'cancelled' THEN ARRAY['pending']
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status::text = ANY (_allowed)) THEN
    RAISE EXCEPTION 'Passage impossible de « % » à « % »',
      _labels->>OLD.status::text, _labels->>NEW.status::text
      USING ERRCODE = '22023';
  END IF;

  IF NEW.status = 'cancelled' THEN
    -- Annulation : on remet les articles en stock.
    UPDATE products p
    SET stock = p.stock + i.qty
    FROM (
      SELECT product_id, SUM(quantity)::int AS qty
      FROM order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id
    ) i
    WHERE p.id = i.product_id;
    NEW.cancelled_at := now();
    NEW.cancelled_by := coalesce(NEW.cancelled_by, 'farm');
    NEW.cancel_reason := NULLIF(left(btrim(coalesce(NEW.cancel_reason, '')), 300), '');

  ELSIF OLD.status = 'cancelled' THEN
    -- Réactivation d'une commande annulée : on reprend le stock.
    PERFORM 1 FROM products
    WHERE id IN (SELECT product_id FROM order_items WHERE order_id = NEW.id)
    ORDER BY id
    FOR UPDATE;

    SELECT string_agg(p.name, ', ') INTO _short
    FROM (
      SELECT product_id, SUM(quantity)::int AS qty
      FROM order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id
    ) i
    JOIN products p ON p.id = i.product_id
    WHERE p.stock < i.qty;

    IF _short IS NOT NULL THEN
      RAISE EXCEPTION 'Stock insuffisant pour réactiver la commande : %', _short
        USING ERRCODE = '22023';
    END IF;

    UPDATE products p
    SET stock = p.stock - i.qty
    FROM (
      SELECT product_id, SUM(quantity)::int AS qty
      FROM order_items
      WHERE order_id = NEW.id AND product_id IS NOT NULL
      GROUP BY product_id
    ) i
    WHERE p.id = i.product_id;
    NEW.cancelled_at := NULL;
    NEW.cancelled_by := NULL;
    NEW.cancel_reason := NULL;
  END IF;

  -- Dates des étapes (une étape franchie date aussi les précédentes).
  IF NEW.status::text IN ('processing', 'ready', 'shipped', 'delivered') THEN
    NEW.processing_at := coalesce(NEW.processing_at, now());
  END IF;
  IF NEW.status::text IN ('ready', 'shipped', 'delivered') THEN
    NEW.ready_at := coalesce(NEW.ready_at, now());
  END IF;
  IF NEW.status::text IN ('shipped', 'delivered') THEN
    NEW.shipped_at := coalesce(NEW.shipped_at, now());
  END IF;
  IF NEW.status::text = 'delivered' THEN
    NEW.delivered_at := coalesce(NEW.delivered_at, now());
  END IF;
  -- Retour en arrière : on efface les dates des étapes annulées.
  IF NEW.status::text IN ('pending') THEN
    NEW.processing_at := NULL;
  END IF;
  IF NEW.status::text IN ('pending', 'processing') THEN
    NEW.ready_at := NULL;
  END IF;
  IF NEW.status::text IN ('pending', 'processing', 'ready') THEN
    NEW.shipped_at := NULL;
  END IF;
  IF NEW.status::text <> 'delivered' THEN
    NEW.delivered_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.orders_on_status_change() FROM PUBLIC, anon, authenticated;

-- Annulation par le client : seulement avant la préparation, avec un motif facultatif.
DROP FUNCTION IF EXISTS public.cancel_order(uuid);
CREATE OR REPLACE FUNCTION public.cancel_order(_order_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO _order FROM orders
  WHERE id = _order_id AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commande introuvable' USING ERRCODE = '22023';
  END IF;

  IF _order.status <> 'pending' THEN
    RAISE EXCEPTION 'La préparation a commencé : contactez la ferme pour annuler' USING ERRCODE = '22023';
  END IF;

  IF _order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Commande déjà payée : contactez la ferme pour l''annuler' USING ERRCODE = '22023';
  END IF;

  UPDATE orders
  SET status = 'cancelled',
      cancelled_by = 'customer',
      cancel_reason = NULLIF(left(btrim(coalesce(_reason, '')), 300), '')
  WHERE id = _order_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(uuid, text) TO authenticated;

-- Commandes Wave non payées : annulées automatiquement avec un motif.
CREATE OR REPLACE FUNCTION public.expire_unpaid_wave_orders(_older_than interval DEFAULT interval '2 hours')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  -- Le trigger orders_on_status_change remet les articles en stock.
  UPDATE orders
  SET status = 'cancelled',
      cancelled_by = 'system',
      cancel_reason = 'Paiement Wave non reçu'
  WHERE payment_method = 'wave'
    AND payment_status <> 'paid'
    AND status = 'pending'
    AND created_at < now() - _older_than;
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.expire_unpaid_wave_orders(interval) FROM PUBLIC, anon, authenticated;

-- ---------- 20261027090000_legal_pages.sql ----------
-- =========================================================
-- Pages légales : conditions générales de vente (/cgv) et politique de
-- confidentialité (/confidentialite).
-- - Identité légale du vendeur (raison sociale, NINEA, RCCM), affichée
--   dans les CGV quand elle est renseignée.
-- - terms_body / privacy_body : texte personnalisé par l'admin. Vide =
--   texte proposé par le site, complété avec les infos de la ferme.
-- - legal_updated_at : date « Dernière mise à jour » des textes personnalisés.
-- =========================================================

ALTER TABLE public.farm_settings
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS ninea text,
  ADD COLUMN IF NOT EXISTS rccm text,
  ADD COLUMN IF NOT EXISTS terms_body text,
  ADD COLUMN IF NOT EXISTS privacy_body text,
  ADD COLUMN IF NOT EXISTS legal_updated_at timestamptz;

ALTER TABLE public.farm_settings DROP CONSTRAINT IF EXISTS farm_settings_legal_length;
ALTER TABLE public.farm_settings ADD CONSTRAINT farm_settings_legal_length CHECK (
  coalesce(length(terms_body), 0) <= 40000
  AND coalesce(length(privacy_body), 0) <= 40000
  AND coalesce(length(legal_name), 0) <= 200
  AND coalesce(length(ninea), 0) <= 50
  AND coalesce(length(rccm), 0) <= 80
);

-- =========================================================
-- APRÈS avoir créé ton propre compte sur le site, donne-toi le rôle admin
-- (remplace l'email puis exécute uniquement ces lignes) :
--
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'admin' FROM auth.users WHERE email = 'ton-email@exemple.com'
-- ON CONFLICT (user_id, role) DO NOTHING;
-- =========================================================
