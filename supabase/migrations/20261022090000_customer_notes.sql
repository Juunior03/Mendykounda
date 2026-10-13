-- =========================================================
-- Notes internes sur les clients (visibles et modifiables par les
-- administrateurs uniquement, jamais par le client lui-même).
-- Table séparée de profiles, que le client peut modifier.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.customer_notes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage customer notes" ON public.customer_notes;
CREATE POLICY "Admins manage customer notes" ON public.customer_notes
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_notes TO authenticated;
