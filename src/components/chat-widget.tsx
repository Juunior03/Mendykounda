/**
 * ChatWidget — pastille flottante (bottom-right) ouvrant la ChatBox.
 * Visible uniquement pour les clients connectés non-admin.
 * Affiche un badge de notification en cas de nouveaux messages du vendeur.
 */
import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChatBox } from "@/components/chat-box";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export function ChatWidget() {
  const { user, isAdmin, loading } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: unread = 0 } = useQuery({
    queryKey: ["chat-unread", user?.id],
    enabled: !!user && !isAdmin,
    queryFn: async () => {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_from_admin", true)
        .is("read_at", null);
      return count ?? 0;
    },
  });

  // Realtime on this user's thread
  useEffect(() => {
    if (!user || isAdmin) return;
    const channel = supabase
      .channel(`widget:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["chat-unread", user.id] }),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, isAdmin, qc]);

  // Mark as read when opening
  useEffect(() => {
    if (!open || !user) return;
    void supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_from_admin", true)
      .is("read_at", null)
      .then(() => qc.invalidateQueries({ queryKey: ["chat-unread", user.id] }));
  }, [open, user, qc]);

  if (loading || !user || isAdmin) return null;

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-background shadow-2xl md:right-6">
          <div className="flex items-center justify-between border-b border-border bg-secondary px-4 py-3">
            <div>
              <p className="text-sm font-medium">Discuter avec le vendeur</p>
              <p className="text-[11px] text-muted-foreground">Réponse sous quelques heures</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ChatBox userId={user.id} />
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Fermer le chat" : "Ouvrir le chat"}
        className="fixed bottom-5 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:scale-105 hover:opacity-90 md:right-6"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
            {unread}
          </span>
        )}
      </button>
    </>
  );
}
