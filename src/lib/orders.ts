/**
 * Statuts de commande : libellés, étapes du suivi et passages autorisés.
 * Les passages sont aussi contrôlés par la base (orders_on_status_change).
 */
export type OrderStatus =
  | "pending"
  | "processing"
  | "ready"
  | "shipped"
  | "delivered"
  | "cancelled";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Commandée",
  processing: "En préparation",
  ready: "Prête",
  shipped: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
};

/** Explication courte de chaque statut (admin et client). */
export const ORDER_STATUS_HELP: Record<OrderStatus, string> = {
  pending: "Reçue, pas encore préparée",
  processing: "Récolte, abattage ou emballage en cours",
  ready: "Emballée, prête à partir",
  shipped: "Le livreur est en route",
  delivered: "Remise au client",
  cancelled: "Ne sera pas livrée",
};

/** Couleur de la pastille de statut. */
export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-accent/15 text-foreground",
  processing: "bg-accent/15 text-foreground",
  ready: "bg-ring/15 text-ring font-semibold",
  shipped: "bg-primary/10 text-primary",
  delivered: "bg-primary/10 text-primary",
  cancelled: "bg-destructive/10 text-destructive",
};

/** Étapes affichées dans la barre de suivi (hors annulation). */
export const ORDER_STEPS: OrderStatus[] = [
  "pending",
  "processing",
  "ready",
  "shipped",
  "delivered",
];

/** Passages autorisés depuis chaque statut (identiques à la base). */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["ready", "pending", "cancelled"],
  ready: ["shipped", "delivered", "processing", "cancelled"],
  shipped: ["delivered", "ready", "cancelled"],
  delivered: ["shipped"],
  cancelled: ["pending"],
};

/** Le client peut annuler seul tant que la préparation n'a pas commencé. */
export const canCustomerCancel = (status: string, paymentStatus: string) =>
  status === "pending" && paymentStatus !== "paid";

/** Motifs d'annulation proposés à la ferme. */
export const FARM_CANCEL_REASONS = [
  "Produit en rupture de stock",
  "Client injoignable",
  "Annulée à la demande du client",
  "Adresse ou zone non desservie",
  "Commande en double",
];

/** Motifs d'annulation proposés au client. */
export const CUSTOMER_CANCEL_REASONS = [
  "Je me suis trompé dans ma commande",
  "Le délai de livraison ne me convient pas",
  "J'ai trouvé ailleurs",
  "Je n'en ai plus besoin",
];

export const CANCELLED_BY_LABEL: Record<string, string> = {
  customer: "par vous",
  farm: "par la ferme",
  system: "automatiquement",
};

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
  processing: { to: "ready", label: "Marquer comme prête" },
  ready: { to: "shipped", label: "Partir en livraison" },
  shipped: { to: "delivered", label: "Marquer comme livrée" },
};

/** Retour en arrière proposé dans la fiche (libellé de l'action). */
export const BACK_STATUS: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  processing: { to: "pending", label: "Revenir à « Commandée »" },
  ready: { to: "processing", label: "Revenir à « En préparation »" },
  shipped: { to: "ready", label: "Livraison échouée : revenir à « Prête »" },
  delivered: { to: "shipped", label: "Corriger : pas encore livrée" },
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
