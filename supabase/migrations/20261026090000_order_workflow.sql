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
