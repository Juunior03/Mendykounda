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
