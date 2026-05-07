/**
 * Formatting helpers for prices, dates, ratings.
 * Locale: fr-FR. Devise par défaut : FCFA (XOF) — marché Sénégal.
 */
export const formatPrice = (amount: number, currency = "XOF") =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );
