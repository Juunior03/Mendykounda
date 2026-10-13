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

/** Article d'une commande, éventuellement vendu au poids réel. */
interface LineLike {
  quantity: number;
  unit_price: number | string;
  sold_by_weight?: boolean;
  actual_quantity?: number | string | null;
}

/** Quantité facturée : poids pesé s'il est saisi, sinon quantité commandée. */
export const lineQuantity = (i: LineLike) =>
  i.actual_quantity != null ? Number(i.actual_quantity) : i.quantity;

/** Montant de la ligne, arrondi au franc comme en base (set_item_weight). */
export const lineTotal = (i: LineLike) => Math.round(Number(i.unit_price) * lineQuantity(i));

/** Article au poids pas encore pesé : montant estimé. */
export const awaitingWeight = (i: LineLike) => !!i.sold_by_weight && i.actual_quantity == null;

const weightFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
/** « 1,85 kg » */
export const formatWeight = (kg: number | string, unit = "kg") =>
  `${weightFmt.format(Number(kg))} ${unit}`;
