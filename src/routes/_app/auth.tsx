/**
 * Auth page — email/password sign-in & sign-up + Google OAuth.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/_app/auth")({
  component: AuthPage,
  head: () => ({ meta: [
    { title: "Connexion et inscription — MendyKounda" },
    { name: "description", content: "Connectez-vous ou créez votre compte client MendyKounda." },
    { property: "og:title", content: "Connexion — MendyKounda" },
    { property: "og:description", content: "Accédez à votre compte client MendyKounda." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "6 caractères minimum"),
});
const signupSchema = loginSchema.extend({
  fullName: z.string().min(2, "Nom requis").max(80),
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) void navigate({ to: "/account" });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const parsed = loginSchema.parse({ email, password });
        const { error } = await supabase.auth.signInWithPassword(parsed);
        if (error) throw error;
        toast.success("Bon retour !");
      } else if (mode === "signup") {
        const parsed = signupSchema.parse({ email, password, fullName });
        const { error } = await supabase.auth.signUp({
          email: parsed.email,
          password: parsed.password,
          options: {
            emailRedirectTo: `${window.location.origin}/account`,
            data: { full_name: parsed.fullName },
          },
        });
        if (error) throw error;
        toast.success("Compte créé. Vérifiez votre boîte mail.");
      } else {
        const parsed = z.object({ email: z.string().email("Email invalide") }).parse({ email });
        const { error } = await supabase.auth.resetPasswordForEmail(parsed.email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Email envoyé. Vérifiez votre boîte mail.");
        setMode("login");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Connexion Google impossible");
  };

  return (
    <div className="container-editorial flex min-h-[80vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <p className="editorial-eyebrow text-center">Espace client</p>
        <h1 className="mt-3 text-center text-3xl font-medium tracking-tight">
          {mode === "login" ? "Bon retour" : mode === "signup" ? "Créez votre compte" : "Mot de passe oublié"}
        </h1>

        {mode !== "forgot" && (
          <>
            <button
              onClick={google}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-secondary"
            >
              <span className="text-base">G</span> Continuer avec Google
            </button>

            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              ou
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <div>
              <label className="text-xs text-muted-foreground">Nom complet</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
            />
          </div>
          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Mot de passe</label>
                {mode === "login" && (
                  <button type="button" onClick={() => setMode("forgot")} className="text-xs text-muted-foreground underline-grow">
                    Oublié ?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "…" : mode === "login" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : "Envoyer le lien"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {mode === "forgot" ? (
            <button onClick={() => setMode("login")} className="underline-grow text-foreground">← Retour à la connexion</button>
          ) : (
            <>
              {mode === "login" ? "Pas encore de compte ?" : "Déjà inscrit ?"}{" "}
              <button
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
                className="underline-grow text-foreground"
              >
                {mode === "login" ? "Créer un compte" : "Se connecter"}
              </button>
            </>
          )}
        </p>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/" className="underline-grow">← Retour à l'accueil</Link>
        </p>
      </div>
    </div>
  );
}
