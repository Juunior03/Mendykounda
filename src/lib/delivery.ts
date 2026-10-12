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
