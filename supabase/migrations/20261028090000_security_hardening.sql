-- =========================================================
-- Durcissement sécurité (audit OWASP Top 10)
--
-- 1. Avis : un client ne pouvait pas créer d'avis sur un produit non
--    acheté, mais il pouvait en MODIFIER un pour le déplacer sur un autre
--    produit. Seuls la note et le commentaire sont maintenant modifiables.
-- 2. Profil : seules les coordonnées sont modifiables par le client (plus
--    la date d'inscription, utilisée pour les segments de clients).
-- 3. Longueurs maximales sur les textes saisis par les clients (profil,
--    livraison, instructions) : évite de remplir la base ou les e-mails
--    avec des textes géants.
-- 4. Messagerie : 20 messages maximum par client toutes les 10 minutes
--    (anti-spam). L'équipe de la ferme n'est pas limitée.
-- 5. Réglages de la ferme : liens (réseaux sociaux, photo) en http(s)
--    uniquement, jamais « javascript: ».
-- 6. Photos produits : 5 Mo maximum, formats image uniquement (pas de SVG,
--    qui peut contenir du script).
-- Les contraintes sont posées « NOT VALID » : elles s'appliquent à toutes
-- les nouvelles écritures sans bloquer sur d'éventuelles anciennes données.
-- =========================================================

-- 1. Avis -------------------------------------------------
REVOKE UPDATE ON public.reviews FROM authenticated;
GRANT UPDATE (rating, comment) ON public.reviews TO authenticated;

DROP POLICY IF EXISTS "Users update own reviews" ON public.reviews;
CREATE POLICY "Users update own reviews" ON public.reviews
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_review(product_id));

-- 2. Profil -----------------------------------------------
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone, address, city, updated_at) ON public.profiles TO authenticated;

-- 3. Longueurs maximales ----------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_lengths;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_lengths CHECK (
  coalesce(length(full_name), 0) <= 120
  AND coalesce(length(phone), 0) <= 30
  AND coalesce(length(address), 0) <= 300
  AND coalesce(length(city), 0) <= 120
  AND coalesce(length(postal_code), 0) <= 20
  AND coalesce(length(avatar_url), 0) <= 500
) NOT VALID;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_lengths;
ALTER TABLE public.orders ADD CONSTRAINT orders_lengths CHECK (
  length(shipping_full_name) <= 120
  AND length(shipping_phone) <= 30
  AND length(shipping_address) <= 300
  AND length(shipping_city) <= 120
  AND length(shipping_postal_code) <= 20
  AND coalesce(length(notes), 0) <= 500
) NOT VALID;

ALTER TABLE public.reviews DROP CONSTRAINT IF EXISTS reviews_comment_length;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_comment_length
  CHECK (coalesce(length(comment), 0) <= 2000) NOT VALID;

-- Nom saisi à l'inscription : tronqué plutôt que refusé.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, left(btrim(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), 120));

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Messagerie : anti-spam -------------------------------
CREATE OR REPLACE FUNCTION public.messages_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_from_admin THEN
    RETURN NEW;
  END IF;
  IF (
    SELECT count(*) FROM messages
    WHERE sender_id = NEW.sender_id
      AND is_from_admin = false
      AND created_at > now() - interval '10 minutes'
  ) >= 20 THEN
    RAISE EXCEPTION 'Trop de messages envoyés : patientez quelques minutes' USING ERRCODE = '54000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.messages_rate_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_rate_limit ON public.messages;
CREATE TRIGGER messages_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_rate_limit();

CREATE INDEX IF NOT EXISTS idx_messages_sender_created ON public.messages (sender_id, created_at);

-- 5. Liens des réglages de la ferme -----------------------
ALTER TABLE public.farm_settings DROP CONSTRAINT IF EXISTS farm_settings_safe_urls;
ALTER TABLE public.farm_settings ADD CONSTRAINT farm_settings_safe_urls CHECK (
  (facebook_url IS NULL OR facebook_url ~* '^https?://')
  AND (instagram_url IS NULL OR instagram_url ~* '^https?://')
  AND (tiktok_url IS NULL OR tiktok_url ~* '^https?://')
  AND (about_image_url IS NULL OR about_image_url ~* '^(https?://|/)')
) NOT VALID;

-- 6. Photos produits --------------------------------------
UPDATE storage.buckets
SET file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'product-images';
