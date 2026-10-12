/**
 * Tests des notifications de commande (sans réseau) :
 *   deno test --allow-env --allow-net supabase/functions/tests/
 */
import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import {
  brevo,
  buildCustomerEmail,
  buildSms,
  type Channel,
  formatFcfa,
  gsm7Length,
  isGsm7,
  normalizeSenegalPhone,
  notifyOrder,
  type NotifyOrder,
  type NotifyRepo,
} from "../_shared/notify.ts";
import { handle } from "../order-notify/index.ts";

const USER = "11111111-1111-1111-1111-111111111111";
const ORDER = "0f3a9c21-2222-4222-8222-222222222222";
const SITE = "https://mendykounda.sn";

const order = (over: Partial<NotifyOrder> = {}): NotifyOrder => ({
  id: ORDER,
  user_id: USER,
  created_at: "2026-10-12T10:00:00Z",
  total_amount: "13500.00",
  status: "pending",
  payment_method: "cash_on_delivery",
  shipping_full_name: "Awa Diop",
  shipping_phone: "77 123 45 67",
  shipping_address: "Rue 10, Sicap Liberté",
  shipping_city: "Dakar",
  shipping_postal_code: "10000",
  notes: null,
  items: [
    { product_name: "Poulet fermier", quantity: 2, unit_price: "5500.00" },
    { product_name: "Plateau de 30 œufs", quantity: 1, unit_price: "2500.00" },
  ],
  ...over,
});

function memoryRepo(o: NotifyOrder | null = order(), email: string | null = "awa@example.sn") {
  const sent: Record<Channel, string | null> = { email: null, sms: null };
  const repo: NotifyRepo & { sent: typeof sent } = {
    sent,
    getOrder: async (id) => (o && id === o.id ? o : null),
    getUserEmail: async () => email,
    claim: async (_id, ch) => {
      if (sent[ch]) return false;
      sent[ch] = "now";
      return true;
    },
    release: async (_id, ch) => void (sent[ch] = null),
  };
  return repo;
}

function fakeSenders(fail: Partial<Record<Channel, boolean>> = {}) {
  const emails: { to: string; subject: string; html: string; text: string }[] = [];
  const sms: { recipient: string; content: string }[] = [];
  return {
    emails,
    sms,
    mailer: {
      sendEmail: async (m: { to: string; subject: string; html: string; text: string }) => {
        if (fail.email) throw new Error("Brevo KO");
        emails.push(m);
      },
    },
    smsSender: {
      sendSms: async (m: { recipient: string; content: string }) => {
        if (fail.sms) throw new Error("Brevo KO");
        sms.push(m);
      },
    },
  };
}

const fullConfig = {
  siteUrl: SITE,
  emailFrom: { email: "commandes@mendykounda.sn", name: "MendyKounda" },
  smsSender: "MendyKounda",
  adminEmail: "ferme@mendykounda.sn",
};

/* ---------------- mise en forme ---------------- */

Deno.test("normalizeSenegalPhone", () => {
  assertEquals(normalizeSenegalPhone("77 123 45 67"), "221771234567");
  assertEquals(normalizeSenegalPhone("+221 77 123 45 67"), "221771234567");
  assertEquals(normalizeSenegalPhone("00221771234567"), "221771234567");
  assertEquals(normalizeSenegalPhone("221-70-123-45-67"), "221701234567");
  assertEquals(normalizeSenegalPhone("33 812 34 56"), null); // fixe : pas de SMS
  assertEquals(normalizeSenegalPhone("+33 6 12 34 56 78"), null); // étranger
  assertEquals(normalizeSenegalPhone("123"), null);
});

Deno.test("formatFcfa", () => {
  assertEquals(formatFcfa("13500.00"), "13 500 F CFA");
  assertEquals(formatFcfa(1000000), "1 000 000 F CFA");
  assertEquals(formatFcfa(500), "500 F CFA");
});

