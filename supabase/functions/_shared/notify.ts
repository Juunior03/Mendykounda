/**
 * Notifications de commande : e-mail de confirmation, SMS de confirmation et
 * alerte « nouvelle commande » pour la ferme. Envoi via l'API Brevo.
 *
 * Chaque canal est facultatif : sans configuration, il est simplement ignoré.
 * Un canal n'est envoyé qu'une fois par commande (réservation en base).
 */

export interface NotifyItem {
  product_name: string;
  quantity: number;
  unit_price: number | string;
  /** Vendu au poids réel : montant ajusté après la pesée. */
  sold_by_weight?: boolean;
}

export interface NotifyOrder {
  id: string;
  user_id: string;
  created_at: string;
  total_amount: number | string;
  /** Frais de livraison inclus dans total_amount (absent = 0). */
  delivery_fee?: number | string;
  status: string;
  payment_method: string;
  shipping_full_name: string;
  shipping_phone: string;
  shipping_address: string;
  shipping_city: string;
  notes: string | null;
  items: NotifyItem[];
}

export type Channel = "email" | "sms";

/** Infos de la ferme (Admin › Ferme) pour le pied des e-mails. */
export interface FarmInfo {
  name: string;
  location: string;
  phone?: string | null;
}

export const DEFAULT_FARM_INFO: FarmInfo = {
  name: "Ferme MendyKounda",
  location: "Région de Ziguinchor, Sénégal",
};

export interface NotifyRepo {
  getOrder(id: string): Promise<NotifyOrder | null>;
  /** Facultatif : infos de la ferme (table farm_settings). */
  getFarm?(): Promise<FarmInfo | null>;
  getUserEmail(userId: string): Promise<string | null>;
  /** Réserve l'envoi : true si personne ne l'a déjà fait (UPDATE … WHERE … IS NULL). */
  claim(orderId: string, channel: Channel): Promise<boolean>;
  /** Annule la réservation après un échec d'envoi (pour pouvoir réessayer). */
  release(orderId: string, channel: Channel): Promise<void>;
}

