/**
 * Paiement Wave côté navigateur : appelle l'Edge Function wave-checkout.
 * Le montant n'est jamais envoyé d'ici : il est relu en base côté serveur.
 */
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type WavePaymentStatus = "paid" | "pending" | "failed";

async function call(action: "create" | "sync", orderId: string) {
  const { data, error } = await supabase.functions.invoke<{
    status: WavePaymentStatus;
    launch_url?: string;
    error?: string;
  }>("wave-checkout", { body: { action, order_id: orderId } });
  if (error) {
    let message = "Le paiement Wave est indisponible pour le moment.";
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (body?.error) message = body.error;
    }
    throw new Error(message);
  }
  return data!;
}

/** Crée la session Wave et redirige vers l'appli / la page de paiement Wave. */
export async function startWavePayment(orderId: string): Promise<WavePaymentStatus> {
  const res = await call("create", orderId);
  if (res.launch_url) globalThis.location.assign(res.launch_url);
  return res.status;
}

/** Relit l'état du paiement auprès de Wave (au retour sur le site). */
export async function syncWavePayment(orderId: string): Promise<WavePaymentStatus> {
  return (await call("sync", orderId)).status;
}
