
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS discount_price numeric,
  ADD COLUMN IF NOT EXISTS discount_label text;

CREATE POLICY "Admins delete messages"
ON public.messages
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
