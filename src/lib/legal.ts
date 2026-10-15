/**
 * Pages légales : conditions générales de vente et politique de
 * confidentialité. Le texte proposé ci-dessous est complété avec les infos
 * de la ferme (Admin › Ferme) ; l'admin peut le remplacer par son propre
 * texte (Admin › Pages légales).
 *
 * Format des textes : « ## Titre », « - élément de liste », paragraphes
 * séparés par une ligne vide, **gras** et [lien](/chemin).
 */
import type { FarmSettings } from "@/lib/farm";

export type LegalPage = "terms" | "privacy";

export const LEGAL_PAGES: Record<
  LegalPage,
  { title: string; path: "/cgv" | "/confidentialite"; field: "terms_body" | "privacy_body" }
> = {
  terms: { title: "Conditions générales de vente", path: "/cgv", field: "terms_body" },
  privacy: {
    title: "Politique de confidentialité",
    path: "/confidentialite",
    field: "privacy_body",
  },
};

/** Date de la dernière révision du texte proposé par le site. */
export const DEFAULT_LEGAL_DATE = "2026-10-13";

/** « Ferme MendyKounda (raison sociale), adresse, localité » */
function seller(farm: FarmSettings) {
  const legalName = farm.legal_name || farm.name;
  const operates =
    farm.legal_name && farm.legal_name !== farm.name
      ? `, qui exploite la ferme « ${farm.name} »`
      : "";
  const lines = [
    `**${legalName}**${operates}`,
    [farm.address, farm.location].filter(Boolean).join(", "),
  ];
  if (farm.ninea) lines.push(`NINEA : ${farm.ninea}`);
  if (farm.rccm) lines.push(`RCCM : ${farm.rccm}`);
  return lines.filter(Boolean);
}

function contacts(farm: FarmSettings) {
  return [
    "la messagerie du site (bulle en bas à droite, une fois connecté)",
    farm.phone && `le téléphone : ${farm.phone}`,
    farm.whatsapp && farm.whatsapp !== farm.phone && `WhatsApp : ${farm.whatsapp}`,
    farm.email && `l'e-mail : ${farm.email}`,
  ].filter(Boolean) as string[];
}

const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

