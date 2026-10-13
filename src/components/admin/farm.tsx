/**
 * Admin — Ferme : coordonnées, horaires, réseaux sociaux et textes du site
 * (accueil, page « Notre ferme », pied de page). Enregistré dans farm_settings.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_FARM, farmSettingsQuery, type FarmSettings } from "@/lib/farm";
import { ImagePicker } from "@/components/admin/image-picker";
import { PhoneInput } from "@/components/phone-input";
import { isValidPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";

type Key = keyof FarmSettings;

interface FieldDef {
  key: Key;
  label: string;
  placeholder?: string;
  help?: string;
  multiline?: number;
  required?: boolean;
  type?: string;
}

const SECTIONS: { title: string; help?: string; fields: FieldDef[] }[] = [
  {
    title: "Identité",
    fields: [
      {
        key: "name",
        label: "Nom de la ferme",
        required: true,
        help: "Affiché sur les fiches produits, le bon de livraison et le pied de page.",
      },
      { key: "tagline", label: "Accroche", placeholder: "Ferme & terroir · Casamance" },
      {
        key: "description",
        label: "Présentation courte (pied de page)",
        multiline: 3,
        required: true,
      },
    ],
  },
  {
    title: "Coordonnées",
    help: "Affichées sur la page Contact et dans le pied de page. Un champ vide n'est pas affiché.",
    fields: [
      { key: "address", label: "Adresse", placeholder: "Quartier, rue, point de repère" },
      {
        key: "location",
        label: "Localité",
        required: true,
        placeholder: "Région de Ziguinchor, Sénégal",
      },
      { key: "phone", label: "Téléphone", type: "tel", placeholder: "77 123 45 67" },
      {
        key: "whatsapp",
        label: "WhatsApp",
        type: "tel",
        placeholder: "77 123 45 67",
        help: "Numéro utilisé pour le bouton WhatsApp de la page Contact.",
      },
      { key: "email", label: "E-mail", type: "email", placeholder: "contact@exemple.sn" },
      {
        key: "opening_hours",
        label: "Horaires",
        multiline: 2,
        placeholder: "Du lundi au samedi, 8 h – 18 h",
      },
    ],
  },
  {
    title: "Réseaux sociaux",
    help: "Adresse complète de la page (https://…). Les icônes apparaissent dans le pied de page.",
    fields: [
      {
        key: "facebook_url",
        label: "Facebook",
        type: "url",
        placeholder: "https://facebook.com/…",
      },
      {
        key: "instagram_url",
        label: "Instagram",
        type: "url",
        placeholder: "https://instagram.com/…",
      },
      { key: "tiktok_url", label: "TikTok", type: "url", placeholder: "https://tiktok.com/@…" },
    ],
  },
  {
    title: "Page d'accueil",
    fields: [
      { key: "hero_title", label: "Grand titre", required: true },
      {
        key: "hero_subtitle",
        label: "Sous-titre",
        multiline: 2,
        required: true,
        help: "La phrase sur la zone et la date de livraison est ajoutée automatiquement.",
      },
    ],
  },
  {
    title: "Page « Notre ferme »",
    fields: [
      {
        key: "about_eyebrow",
        label: "Petite ligne au-dessus du titre",
        placeholder: "Depuis 1987",
      },
      { key: "about_title", label: "Titre", required: true },
      {
        key: "about_body",
        label: "Texte",
        multiline: 10,
        required: true,
        help: "Laissez une ligne vide entre deux paragraphes.",
      },
    ],
  },
];

const URL_KEYS: Key[] = ["facebook_url", "instagram_url", "tiktok_url"];

export function FarmAdmin() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(farmSettingsQuery());
  const [form, setForm] = useState<FarmSettings>(DEFAULT_FARM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (key: Key, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = !!data && JSON.stringify(form) !== JSON.stringify(data);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const k of URL_KEYS) {
      const v = (form[k] ?? "").trim();
      if (v && !/^https?:\/\//i.test(v)) {
        toast.error("Les liens des réseaux sociaux doivent commencer par https://");
        return;
      }
    }
    for (const k of ["phone", "whatsapp"] as const) {
      if (form[k] && !isValidPhone(form[k])) {
        toast.error(
          `${k === "phone" ? "Téléphone" : "WhatsApp"} : numéro invalide (ex. +221 77 123 45 67)`,
        );
        return;
      }
    }
    // Champs facultatifs vides : enregistrés comme absents (non affichés).
    const values = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v]),
    ) as Partial<FarmSettings>;
    for (const s of SECTIONS)
      for (const f of s.fields)
        if (f.required && !values[f.key]) {
          toast.error(`« ${f.label} » est obligatoire`);
          return;
        }
    setSaving(true);
    const { error } = await supabase
      .from("farm_settings")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Informations de la ferme enregistrées");
      void qc.invalidateQueries({ queryKey: farmSettingsQuery().queryKey });
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <form onSubmit={save} className="space-y-6 pb-20">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Ces informations s'affichent sur le site (accueil, page{" "}
        <Link to="/about" className="text-primary hover:underline">
          Notre ferme
        </Link>
        ,{" "}
        <Link to="/contact" className="text-primary hover:underline">
          Contact
        </Link>
        , pied de page, bon de livraison). Les clients peuvent aussi vous écrire depuis la
        messagerie du site (onglet Messages).
      </p>

      {SECTIONS.map((section) => (
        <fieldset
          key={section.title}
          className="rounded-lg border border-border bg-card p-4 md:p-5"
        >
          <legend className="px-1 text-base font-semibold">{section.title}</legend>
          {section.help && <p className="text-xs text-muted-foreground">{section.help}</p>}
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {section.fields.map((f) =>
              f.type === "tel" ? (
                <div key={f.key} className="text-sm">
                  <label htmlFor={`farm-${f.key}`} className="font-medium">
                    {f.label}
                  </label>
                  <PhoneInput
                    id={`farm-${f.key}`}
                    value={form[f.key]}
                    onChange={(v) => set(f.key, v)}
                  />
                  {f.help && (
                    <span className="mt-1 block text-xs text-muted-foreground">{f.help}</span>
                  )}
                </div>
              ) : (
                <label
                  key={f.key}
                  className={`block text-sm ${f.multiline ? "md:col-span-2" : ""}`}
                >
                  <span className="font-medium">
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </span>
                  {f.multiline ? (
                    <textarea
                      rows={f.multiline}
                      value={form[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.key, e.target.value)}
                      className="input mt-1"
                    />
                  ) : (
                    <input
                      type={f.type ?? "text"}
                      value={form[f.key] ?? ""}
                      placeholder={f.placeholder}
                      onChange={(e) => set(f.key, e.target.value)}
                      className="input mt-1"
                    />
                  )}
                  {f.help && (
                    <span className="mt-1 block text-xs text-muted-foreground">{f.help}</span>
                  )}
                </label>
              ),
            )}
            {section.title === "Page « Notre ferme »" && (
              <div className="text-sm md:col-span-2">
                <span className="font-medium">Photo de la page</span>
                <span className="mb-1 block text-xs text-muted-foreground">
                  Laissez vide pour garder la photo actuelle.
                </span>
                <ImagePicker
                  value={form.about_image_url ?? ""}
                  onChange={(url) => set("about_image_url", url)}
                />
              </div>
            )}
          </div>
        </fieldset>
      ))}

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
        {dirty && (
          <span className="text-xs text-muted-foreground">Modifications non enregistrées</span>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || saving}
          onClick={() => data && setForm(data)}
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
