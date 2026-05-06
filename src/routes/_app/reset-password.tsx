/**
 * Reset password page — user lands here from the email recovery link.
 * Supabase auto-creates a recovery session in URL hash; updateUser sets new password.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/reset-password")({
  component: ResetPasswordPage,
  head: () => ({ meta: [{ title: "Réinitialiser le mot de passe — MendyKounda" }] }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("6 caractères minimum"); return; }
    if (password !== confirm) { toast.error("Les mots de passe ne correspondent pas"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Mot de passe mis à jour");
    void navigate({ to: "/account" });
  };

  return (
    <div className="container-editorial flex min-h-[80vh] items-center justify-center py-16">
      <div className="w-full max-w-sm">
        <p className="editorial-eyebrow text-center">Sécurité</p>
        <h1 className="mt-3 text-center text-3xl font-medium tracking-tight">Nouveau mot de passe</h1>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Nouveau mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Confirmation</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "…" : "Mettre à jour"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          <Link to="/auth" className="underline-grow">← Connexion</Link>
        </p>
      </div>
    </div>
  );
}