Deno.test("SMS : un seul SMS GSM-7 avec n°, total, dates et lien", () => {
  const s = buildSms(order(), SITE);
  assert(isGsm7(s), s);
  assert(gsm7Length(s) <= 160, `${gsm7Length(s)} caractères`);
  assertStringIncludes(s, "0F3A9C21");
  assertStringIncludes(s, "13 500 F CFA");
  assertStringIncludes(s, "du 13/10 au 15/10");
  assertStringIncludes(s, `${SITE}/orders`);
});

Deno.test("SMS : lien retiré si le message dépasserait 160 caractères", () => {
  const s = buildSms(
    order(),
    "https://une-adresse-de-site-vraiment-tres-longue-pour-le-test.example.com",
  );
  assert(gsm7Length(s) <= 160);
  assert(!s.includes("Suivi"));
});

Deno.test("e-mail client : contenu et échappement HTML", () => {
  const m = buildCustomerEmail(
    order({
      items: [{ product_name: "<script>alert(1)</script>", quantity: 1, unit_price: 1000 }],
      total_amount: 1000,
    }),
    SITE,
  );
  assertStringIncludes(m.subject, "0F3A9C21");
  assertStringIncludes(m.html, "&lt;script&gt;");
  assert(!m.html.includes("<script>"));
  assertStringIncludes(m.html, `${SITE}/orders`);
  assertStringIncludes(m.html, "Merci Awa");
  assertStringIncludes(m.text, "Total : 1 000 F CFA");
});

/* ---------------- orchestration ---------------- */

Deno.test("notifyOrder : e-mail client + alerte ferme + SMS, une seule fois", async () => {
  const repo = memoryRepo();
  const f = fakeSenders();
  const deps = { repo, mailer: f.mailer, sms: f.smsSender, config: fullConfig };

  assertEquals(await notifyOrder(deps, USER, ORDER), { email: "sent", sms: "sent" });
  assertEquals(
    f.emails.map((e) => e.to),
    ["awa@example.sn", "ferme@mendykounda.sn"],
  );
  assertEquals(f.sms, [{ recipient: "221771234567", content: buildSms(order(), SITE) }]);

  // Deuxième appel (double clic, rechargement…) : rien n'est renvoyé.
  assertEquals(await notifyOrder(deps, USER, ORDER), {
    email: "already_sent",
    sms: "already_sent",
  });
  assertEquals(f.emails.length, 2);
  assertEquals(f.sms.length, 1);
});

Deno.test("notifyOrder : un échec libère la réservation pour réessayer", async () => {
  const repo = memoryRepo();
  const ko = fakeSenders({ email: true, sms: true });
  const res = await notifyOrder(
    { repo, mailer: ko.mailer, sms: ko.smsSender, config: fullConfig },
    USER,
    ORDER,
  );
  assertEquals(res, { email: "failed", sms: "failed" });
  assertEquals(repo.sent, { email: null, sms: null });

  const ok = fakeSenders();
  const res2 = await notifyOrder(
    { repo, mailer: ok.mailer, sms: ok.smsSender, config: fullConfig },
    USER,
    ORDER,
  );
  assertEquals(res2, { email: "sent", sms: "sent" });
});

Deno.test("notifyOrder : canaux ignorés si non configurés ou numéro invalide", async () => {
  const f = fakeSenders();
  assertEquals(await notifyOrder({ repo: memoryRepo(), config: { siteUrl: SITE } }, USER, ORDER), {
    email: "skipped",
    sms: "skipped",
  });
  assertEquals(
    await notifyOrder(
      {
        repo: memoryRepo(order({ shipping_phone: "33 812 34 56" })),
        mailer: f.mailer,
        sms: f.smsSender,
        config: fullConfig,
      },
      USER,
      ORDER,
    ),
    { email: "sent", sms: "skipped" },
  );
  assertEquals(
    await notifyOrder(
      { repo: memoryRepo(order(), null), mailer: f.mailer, sms: f.smsSender, config: fullConfig },
      USER,
      ORDER,
    ),
    { email: "skipped", sms: "sent" },
  );
});

