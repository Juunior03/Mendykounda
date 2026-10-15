/**
 * Point d'entrée TanStack Start : en-têtes de sécurité HTTP ajoutés à
 * toutes les réponses du serveur (pages et fonctions serveur).
 *
 * - Content-Security-Policy : le navigateur ne charge que nos scripts et
 *   ne parle qu'à Supabase (limite fortement l'impact d'une faille XSS) ;
 *   le site ne peut pas être affiché dans une iframe (anti-clickjacking).
 * - HSTS : toujours en https.
 * - nosniff, Referrer-Policy, Permissions-Policy : réglages stricts.
 */
import { createMiddleware, createStart } from "@tanstack/react-start";

const supabaseOrigin = (() => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const csp = [
  "default-src 'self'",
  // Scripts d'hydratation de TanStack Start insérés dans la page.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
};

const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const headers = new Headers(result.response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  // En développement, Vite injecte ses propres scripts : pas de CSP.
  if (import.meta.env.PROD) headers.set("Content-Security-Policy", csp);
  return {
    ...result,
    response: new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers,
    }),
  };
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders],
}));
