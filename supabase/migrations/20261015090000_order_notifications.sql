-- =========================================================
-- Notifications de commande (e-mail et SMS via Brevo)
--
-- Dates d'envoi des confirmations : l'Edge Function order-notify les
-- « réserve » avant d'envoyer (UPDATE … WHERE … IS NULL), ce qui garantit
-- un seul e-mail et un seul SMS par commande, même si la fonction est
-- appelée plusieurs fois.
-- =========================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_sms_sent_at timestamptz;
