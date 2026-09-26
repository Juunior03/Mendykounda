/**
 * Customer account — profile + order history.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, formatPrice } from "@/lib/format";


export const Route = createFileRoute("/_app/account")({
  component: AccountPage,
  head: () => ({ meta: [
    { title: "Mon compte — MendyKounda" },
    { name: "description", content: "Consultez votre profil et vos commandes MendyKounda." },
    { property: "og:title", content: "Mon compte — MendyKounda" },
    { property: "og:description", content: "Votre espace client MendyKounda." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/auth" });
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

  const { data: orders } = useQuery({
    queryKey: ["my-orders", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [form, setForm] = useState({ full_name: "", phone: "", address: "", city: "", postal_code: "" });
  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name ?? "",
        phone: profile.phone ?? "",
        address: profile.address ?? "",
        city: profile.city ?? "",
        postal_code: profile.postal_code ?? "",
      });
    }
  }, [profile]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("profiles").update(form).eq("id", user.id);
    if (error) { toast.error("Erreur"); return; }
    toast.success("Profil mis à jour");
    void qc.invalidateQueries({ queryKey: ["profile", user.id] });
  };

  if (!user) return null;

  return (
    <div className="container-editorial py-12 md:py-20">
      <div className="flex items-end justify-between">
        <div>
          <p className="editorial-eyebrow">Mon compte</p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight">{profile?.full_name || user.email}</h1>
        </div>
        <button onClick={signOut} className="text-xs underline-grow text-muted-foreground">
          Se déconnecter
        </button>
      </div>

      <div className="mt-12 grid gap-12 lg:grid-cols-[360px_1fr]">
        <section>
          <p className="editorial-eyebrow mb-5">Coordonnées</p>
          <form onSubmit={save} className="space-y-4">
            {[
              { k: "full_name", label: "Nom complet" },
              { k: "phone", label: "Téléphone" },
              { k: "address", label: "Adresse" },
              { k: "city", label: "Ville" },
              { k: "postal_code", label: "Code postal" },
            ].map((f) => (
              <div key={f.k}>
                <label className="text-xs text-muted-foreground">{f.label}</label>
                <input
                  type="text"
                  value={(form as Record<string, string>)[f.k]}
                  onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            ))}
            <button className="rounded-md bg-foreground px-4 py-2 text-xs font-medium text-background">
              Enregistrer
            </button>
          </form>
        </section>

        <section>
          <p className="editorial-eyebrow mb-5">Mes commandes</p>
          {!orders || orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune commande pour le moment. <Link to="/shop" className="underline-grow">Découvrir la boutique →</Link>
            </p>
          ) : (
            <ul className="space-y-4">
              {orders.map((o) => (
                <li key={o.id} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(o.created_at)} · #{o.id.slice(0, 8)}
                    </p>
                    <StatusPill status={o.status} payment={o.payment_status} />
                  </div>
                  <ul className="mt-3 space-y-1 text-sm">
                    {o.order_items?.map((it: { id: string; product_name: string; quantity: number; unit_price: number }) => (
                      <li key={it.id} className="flex justify-between">
                        <span>{it.product_name} × {it.quantity}</span>
                        <span className="tabular-nums">{formatPrice(it.unit_price * it.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-border pt-3 text-right text-sm font-medium tabular-nums">
                    Total : {formatPrice(Number(o.total_amount))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

    </div>
  );
}

function StatusPill({ status, payment }: { status: string; payment: string }) {
  const label = payment === "paid" ? `Payée · ${status}` : status;
  return (
    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider">
      {label}
    </span>
  );
}
