/**
 * Statuts de commande : libellés et étapes du suivi.
 */
export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Commandée",
  processing: "En préparation",
  shipped: "Expédiée",
  delivered: "Livrée",
  cancelled: "Annulée",
};

/** Étapes affichées dans la barre de suivi (hors annulation). */
export const ORDER_STEPS: OrderStatus[] = ["pending", "processing", "shipped", "delivered"];

/** Le client peut annuler tant que la commande n'est pas expédiée. */
export const canCustomerCancel = (status: string, paymentStatus: string) =>
  (status === "pending" || status === "processing") && paymentStatus !== "paid";

export type PaymentMethod = "cash_on_delivery" | "wave";

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash_on_delivery: "Paiement à la livraison",
  wave: "Wave",
};

/** Commande Wave pas encore payée (et toujours active) : on peut relancer le paiement. */
export const canPayWithWave = (o: {
  payment_method: string;
  payment_status: string;
  status: string;
}) => o.payment_method === "wave" && o.payment_status !== "paid" && o.status !== "cancelled";

/** Numéro court affiché au client et sur les bons (8 premiers caractères de l'id). */
export const orderNumber = (id: string) => id.slice(0, 8).toUpperCase();

/** Étape suivante du traitement côté ferme (null une fois livrée ou annulée). */
export const NEXT_STATUS: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  pending: { to: "processing", label: "Commencer la préparation" },
  processing: { to: "shipped", label: "Marquer comme expédiée" },
  shipped: { to: "delivered", label: "Marquer comme livrée" },
};

/** Lien WhatsApp à partir d'un numéro saisi librement (indicatif +221 ajouté si absent). */
export const whatsappLink = (phone: string) => {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `221${digits}`;
  return digits.length >= 11 ? `https://wa.me/${digits}` : null;
};