export function defaultTerms(farm: FarmSettings): string {
  const name = farm.name;
  return `Les présentes conditions s'appliquent à toute commande passée sur le site de ${name}. En validant une commande, vous les acceptez.

## 1. Le vendeur

${list(seller(farm))}

Pour toute question, vous pouvez nous joindre par :

${list(contacts(farm))}

## 2. Les produits

Nous vendons les produits de notre ferme : légumes, fruits de saison, volailles, œufs, porcs, viandes, lait, jus, etc.

- Ce sont des produits frais et vivants : leur aspect, leur taille et leur poids peuvent varier légèrement par rapport aux photos, qui sont données à titre indicatif.
- Les quantités sont limitées au stock affiché. Les produits de saison ne peuvent être commandés que pendant leur saison.
- Certains produits existent en plusieurs formats, par exemple une volaille vivante ou en poulet de chair (déplumé, vidé et emballé), un cochon sur pied ou en viande. Le format choisi est indiqué dans la commande.
- La viande issue d'un abattage est préparée le jour d'abattage indiqué sur la fiche du produit. Elle doit être commandée avant la date limite affichée et elle est livrée à partir de ce jour.

## 3. Les prix

Les prix sont indiqués en francs CFA (F CFA). Le prix appliqué est celui affiché au moment de la validation de la commande.

Les frais de livraison dépendent de la commune de livraison. Ils sont affichés avant la validation et s'ajoutent au prix des produits.

## 4. Les produits vendus au poids

Certains produits sont vendus au kilo, par exemple le poulet de chair ou la viande. Pour ces produits :

- le montant affiché lors de la commande est une **estimation**, calculée sur le poids demandé ;
- le produit est pesé lors de la préparation, et le montant final est calculé sur le **poids réel**, au prix au kilo de la commande ;
- le montant final peut donc être un peu plus élevé ou un peu plus bas que l'estimation. Il est visible dans « Mes commandes » et vous est communiqué avant le paiement.

## 5. La commande

Pour commander, vous devez créer un compte et indiquer un nom, un numéro de téléphone joignable et une adresse de livraison.

- La commande est enregistrée dès sa validation. Vous la retrouvez dans « Mes commandes », où vous suivez chaque étape : commandée, en préparation, prête, en livraison, livrée.
- Pour éviter de bloquer le stock, un même client peut avoir au plus 5 commandes en attente de préparation à la fois.
- La ferme peut annuler une commande, par exemple en cas de rupture de stock, de client injoignable ou d'adresse non desservie. Le motif vous est indiqué dans « Mes commandes ». Si vous aviez déjà payé, vous êtes remboursé.

## 6. Le paiement

Deux modes de paiement sont proposés :

- **paiement à la livraison**, en espèces, à la remise de la commande ;
- **Wave**, au moment de la commande. Une commande payable par Wave dont le paiement n'est pas reçu dans les 2 heures est annulée automatiquement, et les produits sont remis en vente.

Pour les produits vendus au poids, le paiement à la livraison porte sur le montant final, après pesée.

## 7. La livraison

Nous livrons dans les communes de la région de Ziguinchor proposées lors de la commande. La date de livraison affichée est une estimation.

- Merci de rester joignable au numéro indiqué : le livreur peut vous appeler avant de passer.
- Si la livraison échoue (client absent ou injoignable), nous vous recontactons pour convenir d'un nouveau passage. Après plusieurs tentatives sans réponse, la commande peut être annulée.
- Le retrait à la ferme est possible sur accord préalable.

## 8. Annuler une commande

- Tant que la commande est au statut « Commandée » et n'est pas payée, vous pouvez l'annuler vous-même dans « Mes commandes ».
- Une fois la préparation commencée (récolte, abattage, emballage), contactez-nous : nous chercherons une solution, mais les produits déjà préparés pourront être dus.

## 9. Réception et réclamations

Nos produits sont frais et périssables : une fois livrés, ils ne peuvent être ni repris ni échangés, sauf s'ils ne sont pas conformes.

Vérifiez votre commande à la livraison. En cas de produit manquant, abîmé ou non conforme, signalez-le-nous **dans les 24 heures** par la messagerie du site, si possible avec une photo. Selon le cas, nous remplaçons le produit, nous établissons un avoir ou nous vous remboursons.

## 10. Remboursement

Un remboursement est effectué par le moyen de paiement utilisé (Wave, ou en espèces pour un paiement à la livraison), en principe dans les 7 jours qui suivent l'annulation ou l'accord sur la réclamation.

## 11. Données personnelles

Les informations recueillies servent à traiter vos commandes. Pour en savoir plus et exercer vos droits, consultez notre [politique de confidentialité](/confidentialite).

## 12. Litiges

Les présentes conditions sont soumises au droit sénégalais. En cas de difficulté, contactez-nous d'abord : nous chercherons une solution amiable. À défaut, le litige sera porté devant les juridictions compétentes de Ziguinchor.`;
}

export function defaultPrivacy(farm: FarmSettings): string {
  const name = farm.name;
  return `Cette page explique quelles informations ${name} recueille sur le site, à quoi elles servent et comment exercer vos droits, conformément à la loi sénégalaise n° 2008-12 du 25 janvier 2008 sur la protection des données à caractère personnel.

## 1. Qui est responsable de vos données ?

${list(seller(farm))}

## 2. Les informations que nous recueillons

- **Votre compte** : adresse e-mail, nom et mot de passe (enregistré sous une forme chiffrée, que nous ne pouvons pas lire). Si vous vous connectez avec Google, nous recevons votre nom et votre adresse e-mail.
- **Vos commandes** : nom, numéro de téléphone, adresse et commune de livraison, instructions de livraison, produits commandés, montants, mode et état du paiement.
- **Vos échanges** : messages envoyés par la messagerie du site et avis publiés sur les produits.
- **Le suivi client** : la ferme peut ajouter une note interne à votre fiche client (par exemple « préfère être livré le matin »). Cette note n'est visible que par la ferme.

Nous ne recueillons aucune donnée bancaire : le paiement Wave se fait sur l'application Wave.

## 3. À quoi servent ces informations ?

- préparer, livrer et suivre vos commandes ;
- vous envoyer les confirmations de commande par e-mail et SMS ;
- vous répondre et vous aider (messagerie, téléphone) ;
- tenir notre comptabilité ;
- assurer la sécurité du site et éviter les abus.

Nous ne vendons pas vos données et nous ne vous envoyons pas de publicité sans votre accord.

## 4. Qui peut y accéder ?

- l'équipe de la ferme et le livreur, pour ce qui concerne votre commande (nom, téléphone, adresse) ;
- nos prestataires techniques, qui les traitent uniquement pour notre compte : **Supabase** (hébergement du site et de la base de données), **Brevo** (envoi des e-mails et SMS), **Wave** (paiement, si vous le choisissez) et **Google** (si vous vous connectez avec Google).

Certains de ces prestataires hébergent les données hors du Sénégal. Ces transferts sont limités à ce qui est nécessaire au service.

## 5. Combien de temps les conservons-nous ?

- votre compte : tant qu'il est actif. Après 3 ans sans connexion ni commande, il peut être supprimé ;
- vos commandes : 10 ans, durée de conservation des pièces comptables ;
- les messages : 3 ans après le dernier échange.

## 6. Cookies et stockage dans le navigateur

Le site n'utilise pas de cookies publicitaires ni d'outil de mesure d'audience. Il enregistre seulement dans votre navigateur ce qui est nécessaire à son fonctionnement : votre connexion et le contenu de votre panier.

## 7. Vos droits

Vous pouvez à tout moment :

- **consulter** les informations que nous avons sur vous ;
- les faire **corriger** (vous pouvez aussi modifier votre profil dans « Mon compte ») ;
- vous **opposer** à leur utilisation ou en demander la **suppression**, sauf pour les informations que la loi nous oblige à garder (comptabilité).

Pour exercer ces droits, contactez-nous par :

${list(contacts(farm))}

Nous vous répondons dans un délai d'un mois. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la Commission de protection des données personnelles (CDP) : www.cdp.sn.

## 8. Sécurité

Les échanges avec le site sont chiffrés (https). L'accès aux données est réservé : chaque client ne voit que ses propres commandes et messages, et seule l'équipe de la ferme accède à l'administration.`;
}

