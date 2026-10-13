/**
 * Jours d'abattage : la viande « à l'abattage » n'est commandable que
 * jusqu'à la date limite du prochain abattage, et livrée à partir de ce jour.
 * Le serveur (place_order) applique la même règle.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SlaughterDay {
  id: string;
  day: string; // AAAA-MM-JJ
  order_deadline: string;
  note: string | null;
}

/** Heure limite par défaut : la veille de l'abattage à 18 h (heure de Dakar = UTC). */
export const DEFAULT_DEADLINE_HOUR = 18;

export const defaultDeadline = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(DEFAULT_DEADLINE_HOUR);
  return d.toISOString();
};

/** Abattages à venir (dont la date limite de commande n'est pas passée). */
export const upcomingSlaughterQuery = () =>
  queryOptions({
    queryKey: ["slaughter-days", "upcoming"],
    queryFn: async (): Promise<SlaughterDay[]> => {
      const { data, error } = await supabase
        .from("slaughter_days")
        .select("*")
        .gt("order_deadline", new Date().toISOString())
        .order("day");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 1000,
  });

// Les dates d'abattage sont des jours calendaires : formatées en UTC pour
// ne pas glisser d'un jour selon le fuseau du navigateur.
const dayFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const shortFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const deadlineFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Africa/Dakar",
});

const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

/** « samedi 18 octobre » */
export const formatSlaughterDay = (day: string) => dayFmt.format(asDate(day));
/** « sam. 18 oct. » */
export const formatSlaughterDayShort = (day: string) => shortFmt.format(asDate(day));
/** « vendredi 17 octobre à 18:00 » */
export const formatDeadline = (iso: string) => deadlineFmt.format(new Date(iso));
