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
