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
