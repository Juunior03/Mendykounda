/**
 * Numéros de téléphone : indicatif +221 (Sénégal) par défaut, chiffres
 * uniquement, format « +221 77 123 45 67 » à l'enregistrement.
 * Sénégal : 9 chiffres, mobiles 70 à 78, fixes 33.
 */

export interface Country {
  code: string;
  name: string;
  flag: string;
  /** Nombre de chiffres attendus après l'indicatif (min, max). */
  length: [number, number];
}

export const DEFAULT_COUNTRY_CODE = "221";

// Sénégal et pays proches de la Casamance, plus la France (diaspora).
export const COUNTRIES: Country[] = [
  { code: "221", name: "Sénégal", flag: "🇸🇳", length: [9, 9] },
  { code: "220", name: "Gambie", flag: "🇬🇲", length: [7, 7] },
  { code: "245", name: "Guinée-Bissau", flag: "🇬🇼", length: [7, 9] },
  { code: "224", name: "Guinée", flag: "🇬🇳", length: [9, 9] },
  { code: "223", name: "Mali", flag: "🇲🇱", length: [8, 8] },
  { code: "222", name: "Mauritanie", flag: "🇲🇷", length: [8, 8] },
  { code: "33", name: "France", flag: "🇫🇷", length: [9, 9] },
];

const byCode = (code: string) => COUNTRIES.find((c) => c.code === code);
const SENEGAL = /^(7[0-8]|33)\d{7}$/;

export const maxDigits = (code: string) => byCode(code)?.length[1] ?? 12;

/** Décompose un numéro saisi ou enregistré en { indicatif, chiffres locaux }. */
export function parsePhone(value: string | null | undefined): { code: string; local: string } {
  const raw = (value ?? "").trim();
  let digits = raw.replaceAll(/\D/g, "");
  if (!digits) return { code: DEFAULT_COUNTRY_CODE, local: "" };
  const international = raw.startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Indicatif reconnu (ex. « +221 … », « 00221… » ou « 221771234567 »).
  const match = [...COUNTRIES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((c) => digits.startsWith(c.code) && digits.length - c.code.length >= c.length[0]);
  if (match && (international || digits.length > 9)) {
    return { code: match.code, local: digits.slice(match.code.length) };
  }
  return { code: DEFAULT_COUNTRY_CODE, local: digits };
}

/** Chiffres locaux mis en forme : « 77 123 45 67 » (Sénégal), sinon par paires. */
export function formatLocal(code: string, local: string) {
  const d = local.replaceAll(/\D/g, "");
  if (code === "221") {
    return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(" ");
  }
  // Nombre impair de chiffres : premier chiffre seul (ex. France « 6 12 34 56 78 »).
  const head = d.length % 2 ? d.slice(0, 1) : "";
  const pairs = d.slice(head.length).match(/\d{1,2}/g) ?? [];
  return [head, ...pairs].filter(Boolean).join(" ");
}

export const formatPhone = (code: string, local: string) =>
  local ? `+${code} ${formatLocal(code, local)}` : "";

/** Message d'erreur, ou null si le numéro est valide. */
export function phoneError(code: string, local: string): string | null {
  const d = local.replaceAll(/\D/g, "");
  if (code === "221") {
    if (d.length !== 9) return "Le numéro doit comporter 9 chiffres (ex. 77 123 45 67).";
    if (!SENEGAL.test(d)) return "Numéro sénégalais invalide : il commence par 70 à 78 ou par 33.";
    return null;
  }
  const c = byCode(code);
  const [min, max] = c?.length ?? [6, 12];
  if (d.length < min || d.length > max) {
    return min === max
      ? `Le numéro doit comporter ${min} chiffres pour ${c?.name ?? "ce pays"}.`
      : `Le numéro doit comporter de ${min} à ${max} chiffres.`;
  }
  return null;
}

export const isValidPhone = (value: string | null | undefined) => {
  const { code, local } = parsePhone(value);
  return phoneError(code, local) === null;
};

/** Format d'enregistrement « +221 77 123 45 67 » (ou la valeur telle quelle si invalide). */
export const normalizePhone = (value: string | null | undefined) => {
  if (!value) return "";
  const { code, local } = parsePhone(value);
  return phoneError(code, local) === null ? formatPhone(code, local) : value.trim();
};