export interface Mailer {
  sendEmail(msg: {
    to: string;
    toName?: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
}

export interface SmsSender {
  sendSms(msg: { recipient: string; content: string }): Promise<void>;
}

export interface NotifyConfig {
  siteUrl: string;
  /** Adresse d'expédition validée dans Brevo ; sans elle, pas d'e-mail. */
  emailFrom?: { email: string; name: string };
  /** Nom d'expéditeur SMS (11 caractères max) ; sans lui, pas de SMS. */
  smsSender?: string;
  /** Destinataire de l'alerte « nouvelle commande » (facultatif). */
  adminEmail?: string;
}

/* ------------------------------------------------------------------ */
/* Client Brevo                                                        */
/* ------------------------------------------------------------------ */

export function brevo(
  apiKey: string,
  config: NotifyConfig,
  baseUrl = "https://api.brevo.com",
): Mailer & SmsSender {
  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Brevo ${path} -> ${res.status} ${text}`);
    }
  };
  return {
    sendEmail: (m) =>
      post("/v3/smtp/email", {
        sender: config.emailFrom,
        to: [{ email: m.to, ...(m.toName ? { name: m.toName } : {}) }],
        subject: m.subject,
        htmlContent: m.html,
        textContent: m.text,
        tags: ["commande"],
      }),
    sendSms: (m) =>
      post("/v3/transactionalSMS/send", {
        sender: config.smsSender,
        recipient: m.recipient,
        content: m.content,
        type: "transactional",
        tag: "commande",
      }),
  };
}

/* ------------------------------------------------------------------ */
/* Mise en forme                                                       */
/* ------------------------------------------------------------------ */

/** « 15 000 F CFA » avec des espaces simples (compatibles SMS). */
export function formatFcfa(n: number | string) {
  const v = Math.round(Number(n));
  const digits = String(Math.abs(v));
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }
  return `${v < 0 ? "-" : ""}${groups.join(" ")} F CFA`;
}

const deliveryLabel = (order: NotifyOrder) =>
  Number(order.delivery_fee ?? 0) > 0 ? formatFcfa(order.delivery_fee!) : "offerte";

export const orderNumber = (id: string) => id.slice(0, 8).toUpperCase();

const TZ = "Africa/Dakar";

/**
 * Fenêtre de livraison estimée : 1 à 3 jours après la commande.
 * Même règle que src/lib/delivery.ts (à garder synchronisée).
 */
export function deliveryWindow(createdAt: string) {
  const day = 24 * 3600 * 1000;
  const t = new Date(createdAt).getTime();
  return { start: new Date(t + day), end: new Date(t + 3 * day) };
}

const longDate = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(d);
const shortDate = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: TZ }).format(d);

export const PAYMENT_LABEL: Record<string, string> = {
  cash_on_delivery: "Paiement à la livraison",
  wave: "Wave",
};

export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/* ------------------------------------------------------------------ */
/* SMS                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Numéro au format attendu par Brevo (indicatif sans « + ») pour le Sénégal :
 * 77 123 45 67 / +221 77… / 00221 77… -> 221771234567. Sinon null (pas de SMS).
 */
export function normalizeSenegalPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("7")) d = `221${d}`;
  return /^2217\d{8}$/.test(d) ? d : null;
}

// Alphabet GSM-7 de base (+ extension) : au-delà, le SMS passe en Unicode
// et la limite tombe à 70 caractères.
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

export const isGsm7 = (s: string) => [...s].every((c) => GSM7.includes(c) || GSM7_EXT.includes(c));
export const gsm7Length = (s: string) =>
  [...s].reduce((n, c) => n + (GSM7_EXT.includes(c) ? 2 : 1), 0);

/** SMS de confirmation : un seul SMS (160 caractères GSM-7 max). */
export function buildSms(order: NotifyOrder, siteUrl: string): string {
  const { start, end } = deliveryWindow(order.created_at);
  const base =
    `MendyKounda: commande ${orderNumber(order.id)} confirmée (${formatFcfa(order.total_amount)}). ` +
    `Livraison prévue du ${shortDate(start)} au ${shortDate(end)}.`;
  const withLink = `${base} Suivi: ${siteUrl.replace(/\/$/, "")}/orders`;
  return isGsm7(withLink) && gsm7Length(withLink) <= 160 ? withLink : base;
}

/* ------------------------------------------------------------------ */
/* E-mails                                                             */
/* ------------------------------------------------------------------ */

const firstName = (full: string) => full.trim().split(/\s+/)[0] || "";

function itemsRows(order: NotifyOrder) {
  return order.items
    .map(
      (it) => `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(it.product_name)} <span style="color:#777">× ${it.quantity}${it.sold_by_weight ? " (estimé)" : ""}</span></td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${it.sold_by_weight ? "≈ " : ""}${formatFcfa(Number(it.unit_price) * it.quantity)}</td>
        </tr>`,
    )
    .join("");
}

function layout(title: string, body: string, farm: FarmInfo = DEFAULT_FARM_INFO) {
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f6f4ef;font-family:Arial,Helvetica,sans-serif;color:#222">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4ef;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">
        <tr><td style="background:#14532d;padding:18px 24px;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:1px">MENDYKOUNDA<span style="display:block;margin-top:4px;color:#f6ad55;font-size:11px;letter-spacing:3px">CASAMANCE • ZIGUINCHOR</span></td></tr>
        <tr><td style="padding:24px;font-size:14px;line-height:1.5">${body}</td></tr>
        <tr><td style="padding:16px 24px;background:#faf8f3;color:#888;font-size:12px">${escapeHtml(farm.name)} · Produits fermiers livrés · ${escapeHtml(farm.location)}${farm.phone ? ` · ${escapeHtml(farm.phone)}` : ""}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function buildCustomerEmail(
  order: NotifyOrder,
  siteUrl: string,
  farm: FarmInfo = DEFAULT_FARM_INFO,
) {
  const no = orderNumber(order.id);
  const { start, end } = deliveryWindow(order.created_at);
  const ordersUrl = `${siteUrl.replace(/\/$/, "")}/orders`;
  const payment = PAYMENT_LABEL[order.payment_method] ?? order.payment_method;
  const paymentNote =
    order.payment_method === "wave"
      ? "Si le paiement Wave n'a pas abouti, vous pouvez le relancer depuis « Mes commandes »."
      : "Vous réglerez à la réception de votre commande.";
  const name = firstName(order.shipping_full_name);
  const weighed = order.items.some((it) => it.sold_by_weight);
  const greeting = name ? `Merci ${name}` : "Merci";
  const greetingHtml = name ? `Merci ${escapeHtml(name)}` : "Merci";

  const html = layout(
    `Commande ${no} confirmée`,
    `<h1 style="margin:0 0 8px;font-size:20px">${greetingHtml}, votre commande est confirmée.</h1>
     <p style="margin:0 0 16px;color:#555">Commande n° <strong>${no}</strong></p>

     <p style="margin:0 0 4px;font-weight:bold;color:#15803d">Livraison prévue entre ${longDate(start)} et ${longDate(end)}</p>
     <p style="margin:0 0 20px;color:#555">${escapeHtml(order.shipping_full_name)}, ${escapeHtml(order.shipping_address)}, ${escapeHtml(order.shipping_city)} · Tél. ${escapeHtml(order.shipping_phone)}</p>

     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
       ${itemsRows(order)}
       <tr>
         <td style="padding:8px 0;border-bottom:1px solid #eee">Livraison</td>
         <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${deliveryLabel(order)}</td>
       </tr>
       <tr>
         <td style="padding:12px 0 0;font-weight:bold">${weighed ? "Total estimé" : "Total"}</td>
         <td style="padding:12px 0 0;text-align:right;font-weight:bold;white-space:nowrap">${formatFcfa(order.total_amount)}</td>
       </tr>
     </table>

     ${weighed ? `<p style="margin:12px 0 0;color:#555">Articles au poids réel : le montant final sera ajusté après la pesée, avant la livraison.</p>` : ""}
     <p style="margin:16px 0 0;color:#555">${payment}. ${paymentNote}</p>
     ${order.notes ? `<p style="margin:8px 0 0;color:#555">Instructions : ${escapeHtml(order.notes)}</p>` : ""}

     <p style="margin:24px 0 0">
       <a href="${escapeHtml(ordersUrl)}" style="display:inline-block;background:#d97706;color:#1a1a1a;text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:bold">Suivre ma commande</a>
     </p>
     <p style="margin:16px 0 0;color:#888;font-size:12px">Vous pouvez annuler gratuitement depuis « Mes commandes » tant que la commande n'est pas expédiée.</p>`,
    farm,
  );

