/**
 * Produits de saison : season_months = mois de disponibilité (1 à 12),
 * null = toute l'année. Hors saison, le produit n'est pas commandable
 * (même règle côté serveur dans place_order). Heure de Dakar = UTC.
 */
export const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
export const MONTHS_SHORT = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

type Seasonal = { season_months?: number[] | null };

export const currentMonth = () => new Date().getUTCMonth() + 1;

/** Produit à saison limitée (moins de 12 mois). */
export const isSeasonal = (p: Seasonal) =>
  !!p.season_months && p.season_months.length > 0 && p.season_months.length < 12;

export const inSeason = (p: Seasonal, month = currentMonth()) =>
  !p.season_months || p.season_months.length === 0 || p.season_months.includes(month);

/** Premier mois de saison à venir (après le mois courant). */
export const nextSeasonMonth = (p: Seasonal, month = currentMonth()) => {
  if (!p.season_months?.length) return null;
  for (let i = 1; i <= 12; i++) {
    const m = ((month - 1 + i) % 12) + 1;
    if (p.season_months.includes(m)) return m;
  }
  return null;
};

/** Dernier mois de la saison en cours (« jusqu'en août »). */
export const seasonEndMonth = (p: Seasonal, month = currentMonth()) => {
  if (!isSeasonal(p) || !inSeason(p, month)) return null;
  let m = month;
  for (let i = 0; i < 11; i++) {
    const next = (m % 12) + 1;
    if (!p.season_months!.includes(next)) break;
    m = next;
  }
  return m;
};

/** « mai à août », « novembre à février », « mars et juin », « toute l'année ». */
export const formatSeason = (months: number[] | null | undefined) => {
  if (!months?.length || months.length === 12) return "toute l'année";
  const set = new Set(months);
  // Plages consécutives, en tenant compte du passage décembre → janvier.
  const start = [...set].find((m) => !set.has(((m + 10) % 12) + 1)) ?? months[0];
  const runs: [number, number][] = [];
  let m = start;
  for (let i = 0; i < 12; i++) {
    if (set.has(m)) {
      const last = runs[runs.length - 1];
      if (last && (last[1] % 12) + 1 === m) last[1] = m;
      else runs.push([m, m]);
    }
    m = (m % 12) + 1;
  }
  const parts = runs.map(([a, b]) =>
    a === b ? MONTHS[a - 1] : `${MONTHS[a - 1]} à ${MONTHS[b - 1]}`,
  );
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}` : parts[0];
};

/** Libellé court pour un produit hors saison : « de retour en juin ». */
export const backInLabel = (p: Seasonal) => {
  const m = nextSeasonMonth(p);
  return m ? `de retour en ${MONTHS[m - 1]}` : null;
};
