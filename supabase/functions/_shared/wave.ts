/**
 * Intégration Wave Checkout (https://docs.wave.com/checkout).
 *
 * Principe de sécurité : une commande n'est marquée « payée » qu'après avoir
 * relu la session directement auprès de l'API Wave (avec la clé secrète).
 * Le contenu d'un webhook n'est jamais cru tel quel.
 */

export interface WaveSession {
  id: string;
  amount: string;
  currency: string;
  client_reference: string | null;
  /** "open", "complete", "expired"… */
  checkout_status: string;
  /** "processing", "cancelled", "succeeded"… */
  payment_status: string;
  wave_launch_url: string;
  when_expires?: string;
}

export interface OrderRow {
  id: string;
  user_id: string;
  total_amount: number | string;
  status: string;
  payment_status: string;
  payment_method: string;
  payment_session_id: string | null;
}

/** Accès base de données nécessaires (implémentés avec supabase-js en prod). */
export interface OrdersRepo {
  findById(id: string): Promise<OrderRow | null>;
  findBySession(sessionId: string): Promise<OrderRow | null>;
  setSession(orderId: string, sessionId: string): Promise<void>;
  markPaid(orderId: string, sessionId: string): Promise<void>;
}

export interface WaveApi {
  createSession(input: {
    amount: string;
    currency: "XOF";
    client_reference: string;
    success_url: string;
    error_url: string;
  }): Promise<WaveSession>;
  getSession(id: string): Promise<WaveSession>;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/* ------------------------------------------------------------------ */
/* Client HTTP Wave                                                    */
/* ------------------------------------------------------------------ */

export function waveApi(apiKey: string, baseUrl = "https://api.wave.com"): WaveApi {
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[wave] ${init.method ?? "GET"} ${path} -> ${res.status} ${text}`);
      throw new HttpError(502, "Le service Wave est indisponible, réessayez dans un instant.");
    }
    return JSON.parse(text) as WaveSession;
  };
  return {
    createSession: (input) =>
      call("/v1/checkout/sessions", { method: "POST", body: JSON.stringify(input) }),
    getSession: (id) => call(`/v1/checkout/sessions/${encodeURIComponent(id)}`),
  };
}

/* ------------------------------------------------------------------ */
/* Logique métier                                                      */
/* ------------------------------------------------------------------ */

/** Montant XOF au format attendu par Wave : entier, sans décimales. */
export function waveAmount(total: number | string): string {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new HttpError(400, "Montant incompatible avec Wave (le FCFA n'a pas de centimes).");
  }
  return String(n);
}

export type PaymentState = "paid" | "pending" | "failed";

/**
 * Applique l'état d'une session Wave (relue via l'API) à la commande.
 * Ne marque payé que si la session correspond exactement à la commande.
 */
export async function applySession(
  repo: OrdersRepo,
  order: OrderRow,
  session: WaveSession,
): Promise<PaymentState> {
  if (order.payment_status === "paid") return "paid";

  const matches =
    session.client_reference === order.id &&
    session.currency === "XOF" &&
    Number(session.amount) === Number(order.total_amount);

  if (!matches) {
    console.error(`[wave] session ${session.id} ne correspond pas à la commande ${order.id}`);
    return "failed";
  }

  if (session.payment_status === "succeeded") {
    await repo.markPaid(order.id, session.id);
    return "paid";
  }
  if (session.checkout_status === "expired" || session.payment_status === "cancelled")
    return "failed";
  return "pending";
}

/** Crée (ou réutilise) la session de paiement d'une commande. */
export async function startCheckout(
  repo: OrdersRepo,
  wave: WaveApi,
  userId: string,
  orderId: string,
  siteUrl: string,
): Promise<{ status: PaymentState; launch_url?: string }> {
  const order = await repo.findById(orderId);
  if (order?.user_id !== userId || !order) throw new HttpError(404, "Commande introuvable");
  if (order.payment_status === "paid") return { status: "paid" };
  if (order.status === "cancelled") throw new HttpError(409, "Cette commande est annulée");
  if (order.payment_method !== "wave")
    throw new HttpError(400, "Cette commande n'est pas payable par Wave");

  // Une session encore ouverte est réutilisée (évite les doubles paiements).
  if (order.payment_session_id) {
    const existing = await wave.getSession(order.payment_session_id);
    const state = await applySession(repo, order, existing);
    if (state === "paid") return { status: "paid" };
    if (existing.checkout_status === "open")
      return { status: "pending", launch_url: existing.wave_launch_url };
  }

  const base = siteUrl.replace(/\/$/, "");
  const back = `${base}/order-confirmation?id=${encodeURIComponent(order.id)}&wave=`;
  const session = await wave.createSession({
    amount: waveAmount(order.total_amount),
    currency: "XOF",
    client_reference: order.id,
    success_url: `${back}success`,
    error_url: `${back}error`,
  });
  await repo.setSession(order.id, session.id);
  return { status: "pending", launch_url: session.wave_launch_url };
}

/** Relit la session auprès de Wave (retour sur le site ou webhook). */
export async function syncOrder(
  repo: OrdersRepo,
  wave: WaveApi,
  order: OrderRow,
): Promise<PaymentState> {
  if (order.payment_status === "paid") return "paid";
  if (!order.payment_session_id) return "pending";
  const session = await wave.getSession(order.payment_session_id);
  return applySession(repo, order, session);
}

/* ------------------------------------------------------------------ */
/* Webhook : vérification de l'appelant                                */
/* ------------------------------------------------------------------ */

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  return diff === 0;
};

/**
 * Vérifie qu'un webhook vient de Wave. Deux modes possibles côté Wave Business :
 *  - « secret partagé » : en-tête `Authorization: Bearer <secret>` ;
 *  - « secret de signature » : en-tête `Wave-Signature: t=<horodatage>,v1=<hmac>`,
 *    HMAC-SHA256 (hex) de `<horodatage><corps brut>`.
 */
export async function verifyWebhook(
  headers: Headers,
  rawBody: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): Promise<boolean> {
  const auth = headers.get("authorization");
  if (auth && safeEqual(auth, `Bearer ${secret}`)) return true;

  const sig = headers.get("wave-signature");
  if (!sig) return false;
  const parts = sig.split(",").map((p) => p.trim());
  const t = parts.find((p) => p.startsWith("t="))?.slice(2);
  const candidates = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3).toLowerCase());
  if (!t || !/^\d+$/.test(t) || candidates.length === 0) return false;
  if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = toHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + rawBody)),
  );
  return candidates.some((c) => safeEqual(c, expected));
}
