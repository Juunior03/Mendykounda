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
