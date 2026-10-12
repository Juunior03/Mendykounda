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
