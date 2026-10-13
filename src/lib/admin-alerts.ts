/**
 * Pastilles de l'admin : commandes à préparer (statut « Commandée ») et
 * messages de clients non lus. Mises à jour en temps réel (Supabase
 * Realtime), avec une vérification toutes les minutes en secours.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const ADMIN_ALERTS_KEY = ["admin-alerts"];

export interface AdminAlerts {
  orders: number;
  messages: number;
}

const NONE: AdminAlerts = { orders: 0, messages: 0 };

export function useAdminAlerts(): AdminAlerts & { total: number } {
  const { isAdmin } = useAuth();
  const { data = NONE } = useQuery({
    queryKey: ADMIN_ALERTS_KEY,
    enabled: isAdmin,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<AdminAlerts> => {
      const [orders, messages] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("is_from_admin", false)
          .is("read_at", null),
      ]);
      return { orders: orders.count ?? 0, messages: messages.count ?? 0 };
    },
  });
  const alerts = isAdmin ? data : NONE;
  return { ...alerts, total: alerts.orders + alerts.messages };
}

/** À monter une seule fois (en-tête du site) : écoute les nouvelles commandes et messages. */
export function useAdminAlertsSync() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!isAdmin) return;
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ADMIN_ALERTS_KEY });
      void qc.invalidateQueries({ queryKey: ["admin-orders"] });
    };
    const channel = supabase
      .channel("admin-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () =>
        qc.invalidateQueries({ queryKey: ADMIN_ALERTS_KEY }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, qc]);
}

/** « 3 », « 99+ » */
export const badgeLabel = (n: number) => (n > 99 ? "99+" : String(n));
