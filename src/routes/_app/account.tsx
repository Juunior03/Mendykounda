/**
 * Compte client — coordonnées / adresse par défaut et raccourcis.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Package, ShoppingBag } from "lucide-react";
import { deliveryZonesQuery, groupByDepartment, matchZone, zoneLabel } from "@/lib/zones";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { takeAfterLogin } from "@/lib/after-login";
import { PhoneInput } from "@/components/phone-input";

export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
  head: () => ({
    meta: [
      { title: "Mon compte — MendyKounda" },
      { name: "description", content: "Consultez votre profil et vos commandes MendyKounda." },
      { property: "og:title", content: "Mon compte — MendyKounda" },
      { property: "og:description", content: "Votre espace client MendyKounda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
    // Retour de Google ou du lien de confirmation : page d'origine (ex. commande).
    if (!loading && user) {
      const next = takeAfterLogin();
      if (next && next !== "/account") void navigate({ to: next });
    }
  }, [user, loading, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: zones = [] } = useQuery(deliveryZonesQuery());
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    address: "",
    city: "",
  });
  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        phone: normalizePhone(profile.phone),
        address: profile.address ?? "",
        city: profile.city ?? "",
      });
    }
  }, [profile]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (form.phone && !isValidPhone(form.phone)) {
      toast.error("Numéro de téléphone invalide (ex. +221 77 123 45 67)");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ ...form, phone: form.phone || null })
      .eq("id", user.id);
    if (error) {
      toast.error("Erreur");
      return;
    }
    toast.success("Profil mis à jour");
    void qc.invalidateQueries({ queryKey: ["profile", user.id] });
  };

  if (!user) return null;

  return (
    <div className="container-editorial py-12 md:py-20">
      <div className="flex items-end justify-between">
        <div>
          <p className="editorial-eyebrow">Mon compte</p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight">
            {profile?.full_name || user.email}
          </h1>
        </div>
        <button onClick={signOut} className="text-xs underline-grow text-muted-foreground">
          Se déconnecter
        </button>
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[360px_1fr]">
        <section>
          <p className="editorial-eyebrow mb-5">Coordonnées et adresse par défaut</p>
          <form onSubmit={save} className="space-y-4">
            {[
              { k: "full_name", label: "Nom complet" },
              { k: "phone", label: "Téléphone" },
              { k: "address", label: "Adresse (quartier, rue, point de repère)" },
              { k: "city", label: "Commune de livraison" },
            ].map((f) =>
              f.k === "phone" ? (
                <div key={f.k}>
                  <label htmlFor="account-phone" className="text-xs text-muted-foreground">
                    {f.label}
                  </label>
                  <PhoneInput
                    id="account-phone"
                    value={form.phone}
                    onChange={(phone) => setForm((v) => ({ ...v, phone }))}
                  />
                </div>
              ) : f.k === "city" ? (
                <div key={f.k}>
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  <select
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Choisissez votre commune…</option>
                    {/* Ancienne ville hors zone : on l'affiche pour ne pas la perdre silencieusement. */}
                    {form.city && !matchZone(form.city, zones) && (
                      <option value={form.city}>{form.city} (hors zone de livraison)</option>
                    )}
                    {groupByDepartment(zones).map(([dep, list]) => (
                      <optgroup key={dep} label={`Département de ${dep}`}>
                        {list.map((z) => (
                          <option key={z.id} value={zoneLabel(z, zones)}>
                            {zoneLabel(z, zones)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              ) : (
                <div key={f.k}>
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  <input
                    type="text"
                    value={(form as Record<string, string>)[f.k]}
                    onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              ),
            )}
            <button className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background">
              Enregistrer
            </button>
          </form>
        </section>

        <section className="order-first lg:order-none">
          <p className="editorial-eyebrow mb-5">Raccourcis</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              to="/orders"
              className="flex items-start gap-4 rounded-lg border border-border bg-card p-5 hover:bg-secondary/60"
            >
              <Package className="h-8 w-8 shrink-0 text-primary" />
              <span>
                <span className="block font-medium">Mes commandes</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Suivre, annuler ou commander à nouveau
                </span>
              </span>
            </Link>
            <Link
              to="/shop"
              className="flex items-start gap-4 rounded-lg border border-border bg-card p-5 hover:bg-secondary/60"
            >
              <ShoppingBag className="h-8 w-8 shrink-0 text-primary" />
              <span>
                <span className="block font-medium">Boutique</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Découvrir nos produits fermiers
                </span>
              </span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
