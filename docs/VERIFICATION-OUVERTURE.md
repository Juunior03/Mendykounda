# Vérification avant l'ouverture

Audit fait le 13 octobre 2026 sur la base (règles d'accès, fonctions), le code du site, le parcours d'achat et les dépendances.

## Corrigé dans cette mise à jour

| Problème | Gravité | Correction |
| --- | --- | --- |
| Un client pouvait **modifier les messages** de sa conversation, y compris les réponses de la ferme, et faire passer les siens pour des messages de la ferme | Élevée | Seule la date de lecture reste modifiable. Messages limités à 2000 caractères |
| **Avis** possibles sans avoir acheté le produit (faux avis) | Moyenne | Avis réservés aux clients dont la commande contenant le produit a été livrée. Commentaires limités à 2000 caractères |
| Numéro de téléphone vérifié seulement dans le navigateur | Moyenne | Vérifié aussi par la base : 8 à 15 chiffres |
| Commandes illimitées : un compte pouvait bloquer tout le stock sans payer | Moyenne | 5 commandes « Commandée » au maximum par client à la fois |
| Après une connexion, le client atterrissait sur « Mon compte » au lieu de revenir à sa **commande** | Moyenne | Retour automatique à la page d'origine (commande, contact, produit), y compris avec Google |
| Erreurs de connexion **en anglais** (« Invalid login credentials ») et erreurs de saisie illisibles | Faible | Messages en français |
| Mot de passe de 6 caractères accepté à l'inscription | Faible | 8 caractères minimum, avec au moins une lettre et un chiffre |

Migration à exécuter : `supabase/migrations/20261025090000_prelaunch_hardening.sql`.

## Vérifié, rien à signaler

- Toutes les tables ont des règles d'accès (RLS). Un client ne voit que ses commandes, son profil et ses messages. Les notes internes, les rôles et les réglages ne sont modifiables que par l'admin.
- Les **prix et le stock sont calculés par la base** (`place_order`). Le navigateur ne peut pas imposer un prix.
- Aucune clé secrète dans le code ni dans le dépôt GitHub. `.env` n'est pas versionné.
- Aucune injection HTML possible : React échappe les textes, et les e-mails échappent les champs.
- Les images produits ne peuvent être envoyées que par l'admin.

## À faire de ton côté avant l'ouverture

### Supabase (tableau de bord)
1. **Authentication → URL Configuration** : mettre l'adresse définitive du site dans *Site URL*, et ajouter `https://ton-domaine/**` dans *Redirect URLs*. Garder `http://localhost:8080/**` pour le développement.
2. **Authentication → Providers → Email** : laisser *Confirm email* activé.
3. **Authentication → Emails** : traduire en français les modèles d'e-mails (confirmation d'inscription, mot de passe oublié). Par défaut ils sont en anglais.
4. **Authentication → Attack Protection** : activer la protection contre les mots de passe divulgués, si ton offre le propose.
5. **Google Cloud** : ajouter l'adresse définitive dans les origines autorisées de l'identifiant OAuth.

### Contenu
- **Admin › Ferme** : vraies coordonnées (téléphone, WhatsApp, adresse, e-mail) et vraie histoire de la ferme. Les textes « Depuis 1987 » et « Trois générations » ont été inventés au départ du projet.
- **Admin › Produits** : supprimer les produits ou avis de démonstration éventuels, vérifier photos, prix, unités, saisons et formats.
- **Admin › Livraison** : saisir le vrai coût du transport par commune. Sinon, la valeur d'exemple de 2000 F s'applique.

### Pages légales
Les pages **Conditions générales de vente** (`/cgv`) et **Politique de confidentialité** (`/confidentialite`) sont en ligne, avec des liens dans le pied de page, au paiement et à l'inscription. Migration à exécuter : `supabase/migrations/20261027090000_legal_pages.sql`.
- **Admin › Pages légales** : renseigner la raison sociale, le NINEA et le RCCM, puis relire les deux textes et les adapter si besoin.
- Déclarer le fichier clients auprès de la CDP (cdp.sn).

### Dépendances
Réparé : `npm ci` fonctionne sur une installation neuve et `npm audit` ne signale plus aucune faille.
- TanStack Start est bloqué sur la version 1.168, la dernière compatible avec Vite 7.
- Nitro (outil de construction du serveur) mis à jour : corrige les failles de `undici`, `sharp` et `miniflare`. `seroval` est aussi à jour.
- Un seul fichier de verrouillage, `package-lock.json` : l'ancien `bun.lockb`, périmé, est supprimé.
- Node.js 20.19 ou plus récent est requis (à choisir chez l'hébergeur).

### Mise en ligne
Suivre [HEBERGEMENT.md](HEBERGEMENT.md) : Cloudflare, nom de domaine, réglages Supabase pour l'adresse définitive (Site URL, SMTP Brevo, `SITE_URL`) et parcours de vérification final.

### Sécurité (OWASP Top 10)
Voir [SECURITE.md](SECURITE.md) : migration `20261028090000_security_hardening.sql` à exécuter, et réglages d'authentification Supabase à faire (mot de passe 8 caractères avec lettres et chiffres, mots de passe divulgués, compte admin protégé).
