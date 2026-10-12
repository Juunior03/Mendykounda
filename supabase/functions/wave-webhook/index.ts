/**
 * POST /functions/v1/wave-webhook   (appelé par Wave, sans jeton utilisateur)
 *
 * 1. Vérifie que l'appel vient de Wave (secret partagé ou signature).
 * 2. Pour un évènement checkout.session.*, relit la session auprès de l'API
 *    Wave et met la commande à jour : le corps du webhook n'est pas cru tel quel.
 *
 * Secrets : WAVE_API_KEY, WAVE_WEBHOOK_SECRET.
 */
import {
  HttpError,
  type OrdersRepo,
  syncOrder,
  verifyWebhook,
  type WaveApi,
  waveApi,
} from "../_shared/wave.ts";
import { ordersRepo } from "../_shared/orders-repo.ts";
import { json } from "../_shared/http.ts";

export interface Deps {
  repo: OrdersRepo;
  wave: WaveApi;
  secret: string;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const raw = await req.text();
  if (!(await verifyWebhook(req.headers, raw, deps.secret))) {
    return json({ error: "Signature invalide" }, 401);
  }

  let event: { type?: string; data?: { id?: string; client_reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }

  // Les autres évènements (virements, etc.) ne concernent pas la boutique.
  if (!event.type?.startsWith("checkout.session.") || !event.data?.id) {
    return json({ received: true });
  }

  try {
    const order =
      (await deps.repo.findBySession(event.data.id)) ??
      (event.data.client_reference ? await deps.repo.findById(event.data.client_reference) : null);
    if (!order) {
      console.warn(`[wave-webhook] aucune commande pour la session ${event.data.id}`);
      return json({ received: true });
    }
    // On relit la session indiquée par le webhook si la commande n'en a pas encore.
    const target = order.payment_session_id
      ? order
      : { ...order, payment_session_id: event.data.id };
    const status = await syncOrder(deps.repo, deps.wave, target);
    return json({ received: true, status });
  } catch (err) {
    // 500 : Wave renverra l'évènement plus tard.
    console.error("[wave-webhook]", err);
    return json({ error: err instanceof HttpError ? err.message : "Erreur interne" }, 500);
  }
}

if (import.meta.main) {
  const apiKey = Deno.env.get("WAVE_API_KEY");
  const secret = Deno.env.get("WAVE_WEBHOOK_SECRET");
  Deno.serve((req) => {
    if (!apiKey || !secret) {
      console.error("[wave-webhook] secrets WAVE_API_KEY / WAVE_WEBHOOK_SECRET manquants");
      return json({ error: "Webhook Wave pas encore configuré" }, 503);
    }
    return handle(req, {
      repo: ordersRepo(),
      wave: waveApi(apiKey, Deno.env.get("WAVE_API_BASE") ?? undefined),
      secret,
    });
  });
}