  const text = [
    `${greeting}, votre commande ${no} est confirmée.`,
    "",
    ...order.items.map(
      (it) =>
        `- ${it.product_name} x ${it.quantity} : ${formatFcfa(Number(it.unit_price) * it.quantity)}`,
    ),
    `Livraison : ${deliveryLabel(order)}`,
    `Total : ${formatFcfa(order.total_amount)}`,
    "",
    `Livraison prévue entre ${longDate(start)} et ${longDate(end)}.`,
    `${order.shipping_full_name}, ${order.shipping_address}, ${order.shipping_city}`,
    `${payment}. ${paymentNote}`,
    "",
    `Suivre ma commande : ${ordersUrl}`,
  ].join("\n");

  return { subject: `Commande ${no} confirmée — MendyKounda`, html, text };
}

export function buildAdminEmail(
  order: NotifyOrder,
  siteUrl: string,
  farm: FarmInfo = DEFAULT_FARM_INFO,
) {
  const no = orderNumber(order.id);
  const adminUrl = `${siteUrl.replace(/\/$/, "")}/admin`;
  const payment = PAYMENT_LABEL[order.payment_method] ?? order.payment_method;
  const html = layout(
    `Nouvelle commande ${no}`,
    `<h1 style="margin:0 0 8px;font-size:20px">Nouvelle commande n° ${no}</h1>
     <p style="margin:0 0 16px;color:#555">${escapeHtml(order.shipping_full_name)} · ${escapeHtml(order.shipping_phone)}<br>
     ${escapeHtml(order.shipping_address)}, ${escapeHtml(order.shipping_city)}</p>
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
       ${itemsRows(order)}
       <tr>
         <td style="padding:8px 0;border-bottom:1px solid #eee">Livraison</td>
         <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${deliveryLabel(order)}</td>
       </tr>
       <tr><td style="padding:12px 0 0;font-weight:bold">Total</td>
       <td style="padding:12px 0 0;text-align:right;font-weight:bold">${formatFcfa(order.total_amount)}</td></tr>
     </table>
     <p style="margin:16px 0 0;color:#555">${payment}</p>
     ${order.notes ? `<p style="margin:8px 0 0;color:#555">Instructions : ${escapeHtml(order.notes)}</p>` : ""}
     <p style="margin:24px 0 0"><a href="${escapeHtml(adminUrl)}" style="color:#15803d;font-weight:bold">Ouvrir l'administration</a></p>`,
    farm,
  );
  const text = `Nouvelle commande ${no} — ${order.shipping_full_name} (${order.shipping_phone}), ${order.shipping_city}. Total ${formatFcfa(order.total_amount)}. ${payment}. ${adminUrl}`;
  return { subject: `Nouvelle commande ${no} — ${formatFcfa(order.total_amount)}`, html, text };
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export type ChannelResult = "sent" | "already_sent" | "skipped" | "failed";

export class NotFoundError extends Error {}

export async function notifyOrder(
  deps: { repo: NotifyRepo; mailer?: Mailer; sms?: SmsSender; config: NotifyConfig },
  userId: string,
  orderId: string,
): Promise<{ email: ChannelResult; sms: ChannelResult }> {
  const { repo, mailer, sms, config } = deps;
  const order = await repo.getOrder(orderId);
  if (!order || order.user_id !== userId) throw new NotFoundError("Commande introuvable");
  if (order.status === "cancelled") return { email: "skipped", sms: "skipped" };

  const send = async (
    channel: Channel,
    enabled: boolean,
    run: () => Promise<void>,
  ): Promise<ChannelResult> => {
    if (!enabled) return "skipped";
    if (!(await repo.claim(order.id, channel))) return "already_sent";
    try {
      await run();
      return "sent";
    } catch (err) {
      console.error(`[order-notify] ${channel} ${order.id}:`, err);
      await repo.release(order.id, channel);
      return "failed";
    }
  };

  const customerEmail = mailer && config.emailFrom ? await repo.getUserEmail(order.user_id) : null;

  const email = await send("email", !!(mailer && config.emailFrom && customerEmail), async () => {
    const farm = (await repo.getFarm?.().catch(() => null)) ?? DEFAULT_FARM_INFO;
    const msg = buildCustomerEmail(order, config.siteUrl, farm);
    await mailer!.sendEmail({ to: customerEmail!, toName: order.shipping_full_name, ...msg });
    // Alerte ferme : envoyée avec la confirmation client, une seule fois.
    if (config.adminEmail) {
      await mailer!
        .sendEmail({ to: config.adminEmail, ...buildAdminEmail(order, config.siteUrl, farm) })
        .catch((err) => console.error("[order-notify] alerte admin:", err));
    }
  });

  const phone = normalizeSenegalPhone(order.shipping_phone);
  const smsResult = await send("sms", !!(sms && config.smsSender && phone), () =>
    sms!.sendSms({ recipient: phone!, content: buildSms(order, config.siteUrl) }),
  );

  return { email, sms: smsResult };
}
