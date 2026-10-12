/**
 * Accès aux commandes avec la clé service_role (contourne les RLS) :
 * uniquement côté serveur, dans les Edge Functions.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import type { OrderRow, OrdersRepo } from "./wave.ts";

const COLUMNS =
  "id, user_id, total_amount, status, payment_status, payment_method, payment_session_id";

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function ordersRepo(): OrdersRepo {
  const db = adminClient();
  const one = async (column: string, value: string) => {
    const { data, error } = await db.from("orders").select(COLUMNS).eq(column, value).maybeSingle();
    if (error) throw error;
    return data as OrderRow | null;
  };
  return {
    findById: (id) => one("id", id),
    findBySession: (sessionId) => one("payment_session_id", sessionId),
    async setSession(orderId, sessionId) {
      const { error } = await db
        .from("orders")
        .update({ payment_session_id: sessionId })
        .eq("id", orderId);
      if (error) throw error;
    },
    async markPaid(orderId, sessionId) {
      const { error } = await db
        .from("orders")
        .update({
          payment_status: "paid",
          paid_at: new Date().toISOString(),
          payment_session_id: sessionId,
        })
        .eq("id", orderId)
        .neq("payment_status", "paid");
      if (error) throw error;
    },
  };
}

/** Identifie l'utilisateur à partir du jeton envoyé par le navigateur. */
export async function userIdFromRequest(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
