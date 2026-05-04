import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — MendyKounda" }] }),
});

function AdminPage() {
  const { isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading) return <div className="container-editorial py-20 text-sm text-muted-foreground">Chargement…</div>;

  if (!isAdmin) {
    return (
      <div className="container-editorial py-20">
        <p className="editorial-eyebrow">Accès restreint</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">Réservé aux administrateurs</h1>
        <p className="mt-3 text-sm text-muted-foreground">Votre compte n'a pas les permissions nécessaires.</p>
      </div>
    );
  }

  return (
    <div className="container-editorial py-12 md:py-20">
      <p className="editorial-eyebrow">Tableau de bord</p>
      <h1 className="mt-3 text-3xl font-medium tracking-tight md:text-4xl">Administration</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Le dashboard complet (produits, commandes, statistiques) arrive à l'étape suivante.
      </p>
    </div>
  );
}
