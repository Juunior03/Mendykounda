/**
 * Accès base pour les notifications (clé service_role, côté serveur uniquement).
 */
import { adminClient } from "./orders-repo.ts";
import type { Channel, NotifyOrder, NotifyRepo } from "./notify.ts";

const COLUMN: Record<Channel, string> = {
  email: "confirmation_email_sent_at",
  sms: "confirmation_sms_sent_at",
};

export function notifyRepo(): NotifyRepo {
  const db = adminClient();
  return {
    async getOrder(id) {
      const { data, error } = await db
        .from("orders")
        .select(
          "id, user_id, created_at, total_amount, delivery_fee, status, payment_method, shipping_full_name, shipping_phone, shipping_address, shipping_city, shipping_postal_code, notes, order_items(product_name, quantity, unit_price)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { order_items, ...order } = data as Omit<NotifyOrder, "items"> & {
        order_items: NotifyOrder["items"];
      };
      return { ...order, items: order_items ?? [] };
    },
    async getUserEmail(userId) {
      const { data, error } = await db.auth.admin.getUserById(userId);
      if (error) throw error;
      return data.user?.email ?? null;
    },
    async claim(orderId, channel) {
      const { data, error } = await db
        .from("orders")
        .update({ [COLUMN[channel]]: new Date().toISOString() })
        .eq("id", orderId)
        .is(COLUMN[channel], null)
        .select("id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    async release(orderId, channel) {
      const { error } = await db
        .from("orders")
        .update({ [COLUMN[channel]]: null })
        .eq("id", orderId);
      if (error) throw error;
    },
  };
}
