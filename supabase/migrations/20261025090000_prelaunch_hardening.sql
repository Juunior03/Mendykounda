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
