/**
 * POST /functions/v1/order-notify   (utilisateur connecté)
 *   { order_id } -> { email, sms }  chacun : sent | already_sent | skipped | failed
 *
 * Appelée par le site juste après place_order. Envoie la confirmation par
 * e-mail et par SMS (une seule fois par commande) et alerte la ferme.
 *
 * Secrets (tous facultatifs, le canal est ignoré s'il manque sa config) :
 *   BREVO_API_KEY, SITE_URL, EMAIL_FROM, EMAIL_FROM_NAME, ADMIN_EMAIL, SMS_SENDER
 */
import {
  type Mailer,
  NotFoundError,
  type NotifyConfig,
  type NotifyRepo,
  notifyOrder,
  type SmsSender,
  brevo,
} from "../_shared/notify.ts";
import { notifyRepo } from "../_shared/notify-repo.ts";
import { userIdFromRequest } from "../_shared/orders-repo.ts";
import { corsHeaders, json } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Deps {
  repo: NotifyRepo;
  mailer?: Mailer;
  sms?: SmsSender;
  config: NotifyConfig;
  userId: (req: Request) => Promise<string | null>;
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

    return json(await notifyOrder(deps, userId, orderId));
  } catch (err) {
    if (err instanceof NotFoundError) return json({ error: err.message }, 404);
    console.error("[order-notify]", err);
    return json({ error: "Erreur interne" }, 500);
  }
}

/** Lit la configuration dans les secrets Supabase. */
export function configFromEnv(): { apiKey?: string; config: NotifyConfig } {
  const env = (k: string) => {
    const v = Deno.env.get(k)?.trim();
    return v === "" ? undefined : v;
  };
  const from = env("EMAIL_FROM");
  const sender = env("SMS_SENDER");
  return {
    apiKey: env("BREVO_API_KEY"),
    config: {
      siteUrl: env("SITE_URL") ?? "http://localhost:8080",
      emailFrom: from ? { email: from, name: env("EMAIL_FROM_NAME") ?? "MendyKounda" } : undefined,
      // Nom d'expéditeur SMS : 11 caractères alphanumériques maximum.
      smsSender: sender ? sender.replaceAll(/[^A-Za-z0-9]/g, "").slice(0, 11) : undefined,
      adminEmail: env("ADMIN_EMAIL"),
    },
  };
}

if (import.meta.main) {
  const { apiKey, config } = configFromEnv();
  const client = apiKey ? brevo(apiKey, config) : undefined;
  if (!client) console.warn("[order-notify] BREVO_API_KEY absent : aucune notification envoyée");
  Deno.serve((req) =>
    handle(req, {
      repo: notifyRepo(),
      mailer: client,
      sms: client,
      config,
      userId: userIdFromRequest,
    }),
  );
}
