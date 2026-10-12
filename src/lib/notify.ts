/**
 * Demande l'envoi des confirmations (e-mail + SMS) d'une commande.
 * Ne bloque jamais le parcours : au pire, aucune notification n'est envoyée.
 * Le serveur garantit un seul envoi par commande.
 */
import { supabase } from "@/integrations/supabase/client";

export async function notifyOrderPlaced(orderId: string, timeoutMs = 4000): Promise<void> {
  const call = supabase.functions
    .invoke("order-notify", { body: { order_id: orderId } })
    .then(({ error }) => {
      if (error) console.warn("[notifications] envoi impossible :", error.message);
    })
    .catch((err) => console.warn("[notifications] envoi impossible :", err));
  await Promise.race([call, new Promise((r) => setTimeout(r, timeoutMs))]);
}
