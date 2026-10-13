/**
 * Informations de la ferme (coordonnées, textes…) modifiables dans
 * Admin › Ferme. Les valeurs par défaut s'affichent tant que la base n'a
 * pas répondu (ou si la migration n'est pas encore installée).
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type FarmSettings = Omit<Tables<"farm_settings">, "id" | "updated_at">;

export const DEFAULT_FARM: FarmSettings = {
  name: "Ferme MendyKounda",
  tagline: "Ferme & terroir · Casamance",
  description:
    "La ferme en ligne qui rapproche les produits locaux des familles de la région de Ziguinchor.",
  address: null,
  location: "Région de Ziguinchor, Sénégal",
  phone: null,
  whatsapp: null,
  email: null,
  opening_hours: "Du lundi au samedi",
  facebook_url: null,
  instagram_url: null,
  tiktok_url: null,
  hero_title: "Le frais de la Casamance, livré chez vous.",
  hero_subtitle:
    "Légumes, fruits de saison, volailles, porcs, viandes, jus… tout vient de la ferme.",
  about_eyebrow: null,
  about_title: "Notre ferme en Casamance",
  about_body: "",
  about_image_url: null,
  legal_name: null,
  ninea: null,
  rccm: null,
  terms_body: null,
  privacy_body: null,
  legal_updated_at: null,
};

export const farmSettingsQuery = () =>
  queryOptions({
    queryKey: ["farm-settings"],
    queryFn: async (): Promise<FarmSettings> => {
      const { data, error } = await supabase
        .from("farm_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error || !data) return DEFAULT_FARM;
      const { id: _id, updated_at: _u, ...farm } = data;
      return farm;
    },
    staleTime: 5 * 60 * 1000,
  });

/** Infos de la ferme (valeurs par défaut pendant le chargement). */
export function useFarm(): FarmSettings {
  const { data } = useQuery(farmSettingsQuery());
  return data ?? DEFAULT_FARM;
}

/** Paragraphes d'un texte long (séparés par une ligne vide). */
export const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Événement global pour ouvrir la messagerie (pastille de chat). */
export const OPEN_CHAT_EVENT = "mk:open-chat";
export const openChat = () => window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
