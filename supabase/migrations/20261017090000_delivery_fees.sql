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
