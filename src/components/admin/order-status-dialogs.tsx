/**
 * Fenêtres de confirmation des étapes sensibles d'une commande :
 * annulation (motif obligatoire) et livraison (encaissement du paiement).
 * Utilisées par la liste des commandes et par la fiche commande.
 */
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import { FARM_CANCEL_REASONS } from "@/lib/orders";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const OTHER = "__other";

export function CancelOrderDialog({
  open,
  onOpenChange,
  paid,
  busy = false,
  onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le client a déjà payé : rappeler le remboursement. */
  paid: boolean;
  busy?: boolean;
  onConfirm: (reason: string) => void;
}>) {
  const [choice, setChoice] = useState("");
  const [other, setOther] = useState("");

  useEffect(() => {
    if (open) {
      setChoice("");
      setOther("");
    }
  }, [open]);

  const reason = choice === OTHER ? other.trim() : choice;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annuler la commande</DialogTitle>
          <DialogDescription>
            Les articles sont remis en stock. Le motif est visible par le client dans « Mes
            commandes ».
          </DialogDescription>
        </DialogHeader>
        <form
          id="cancel-order"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason) onConfirm(reason);
          }}
          className="space-y-3"
        >
          <label className="block text-sm">
            <span className="font-medium">Motif</span>
            <select
              required
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className="input mt-1 w-full"
            >
              <option value="" disabled>
                Choisir un motif…
              </option>
              {FARM_CANCEL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value={OTHER}>Autre motif…</option>
            </select>
          </label>
          {choice === OTHER && (
            <textarea
              required
              maxLength={300}
              rows={2}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="Expliquez au client pourquoi la commande est annulée"
              className="input w-full"
            />
          )}
          {paid && (
            <p className="rounded-md bg-accent/15 px-3 py-2 text-sm">
              Le client a déjà payé : la commande passera en « Remboursement à faire ».
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Garder la commande
          </Button>
          <Button
            type="submit"
            form="cancel-order"
            variant="destructive"
            disabled={busy || !reason}
          >
            Annuler la commande
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeliverOrderDialog({
  open,
  onOpenChange,
  amount,
  toCollect,
  busy = false,
  onConfirm,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  /** Paiement à la livraison pas encore encaissé. */
  toCollect: boolean;
  busy?: boolean;
  onConfirm: (collected: boolean) => void;
}>) {
  const [collected, setCollected] = useState(true);

  useEffect(() => {
    if (open) setCollected(true);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commande livrée ?</DialogTitle>
          <DialogDescription>Confirmez que le client a bien reçu sa commande.</DialogDescription>
        </DialogHeader>
        {toCollect && (
          <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={collected}
              onChange={(e) => setCollected(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              J'ai encaissé <strong className="tabular-nums">{formatPrice(amount)}</strong>
              <span className="block text-xs text-muted-foreground">
                Décochez si le client n'a pas encore payé : la commande restera « Non payée ».
              </span>
            </span>
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Retour
          </Button>
          <Button disabled={busy} onClick={() => onConfirm(toCollect && collected)}>
            Confirmer la livraison
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
