/**
 * Estimation du délai de livraison affichée au client.
 * À ajuster selon l'organisation réelle des tournées.
 */
const MIN_DAYS = 1;
const MAX_DAYS = 3;

const addDays = (d: Date, n: number) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(d);

/** Fenêtre de livraison estimée à partir d'une date de commande. */
export const deliveryWindow = (from: Date | string = new Date()) => {
  const start = new Date(from);
  return { start: addDays(start, MIN_DAYS), end: addDays(start, MAX_DAYS) };
};

/** Ex. « entre mardi 14 octobre et jeudi 16 octobre ». */
export const formatDeliveryWindow = (from: Date | string = new Date()) => {
  const { start, end } = deliveryWindow(from);
  return `entre ${fmt(start)} et ${fmt(end)}`;
};

export const formatLongDate = (d: Date | string) => fmt(new Date(d));

/**
 * Fenêtre de livraison d'une commande : à partir du jour d'abattage si elle
 * contient de la viande à l'abattage, sinon selon la date de commande.
 */
export const orderDeliveryWindow = (o: { created_at: string; slaughter_date?: string | null }) => {
  if (!o.slaughter_date) return deliveryWindow(o.created_at);
  const start = new Date(`${o.slaughter_date}T12:00:00`);
  return { start, end: addDays(start, MAX_DAYS - MIN_DAYS) };
};

export const formatOrderDeliveryWindow = (o: {
  created_at: string;
  slaughter_date?: string | null;
}) => {
  const { start, end } = orderDeliveryWindow(o);
  return `entre ${fmt(start)} et ${fmt(end)}`;
};
