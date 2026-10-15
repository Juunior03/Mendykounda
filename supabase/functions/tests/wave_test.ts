/**
 * Tests du paiement Wave (sans réseau) :
 *   deno test --allow-env --allow-net supabase/functions/tests/
 */
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  type OrderRow,
  type OrdersRepo,
  startCheckout,
  syncOrder,
  verifyWebhook,
  type WaveApi,
  waveAmount,
  waveApi,
  type WaveSession,
} from "../_shared/wave.ts";
import { handle as checkoutHandle } from "../wave-checkout/index.ts";
import { handle as webhookHandle } from "../wave-webhook/index.ts";

/** Adresse fictive des requêtes de test (jamais appelée). */
const TEST_URL = "https://test.invalid/";

const USER = "11111111-1111-1111-1111-111111111111";
const ORDER = "22222222-2222-2222-2222-222222222222";
const SECRET = "wave_sn_WHS_test";

function memoryRepo(order: Partial<OrderRow> = {}) {
  const row: OrderRow = {
    id: ORDER,
    user_id: USER,
    total_amount: "15000.00",
    status: "pending",
    payment_status: "unpaid",
    payment_method: "wave",
    payment_session_id: null,
    ...order,
  };
  const repo: OrdersRepo & { row: OrderRow } = {
    row,
    findById: (id) => Promise.resolve(id === row.id ? { ...row } : null),
    findBySession: (s) => Promise.resolve(s === row.payment_session_id ? { ...row } : null),
    setSession: (_id, s) => {
      row.payment_session_id = s;
      return Promise.resolve();
    },
    markPaid: (_id, s) => {
      row.payment_status = "paid";
      row.payment_session_id = s;
      return Promise.resolve();
    },
  };
  return repo;
}

function fakeWave(overrides: Partial<WaveSession> = {}) {
  const sessions = new Map<string, WaveSession>();
  const created: unknown[] = [];
  let n = 0;
  const wave: WaveApi & { sessions: typeof sessions; created: unknown[] } = {
    sessions,
    created,
    createSession(input) {
      created.push(input);
      const s: WaveSession = {
        id: `cos-${++n}`,
        amount: input.amount,
        currency: input.currency,
        client_reference: input.client_reference,
        checkout_status: "open",
        payment_status: "processing",
        wave_launch_url: `https://pay.wave.com/c/cos-${n}`,
        ...overrides,
      };
      sessions.set(s.id, s);
      return Promise.resolve(s);
    },
    getSession(id) {
      const s = sessions.get(id);
      if (!s) return Promise.reject(new Error("not found"));
      return Promise.resolve({ ...s });
    },
  };
  return wave;
}

const SITE = "https://mendykounda.example";

/* ---------------- montants ---------------- */

Deno.test("waveAmount : entier XOF, refuse les décimales", () => {
  assertEquals(waveAmount("15000.00"), "15000");
  assertEquals(waveAmount(2500), "2500");
  for (const bad of ["1500.50", 0, -10, "abc"]) {
    let threw = false;
    try {
      waveAmount(bad);
    } catch {
      threw = true;
    }
    assertEquals(threw, true, `devrait refuser ${bad}`);
  }
});

/* ---------------- création de session ---------------- */

Deno.test("startCheckout crée une session avec le montant de la base", async () => {
  const repo = memoryRepo();
  const wave = fakeWave();
  const res = await startCheckout(repo, wave, USER, ORDER, SITE + "/");
  assertEquals(res.status, "pending");
  assertEquals(res.launch_url, "https://pay.wave.com/c/cos-1");
  assertEquals(repo.row.payment_session_id, "cos-1");
  assertEquals(wave.created[0], {
    amount: "15000",
    currency: "XOF",
    client_reference: ORDER,
    success_url: `${SITE}/order-confirmation?id=${ORDER}&wave=success`,
    error_url: `${SITE}/order-confirmation?id=${ORDER}&wave=error`,
  });
});

Deno.test("startCheckout réutilise une session encore ouverte", async () => {
  const repo = memoryRepo();
  const wave = fakeWave();
  await startCheckout(repo, wave, USER, ORDER, SITE);
  const again = await startCheckout(repo, wave, USER, ORDER, SITE);
  assertEquals(again.launch_url, "https://pay.wave.com/c/cos-1");
  assertEquals(wave.created.length, 1);
});

