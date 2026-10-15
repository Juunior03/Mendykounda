/**
 * Page où revenir après la connexion (ex. la validation de commande).
 * Gardée dans sessionStorage pour survivre à la connexion Google et au
 * lien de confirmation d'e-mail, qui ramènent sur /account.
 */
const KEY = "mk_after_login";

/**
 * Chemin interne uniquement : refuse les URL externes, « //domaine » et
 * « /\domaine » (que les navigateurs traitent comme « //domaine »), ainsi
 * que les caractères de contrôle.
 */
const isControlChar = (c: string) => {
  const code = c.codePointAt(0) ?? 0;
  return code < 32 || code === 127;
};

export function safeRedirect(path: unknown): string | null {
  if (typeof path !== "string" || path.length > 500) return null;
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("\\") || [...path].some(isControlChar)) return null;
  return path;
}

export function rememberAfterLogin(path: string | null | undefined) {
  const safe = safeRedirect(path);
  try {
    if (safe) sessionStorage.setItem(KEY, safe);
  } catch {
    /* stockage indisponible : on retombera sur Mon compte */
  }
}

/** Lit puis efface la page mémorisée. */
export function takeAfterLogin(): string | null {
  try {
    const v = safeRedirect(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}

/** Messages d'erreur Supabase Auth traduits en français. */
export function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email ou mot de passe incorrect.";
  if (m.includes("email not confirmed"))
    return "Confirmez d'abord votre adresse email (lien reçu par email).";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Un compte existe déjà avec cet email. Connectez-vous ou utilisez « Mot de passe oublié ».";
  if (m.includes("password should be") || m.includes("weak password"))
    return "Mot de passe trop faible : 8 caractères minimum, avec lettres et chiffres.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes"))
    return "Trop de tentatives. Patientez quelques minutes puis réessayez.";
  if (m.includes("same password") || m.includes("different from the old"))
    return "Le nouveau mot de passe doit être différent de l'ancien.";
  if (m.includes("network") || m.includes("failed to fetch"))
    return "Connexion impossible. Vérifiez votre accès à Internet.";
  return "Une erreur est survenue. Réessayez dans un instant.";
}
