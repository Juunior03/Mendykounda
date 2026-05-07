/**
 * ChatWidget — pastille flottante (bottom-right) ouvrant la ChatBox.
 * Visible uniquement pour les clients connectés non-admin.
 */
import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { ChatBox } from "@/components/chat-box";
import { useAuth } from "@/lib/auth";

export function ChatWidget() {
  const { user, isAdmin, loading } = useAuth();
  const [open, setOpen] = useState(false);

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
      </button>
    </>
  );
}