Deno.test("startCheckout recrée une session si l'ancienne a expiré", async () => {
  const repo = memoryRepo();
  const wave = fakeWave();
  await startCheckout(repo, wave, USER, ORDER, SITE);
  wave.sessions.get("cos-1")!.checkout_status = "expired";
  const again = await startCheckout(repo, wave, USER, ORDER, SITE);
  assertEquals(again.launch_url, "https://pay.wave.com/c/cos-2");
  assertEquals(repo.row.payment_session_id, "cos-2");
});

Deno.test("startCheckout refuse : autre client, annulée, paiement à la livraison", async () => {
  await assertRejects(
    () => startCheckout(memoryRepo(), fakeWave(), "x", ORDER, SITE),
    Error,
    "introuvable",
  );
  await assertRejects(
    () => startCheckout(memoryRepo({ status: "cancelled" }), fakeWave(), USER, ORDER, SITE),
    Error,
    "annulée",
  );
  await assertRejects(
    () =>
      startCheckout(
        memoryRepo({ payment_method: "cash_on_delivery" }),
        fakeWave(),
        USER,
        ORDER,
        SITE,
      ),
    Error,
    "pas payable",
  );
  const paid = await startCheckout(
    memoryRepo({ payment_status: "paid" }),
    fakeWave(),
    USER,
    ORDER,
    SITE,
  );
  assertEquals(paid.status, "paid");
});

/* ---------------- synchronisation ---------------- */

Deno.test("syncOrder marque payé seulement si Wave confirme succeeded", async () => {
  const repo = memoryRepo();
  const wave = fakeWave();
  await startCheckout(repo, wave, USER, ORDER, SITE);
  assertEquals(await syncOrder(repo, wave, repo.row), "pending");
  assertEquals(repo.row.payment_status, "unpaid");

  wave.sessions.get("cos-1")!.payment_status = "succeeded";
  wave.sessions.get("cos-1")!.checkout_status = "complete";
  assertEquals(await syncOrder(repo, wave, repo.row), "paid");
  assertEquals(repo.row.payment_status, "paid");
});

Deno.test("syncOrder refuse une session dont le montant ou la référence diffère", async () => {
  const check = async (tamper: Partial<WaveSession>) => {
    const repo = memoryRepo({ payment_session_id: "cos-x" });
    const wave = fakeWave();
    wave.sessions.set("cos-x", {
      id: "cos-x",
      amount: "15000",
      currency: "XOF",
      client_reference: ORDER,
      checkout_status: "complete",
      payment_status: "succeeded",
      wave_launch_url: "",
      ...tamper,
    });
    assertEquals(await syncOrder(repo, wave, repo.row), "failed");
    assertEquals(repo.row.payment_status, "unpaid");
  };
  await Promise.all(
    [{ amount: "100" }, { client_reference: "autre" }, { currency: "EUR" }].map(check),
  );
});

/* ---------------- signature webhook ---------------- */

async function sign(body: string, t: number, secret = SECRET) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}${body}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("verifyWebhook : signature, secret partagé, horodatage", async () => {
  const body = '{"type":"checkout.session.completed"}';
  const now = 1_800_000_000;
  const good = await sign(body, now);
  const h = (v: Record<string, string>) => new Headers(v);

  assertEquals(
    await verifyWebhook(h({ "Wave-Signature": `t=${now},v1=${good}` }), body, SECRET, now),
    true,
  );
  assertEquals(
    await verifyWebhook(
      h({ "Wave-Signature": `t=${now},v1=deadbeef,v1=${good}` }),
      body,
      SECRET,
      now,
    ),
    true,
  );
  assertEquals(
    await verifyWebhook(h({ Authorization: `Bearer ${SECRET}` }), body, SECRET, now),
    true,
  );

  assertEquals(
    await verifyWebhook(h({ "Wave-Signature": `t=${now},v1=${good}` }), body + " ", SECRET, now),
    false,
  );
  assertEquals(
    await verifyWebhook(h({ "Wave-Signature": `t=${now},v1=${good}` }), body, SECRET, now + 3600),
    false,
  );
  assertEquals(await verifyWebhook(h({ Authorization: "Bearer autre" }), body, SECRET, now), false);
  assertEquals(await verifyWebhook(h({}), body, SECRET, now), false);
});

/* ---------------- handlers HTTP ---------------- */

