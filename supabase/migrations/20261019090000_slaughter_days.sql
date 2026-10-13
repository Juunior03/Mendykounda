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
