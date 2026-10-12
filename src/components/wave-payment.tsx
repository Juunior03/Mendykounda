/**
 * Éléments d'interface du paiement Wave : bouton « Payer avec Wave » et
 * encart d'état affiché au retour de Wave (vérification + relance).
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { startWavePayment, syncWavePayment, type WavePaymentStatus } from "@/lib/wave";
import { cn } from "@/lib/utils";

export function WavePayButton({
  orderId,
  label = "Payer avec Wave",
  className,
}: {
  orderId: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const pay = async () => {
    setBusy(true);
    try {
      const status = await startWavePayment(orderId);
      if (status === "paid") {
        toast.success("Cette commande est déjà payée.");
        void qc.invalidateQueries({ queryKey: ["my-orders"] });
        void qc.invalidateQueries({ queryKey: ["order", orderId] });
        setBusy(false);
      }
      // Sinon : redirection vers Wave en cours, on laisse le bouton désactivé.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Paiement Wave indisponible");
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void pay()}
      disabled={busy}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60",
        className,
      )}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {busy ? "Ouverture de Wave…" : label}
    </button>
  );
}

const POLL_DELAYS_MS = [0, 2000, 3000, 5000, 8000];

/**
 * Au retour de Wave, relit l'état du paiement côté serveur (qui interroge
 * l'API Wave). Le webhook peut arriver un peu après : on réessaie quelques fois.
 */
export function WavePaymentStatusPanel({
  orderId,
  alreadyPaid,
  returnedWithError,
}: {
  orderId: string;
  alreadyPaid: boolean;
  returnedWithError: boolean;
}) {
  const [status, setStatus] = useState<WavePaymentStatus | "checking">(
    alreadyPaid ? "paid" : "checking",
  );
  const qc = useQueryClient();

  useEffect(() => {
    if (alreadyPaid) return;
    let cancelled = false;
    (async () => {
      let last: WavePaymentStatus = "pending";
      for (const delay of POLL_DELAYS_MS) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;
        try {
          last = await syncWavePayment(orderId);
        } catch {
          last = "pending";
        }
        if (last === "paid" || last === "failed") break;
        // Retour en erreur depuis Wave : inutile d'insister.
        if (returnedWithError) break;
      }
      if (cancelled) return;
      setStatus(last);
      if (last === "paid") {
        void qc.invalidateQueries({ queryKey: ["order", orderId] });
        void qc.invalidateQueries({ queryKey: ["my-orders"] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, alreadyPaid, returnedWithError, qc]);

  if (status === "paid") {
    return (
      <p className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
        <span>
          <span className="font-medium">Paiement Wave reçu.</span> Merci, votre commande est réglée.
        </span>
      </p>
    );
  }

  if (status === "checking") {
    return (
      <p className="flex items-center gap-2 rounded-md border border-border p-3 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
        Vérification de votre paiement Wave…
      </p>
    );
  }

  const failed = status === "failed" || returnedWithError;
  return (
    <div
      className={cn(
        "rounded-md border p-3 text-sm",
        failed ? "border-destructive/40 bg-destructive/5" : "border-accent/50 bg-accent/10",
      )}
    >
      <p className="flex items-start gap-2">
        <XCircle
          className={cn("mt-0.5 h-5 w-5 shrink-0", failed ? "text-destructive" : "text-accent")}
        />
        <span>
          {failed ? (
            <>
              <span className="font-medium">Le paiement Wave n'a pas abouti.</span> Votre commande
              est enregistrée : vous pouvez réessayer maintenant ou plus tard depuis « Mes commandes
              ».
            </>
          ) : (
            <>
              <span className="font-medium">Paiement pas encore confirmé.</span> Si vous venez de
              payer, la confirmation peut prendre quelques instants. Sinon, payez maintenant :
            </>
          )}
        </span>
      </p>
      <WavePayButton orderId={orderId} label="Payer avec Wave" className="mt-3" />
    </div>
  );
}