Deno.test("wave-webhook : refuse sans signature, relit la session chez Wave", async () => {
  const repo = memoryRepo();
  const wave = fakeWave();
  await startCheckout(repo, wave, USER, ORDER, SITE);
  const deps = { repo, wave, secret: SECRET };
  const event = JSON.stringify({
    id: "EV_1",
    type: "checkout.session.completed",
    data: { id: "cos-1", client_reference: ORDER, payment_status: "succeeded" },
  });
  const t = Math.floor(Date.now() / 1000);
  const signed = async () =>
    new Request(TEST_URL, {
      method: "POST",
      body: event,
      headers: { "Wave-Signature": `t=${t},v1=${await sign(event, t)}` },
    });

  const unsigned = await webhookHandle(
    new Request(TEST_URL, { method: "POST", body: event }),
    deps,
  );
  assertEquals(unsigned.status, 401);

  // Le webhook dit « succeeded » mais l'API Wave dit encore « processing » : pas payé.
  const r1 = await webhookHandle(await signed(), deps);
  assertEquals(r1.status, 200);
  assertEquals(repo.row.payment_status, "unpaid");

  wave.sessions.get("cos-1")!.payment_status = "succeeded";
  const r2 = await webhookHandle(await signed(), deps);
  assertEquals((await r2.json()).status, "paid");
  assertEquals(repo.row.payment_status, "paid");
});

Deno.test("wave-checkout : authentification et validation", async () => {
  const repo = memoryRepo();
  const wave = fakeWave();
  const deps = (uid: string | null) => ({
    repo,
    wave,
    userId: () => Promise.resolve(uid),
    siteUrl: SITE,
  });
  const post = (body: unknown) =>
    new Request(TEST_URL, { method: "POST", body: JSON.stringify(body) });

  assertEquals(
    (await checkoutHandle(post({ action: "create", order_id: ORDER }), deps(null))).status,
    401,
  );
  assertEquals(
    (await checkoutHandle(post({ action: "create", order_id: "pas-un-uuid" }), deps(USER))).status,
    400,
  );
  assertEquals(
    (
      await checkoutHandle(
        post({ action: "create", order_id: ORDER }),
        deps("33333333-3333-3333-3333-333333333333"),
      )
    ).status,
    404,
  );

  const ok = await checkoutHandle(post({ action: "create", order_id: ORDER }), deps(USER));
  assertEquals(ok.status, 200);
  assertEquals((await ok.json()).launch_url, "https://pay.wave.com/c/cos-1");

  const sync = await checkoutHandle(post({ action: "sync", order_id: ORDER }), deps(USER));
  assertEquals((await sync.json()).status, "pending");

  const preflight = await checkoutHandle(new Request(TEST_URL, { method: "OPTIONS" }), deps(null));
  assertEquals(preflight.headers.get("Access-Control-Allow-Origin"), "*");
});

/* ---------------- client HTTP réel contre un faux serveur ---------------- */

Deno.test("waveApi envoie la bonne requête à l'API Wave", async () => {
  let seen: { method: string; path: string; auth: string | null; body: unknown } | null = null;
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const url = new URL(req.url);
    seen = {
      method: req.method,
      path: url.pathname,
      auth: req.headers.get("authorization"),
      body: req.method === "POST" ? await req.json() : null,
    };
    if (url.pathname === "/v1/checkout/sessions/cos-404")
      return new Response('{"code":"not-found"}', { status: 404 });
    return Response.json({
      id: "cos-abc",
      amount: "15000",
      currency: "XOF",
      client_reference: ORDER,
      checkout_status: "open",
      payment_status: "processing",
      wave_launch_url: "https://pay.wave.com/c/cos-abc",
    });
  });
  try {
    const api = waveApi("wave_sn_prod_KEY", `http://localhost:${server.addr.port}`);
    const s = await api.createSession({
      amount: "15000",
      currency: "XOF",
      client_reference: ORDER,
      success_url: "a",
      error_url: "b",
    });
    assertEquals(s.id, "cos-abc");
    assertEquals(seen, {
      method: "POST",
      path: "/v1/checkout/sessions",
      auth: "Bearer wave_sn_prod_KEY",
      body: {
        amount: "15000",
        currency: "XOF",
        client_reference: ORDER,
        success_url: "a",
        error_url: "b",
      },
    });
    await api.getSession("cos-abc");
    assertEquals(seen!.method, "GET");
    assertEquals(seen!.path, "/v1/checkout/sessions/cos-abc");
    await assertRejects(() => api.getSession("cos-404"), Error, "indisponible");
  } finally {
    await server.shutdown();
  }
});
