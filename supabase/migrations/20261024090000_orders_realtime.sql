-- =========================================================
-- Temps réel sur les commandes : la pastille « Admin » s'allume dès
-- qu'une commande arrive (sans recharger la page). Les règles RLS
-- s'appliquent : un client ne reçoit que ses propres commandes.
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;
