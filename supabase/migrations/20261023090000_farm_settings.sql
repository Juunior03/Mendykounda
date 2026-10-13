-- =========================================================
-- Informations de la ferme modifiables depuis l'admin (onglet « Ferme »)
-- au lieu d'être écrites dans le code : coordonnées, horaires, réseaux
-- sociaux, textes de l'accueil et de la page « Notre ferme ».
-- Une seule ligne (id = 1). Lecture publique, modification admin.
-- Les champs vides ne sont pas affichés sur le site.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.farm_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL DEFAULT 'Ferme MendyKounda',
  tagline text NOT NULL DEFAULT 'Ferme & terroir · Casamance',
  description text NOT NULL DEFAULT 'La ferme en ligne qui rapproche les produits locaux des familles de la région de Ziguinchor.',
  address text,
  location text NOT NULL DEFAULT 'Région de Ziguinchor, Sénégal',
  phone text,
  whatsapp text,
  email text,
  opening_hours text DEFAULT 'Du lundi au samedi',
  facebook_url text,
  instagram_url text,
  tiktok_url text,
  hero_title text NOT NULL DEFAULT 'Le frais de la Casamance, livré chez vous.',
  hero_subtitle text NOT NULL DEFAULT 'Légumes, fruits de saison, volailles, porcs, viandes, jus… tout vient de la ferme.',
  about_eyebrow text DEFAULT 'Depuis 1987',
  about_title text NOT NULL DEFAULT 'Trois générations, une même passion.',
  about_body text NOT NULL DEFAULT E'La ferme MendyKounda est née d''une conviction simple : un animal élevé avec respect donne un produit incomparable. Trois générations plus tard, cette intuition guide toujours chacun de nos gestes.\n\nNous cultivons des légumes et des fruits au fil des saisons, et nos volailles et nos porcs sont élevés au grand air. Les volailles se vendent vivantes ou en poulet de chair au kilo, déplumé, vidé et emballé. Les cochons, de lait ou adultes, se vendent sur pied ou en viande selon les jours d''abattage. Nos œufs sont ramassés chaque matin, et nous préparons aussi du lait et des jus.\n\nPas d''intermédiaire, pas de circuit long. Du champ et de l''élevage à votre table, tout simplement.',
  about_image_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(about_body) <= 8000 AND length(description) <= 500)
);
ALTER TABLE public.farm_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.farm_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone views farm settings" ON public.farm_settings;
CREATE POLICY "Anyone views farm settings" ON public.farm_settings
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins update farm settings" ON public.farm_settings;
CREATE POLICY "Admins update farm settings" ON public.farm_settings
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.farm_settings TO anon, authenticated;
GRANT UPDATE ON public.farm_settings TO authenticated;
