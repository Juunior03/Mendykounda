/**
 * Admin — Pages légales : identité légale du vendeur et textes des
 * conditions générales de vente et de la politique de confidentialité.
 * Par défaut, le site affiche un texte proposé, complété avec les infos de
 * la ferme ; l'admin peut le personnaliser.
 */
import { useState } from "react";
import { orNull } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_FARM, farmSettingsQuery, type FarmSettings } from "@/lib/farm";
import { LEGAL_PAGES, defaultLegalText, type LegalPage } from "@/lib/legal";
import { LegalText } from "@/components/legal-text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LegalForm {
  legal_name: string;
  ninea: string;
  rccm: string;
  terms_body: string | null;
  privacy_body: string | null;
}

const PAGES: LegalPage[] = ["terms", "privacy"];

const toForm = (farm: FarmSettings): LegalForm => ({
  legal_name: farm.legal_name ?? "",
  ninea: farm.ninea ?? "",
  rccm: farm.rccm ?? "",
  terms_body: farm.terms_body?.trim() ? farm.terms_body : null,
  privacy_body: farm.privacy_body?.trim() ? farm.privacy_body : null,
});

export function LegalAdmin() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(farmSettingsQuery());
  const farm = data ?? DEFAULT_FARM;
  const initial = (): LegalForm => toForm(farm);
  const [form, setForm] = useState<LegalForm>(initial);
  const [preview, setPreview] = useState<Record<LegalPage, boolean>>({
    terms: false,
    privacy: false,
  });
  const [saving, setSaving] = useState(false);

  // Réglages rechargés (après enregistrement ou au premier chargement).
  const [loaded, setLoaded] = useState(data);
  if (data !== loaded) {
    setLoaded(data);
    if (data) setForm(toForm(data));
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(initial());
  // Le texte proposé reprend l'identité saisie ci-dessus, même avant l'enregistrement.
  const draftFarm = {
    ...farm,
    legal_name: form.legal_name.trim() || null,
    ninea: form.ninea.trim() || null,
    rccm: form.rccm.trim() || null,
  };

  const save = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const texts = {
      terms_body: orNull(form.terms_body?.trim()),
      privacy_body: orNull(form.privacy_body?.trim()),
    };
    const textsChanged =
      texts.terms_body !== orNull(farm.terms_body?.trim()) ||
      texts.privacy_body !== orNull(farm.privacy_body?.trim());
    setSaving(true);
    const { error } = await supabase
      .from("farm_settings")
      .update({
        legal_name: form.legal_name.trim() || null,
        ninea: form.ninea.trim() || null,
        rccm: form.rccm.trim() || null,
        ...texts,
        ...(textsChanged ? { legal_updated_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Pages légales enregistrées");
      void qc.invalidateQueries({ queryKey: farmSettingsQuery().queryKey });
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <form onSubmit={save} className="space-y-6 pb-20">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Le site propose des conditions de vente et une politique de confidentialité adaptées à la
        boutique (pesée réelle, paiement à la livraison ou Wave, abattages…). Elles reprennent
        automatiquement les coordonnées de l'onglet Ferme. Vous pouvez les garder telles quelles ou
        les personnaliser.
      </p>

      <fieldset className="rounded-lg border border-border bg-card p-4 md:p-5">
        <legend className="px-1 text-base font-semibold">Identité légale</legend>
        <p className="text-xs text-muted-foreground">
          Affichée en tête des conditions de vente. Le NINEA et le RCCM figurent sur vos documents
          d'immatriculation : laissez vide si la ferme n'est pas encore immatriculée.
        </p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium">Raison sociale ou nom de l'exploitant</span>
            <input
              value={form.legal_name}
              maxLength={200}
              placeholder={farm.name}
              onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
              className="input mt-1"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">NINEA</span>
            <input
              value={form.ninea}
              maxLength={50}
              onChange={(e) => setForm({ ...form, ninea: e.target.value })}
              className="input mt-1"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">RCCM</span>
            <input
              value={form.rccm}
              maxLength={80}
              placeholder="SN-ZIG-…"
              onChange={(e) => setForm({ ...form, rccm: e.target.value })}
              className="input mt-1"
            />
          </label>
        </div>
      </fieldset>

      {PAGES.map((page) => {
        const { title, path, field } = LEGAL_PAGES[page];
        const custom = form[field];
        const shown = custom ?? defaultLegalText(page, draftFarm);
        return (
          <fieldset key={page} className="rounded-lg border border-border bg-card p-4 md:p-5">
            <legend className="px-1 text-base font-semibold">{title}</legend>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full border border-border p-0.5 text-sm">
                {[
                  { value: false, label: "Texte proposé" },
                  { value: true, label: "Texte personnalisé" },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={(custom !== null) === o.value}
                    onClick={() => {
                      if (o.value && custom === null)
                        setForm({ ...form, [field]: defaultLegalText(page, draftFarm) });
                      if (!o.value && custom !== null) {
                        if (
                          !globalThis.confirm(
                            "Abandonner votre texte et revenir au texte proposé ?",
                          )
                        )
                          return;
                        setForm({ ...form, [field]: null });
                      }
                    }}
                    className={cn(
                      "rounded-full px-3 py-1",
                      (custom !== null) === o.value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {custom !== null && (
                <button
                  type="button"
                  onClick={() => setPreview({ ...preview, [page]: !preview[page] })}
                  className="text-sm text-primary hover:underline"
                >
                  {preview[page] ? "Modifier" : "Aperçu"}
                </button>
              )}
              <Link
                to={path}
                target="_blank"
                className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Voir la page <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>

            {custom === null ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Mis à jour automatiquement avec les infos de la ferme. Aperçu :
              </p>
            ) : (
              !preview[page] && (
                <p className="mt-3 text-xs text-muted-foreground">
                  « ## Titre » pour un titre, « - » en début de ligne pour une liste, une ligne vide
                  entre deux paragraphes, **texte** pour du gras.
                </p>
              )
            )}

            {custom === null || preview[page] ? (
              <div className="mt-2 max-h-96 overflow-y-auto rounded-md border border-border bg-background p-4">
                <LegalText text={shown} />
              </div>
            ) : (
              <textarea
                value={custom}
                rows={18}
                maxLength={40000}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className="input mt-2 font-mono text-xs leading-relaxed"
              />
            )}
          </fieldset>
        );
      })}

      <section className="rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm">
        <h3 className="font-semibold">À faire de votre côté</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Relire les textes : délais de remboursement, réclamations sous 24 heures, durées de
            conservation… et les adapter à votre façon de travailler.
          </li>
          <li>
            Déclarer le fichier clients auprès de la Commission de protection des données
            personnelles (CDP) sur{" "}
            <a
              href="https://www.cdp.sn"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              cdp.sn
            </a>
            <span>.</span>
          </li>
          <li>En cas de doute, faire valider les textes par un juriste.</li>
        </ul>
      </section>

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
        {dirty && (
          <span className="text-xs text-muted-foreground">Modifications non enregistrées</span>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || saving}
          onClick={() => setForm(initial())}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={!dirty || saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </form>
  );
}
