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