export const defaultLegalText = (page: LegalPage, farm: FarmSettings) =>
  page === "terms" ? defaultTerms(farm) : defaultPrivacy(farm);

/** Texte affiché : personnalisé par l'admin, sinon texte proposé. */
export function legalText(page: LegalPage, farm: FarmSettings) {
  const custom = farm[LEGAL_PAGES[page].field];
  return custom?.trim() ? custom : defaultLegalText(page, farm);
}

/** Date « Dernière mise à jour ». */
export function legalDate(page: LegalPage, farm: FarmSettings) {
  const custom = farm[LEGAL_PAGES[page].field]?.trim();
  return custom && farm.legal_updated_at ? farm.legal_updated_at : DEFAULT_LEGAL_DATE;
}

export type LegalBlock =
  { type: "h2"; text: string } | { type: "p"; text: string } | { type: "ul"; items: string[] };

/** Découpe un texte en titres, paragraphes et listes. */
export function parseLegal(text: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  for (const chunk of text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let para: string[] = [];
    const flush = () => {
      if (para.length) blocks.push({ type: "p", text: para.join(" ") });
      para = [];
    };
    for (const line of lines) {
      if (line.startsWith("## ")) {
        flush();
        blocks.push({ type: "h2", text: line.slice(3).trim() });
      } else if (/^[-•*] /.test(line)) {
        flush();
        const last = blocks[blocks.length - 1];
        const item = line.slice(2).trim();
        if (last?.type === "ul") last.items.push(item);
        else blocks.push({ type: "ul", items: [item] });
      } else {
        para.push(line);
      }
    }
    flush();
  }
  return blocks;
}

export type InlinePart =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string };

const SAFE_HREF = /^(\/(?!\/)|https?:\/\/|mailto:|tel:)/i;

/** Morceau spécial (gras ou lien) commençant à la position i, ou null. */
function readToken(text: string, i: number): { part: InlinePart; end: number } | null {
  if (text.startsWith("**", i)) {
    const close = text.indexOf("**", i + 2);
    if (close > i + 2)
      return { part: { type: "bold", text: text.slice(i + 2, close) }, end: close + 2 };
    return null;
  }
  if (text[i] !== "[") return null;
  const mid = text.indexOf("](", i + 1);
  if (mid <= i + 1) return null;
  const close = text.indexOf(")", mid + 2);
  if (close <= mid + 2) return null;
  const label = text.slice(i + 1, mid);
  const href = text.slice(mid + 2, close);
  if (label.includes("]") || /\s/.test(href)) return null;
  const part: InlinePart = SAFE_HREF.test(href)
    ? { type: "link", text: label, href }
    : { type: "text", text: label };
  return { part, end: close + 1 };
}

/** **gras** et [texte](lien) ; les liens non sûrs restent du texte. */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    const token = readToken(text, i);
    if (token) {
      if (plain) parts.push({ type: "text", text: plain });
      plain = "";
      parts.push(token.part);
      i = token.end;
    } else {
      plain += text[i];
      i++;
    }
  }
  if (plain) parts.push({ type: "text", text: plain });
  return parts;
}
