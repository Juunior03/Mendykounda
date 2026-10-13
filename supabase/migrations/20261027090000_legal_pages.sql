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
