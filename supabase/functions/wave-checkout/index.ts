/**
 * POST /functions/v1/wave-checkout   (utilisateur connecté)
 *   { action: "create", order_id }  -> { status, launch_url? }  lien de paiement Wave
 *   { action: "sync",   order_id }  -> { status }               relit la session chez Wave
 *
 * Secrets requis : WAVE_API_KEY, SITE_URL (ex. https://mendykounda.com).
 */
import {
  HttpError,
  type OrdersRepo,
  startCheckout,
  syncOrder,
  type WaveApi,
  waveApi,
} from "../_shared/wave.ts";
import { ordersRepo, userIdFromRequest } from "../_shared/orders-repo.ts";
import { corsHeaders, json } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Deps {
  repo: OrdersRepo;
  wave: WaveApi;
  userId: (req: Request) => Promise<string | null>;
  siteUrl: string;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
    const userId = await deps.userId(req);
    if (!userId) return json({ error: "Connexion requise" }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.order_id ?? "");
    if (!UUID.test(orderId)) return json({ error: "Commande invalide" }, 400);

    if (body?.action === "create") {
      return json(await startCheckout(deps.repo, deps.wave, userId, orderId, deps.siteUrl));
    }
    if (body?.action === "sync") {
      const order = await deps.repo.findById(orderId);
      if (!order || order.user_id !== userId) return json({ error: "Commande introuvable" }, 404);
      return json({ status: await syncOrder(deps.repo, deps.wave, order) });
    }
    return json({ error: "Action inconnue" }, 400);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("[wave-checkout]", err);
    return json({ error: "Erreur interne" }, 500);
  }
}

if (import.meta.main) {
  const apiKey = Deno.env.get("WAVE_API_KEY");
  const siteUrl = Deno.env.get("SITE_URL");
  Deno.serve((req) => {
    if (!apiKey || !siteUrl) {
      if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
      console.error("[wave-checkout] secrets WAVE_API_KEY / SITE_URL manquants");
      return json({ error: "Paiement Wave pas encore configuré" }, 503);
    }
    return handle(req, {
      repo: ordersRepo(),
      wave: waveApi(apiKey, Deno.env.get("WAVE_API_BASE") ?? undefined),
      userId: userIdFromRequest,
      siteUrl,
    });
  });
}