Deno.test("notifyOrder : refuse la commande d'un autre, ignore une commande annulée", async () => {
  const f = fakeSenders();
  await assertRejects(
    () =>
      notifyOrder(
        { repo: memoryRepo(), mailer: f.mailer, sms: f.smsSender, config: fullConfig },
        "autre",
        ORDER,
      ),
    Error,
    "introuvable",
  );
  assertEquals(
    await notifyOrder(
      {
        repo: memoryRepo(order({ status: "cancelled" })),
        mailer: f.mailer,
        sms: f.smsSender,
        config: fullConfig,
      },
      USER,
      ORDER,
    ),
    { email: "skipped", sms: "skipped" },
  );
  assertEquals(f.emails.length + f.sms.length, 0);
});

/* ---------------- handler HTTP ---------------- */

Deno.test("order-notify : authentification et validation", async () => {
  const f = fakeSenders();
  const deps = (uid: string | null) => ({
    repo: memoryRepo(),
    mailer: f.mailer,
    sms: f.smsSender,
    config: fullConfig,
    userId: async () => uid,
  });
  const post = (body: unknown) =>
    new Request("http://x", { method: "POST", body: JSON.stringify(body) });
  assertEquals((await handle(post({ order_id: ORDER }), deps(null))).status, 401);
  assertEquals((await handle(post({ order_id: "x" }), deps(USER))).status, 400);
  assertEquals(
    (await handle(post({ order_id: ORDER }), deps("33333333-3333-3333-3333-333333333333"))).status,
    404,
  );
  const ok = await handle(post({ order_id: ORDER }), deps(USER));
  assertEquals(await ok.json(), { email: "sent", sms: "sent" });
});

/* ---------------- client Brevo contre un faux serveur ---------------- */

Deno.test("brevo : requêtes e-mail et SMS conformes", async () => {
  const seen: { path: string; key: string | null; body: Record<string, unknown> }[] = [];
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    seen.push({
      path: new URL(req.url).pathname,
      key: req.headers.get("api-key"),
      body: await req.json(),
    });
    if (seen.length === 3) return new Response('{"code":"unauthorized"}', { status: 401 });
    return Response.json({ messageId: "m-1" }, { status: 201 });
  });
  try {
    const client = brevo("xkeysib-TEST", fullConfig, `http://localhost:${server.addr.port}`);
    await client.sendEmail({
      to: "awa@example.sn",
      toName: "Awa Diop",
      subject: "S",
      html: "<p>H</p>",
      text: "T",
    });
    await client.sendSms({ recipient: "221771234567", content: "Bonjour" });
    await assertRejects(
      () => client.sendSms({ recipient: "221771234567", content: "x" }),
      Error,
      "401",
    );

    assertEquals(seen[0].path, "/v3/smtp/email");
    assertEquals(seen[0].key, "xkeysib-TEST");
    assertEquals(seen[0].body, {
      sender: { email: "commandes@mendykounda.sn", name: "MendyKounda" },
      to: [{ email: "awa@example.sn", name: "Awa Diop" }],
      subject: "S",
      htmlContent: "<p>H</p>",
      textContent: "T",
      tags: ["commande"],
    });
    assertEquals(seen[1].path, "/v3/transactionalSMS/send");
    assertEquals(seen[1].body, {
      sender: "MendyKounda",
      recipient: "221771234567",
      content: "Bonjour",
      type: "transactional",
      tag: "commande",
    });
  } finally {
    await server.shutdown();
  }
});

Deno.test("e-mail client : ligne de livraison (payante ou offerte)", () => {
  const paid = buildCustomerEmail(order({ total_amount: 5000, delivery_fee: 2000 }), SITE);
  assertStringIncludes(paid.html, "Livraison");
  assertStringIncludes(paid.html, "2 000 F CFA");
  assertStringIncludes(paid.text, "Livraison : 2 000 F CFA");
  const free = buildCustomerEmail(order(), SITE);
  assertStringIncludes(free.text, "Livraison : offerte");
});
