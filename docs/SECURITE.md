# Sécurité : audit OWASP Top 10

Audit du 16 octobre 2026. Il couvre la base de données (règles d'accès, fonctions), les fonctions serveur (Wave, notifications), le code du site et la configuration d'hébergement.

Les tests d'attaque ont été joués sur une copie locale de la base, en se faisant passer pour un client :

| Tentative | Résultat |
| --- | --- |
| Lire les commandes, profils ou messages d'un autre client | Refusé |
| Se donner le rôle admin | Refusé |
| Modifier un prix, un stock ou un paiement | Refusé |
| Lire les notes internes de la ferme | Refusé |
| Déplacer son avis vers un produit non acheté | Refusé (corrigé) |
| Modifier sa date d'inscription | Refusé (corrigé) |
| Enregistrer des textes géants | Refusé (corrigé) |
| Envoyer des messages en rafale | Bloqué au 21e (corrigé) |

## Résultat par catégorie

| Catégorie OWASP 2021 | État | Ce qui protège le site |
| --- | --- | --- |
| **A01 Contrôle d'accès** | ✅ | Règles d'accès (RLS) sur toutes les tables. Chaque client ne voit que ses données. Seule l'équipe accède à l'admin, contrôlé par la base et pas seulement par l'écran. Commandes créées uniquement par `place_order`. **Corrigé** : un avis pouvait être déplacé sur un produit non acheté ; un client pouvait modifier sa date d'inscription. |
| **A02 Cryptographie** | ✅ | https partout, avec HSTS. Mots de passe chiffrés par Supabase. Clés secrètes (service_role, Wave, Brevo) uniquement dans les secrets Supabase, jamais dans le code ni chez Cloudflare. **Corrigé** : suppression de deux fichiers inutilisés qui faisaient référence à la clé service_role. |
| **A03 Injection** | ✅ | Requêtes paramétrées (Supabase), aucun SQL construit à la main. React échappe les textes. Les e-mails échappent les champs. Les pages légales passent par un analyseur sans HTML. **Corrigé** : export CSV des clients protégé contre l'injection de formules Excel (`=HYPERLINK(…)`). |
| **A04 Conception** | ✅ | Prix, frais et stock calculés par la base. Étapes de commande contrôlées. 5 commandes en attente au maximum par client. Paiement Wave relu auprès de Wave, jamais cru sur parole. **Ajouté** : anti-spam de la messagerie, longueurs maximales des textes. |
| **A05 Configuration** | ✅ | **Ajouté** : en-têtes de sécurité sur toutes les pages : Content-Security-Policy, X-Frame-Options (anti-clickjacking), nosniff, Referrer-Policy, Permissions-Policy, HSTS. Photos limitées à 5 Mo et aux formats JPEG, PNG, WebP et GIF (pas de SVG). Liens des réglages en http(s) uniquement. |
| **A06 Composants vulnérables** | ✅ | `npm audit` : 0 vulnérabilité. Versions verrouillées (`package-lock.json`). Bibliothèque Supabase des fonctions serveur figée sur une version précise. |
| **A07 Authentification** | ⚠️ À régler dans Supabase | Mot de passe d'au moins 8 caractères, lettres et chiffres, côté site. Confirmation de l'e-mail. Retour après connexion limité aux pages du site. **Corrigé** : contournement possible par `/\domaine`. **À faire** : voir plus bas. |
| **A08 Intégrité** | ✅ | Webhook Wave signé (HMAC et horodatage, 5 minutes de validité), comparaison en temps constant. Aucun script externe chargé : seule la police vient de Google Fonts. |
| **A09 Journalisation** | ⚠️ Selon l'offre Supabase | Journaux Supabase (connexions, API, fonctions). Dates de chaque étape de commande, auteur et motif des annulations. La conservation des journaux dépend de l'offre : 1 jour en gratuit, 7 jours en Pro. |
| **A10 SSRF** | ✅ | Les fonctions serveur n'appellent que des adresses fixes (API Wave, API Brevo), jamais une adresse fournie par un client. |

## Migration à exécuter

`supabase/migrations/20261028090000_security_hardening.sql`, **avant** de fusionner la PR.

## À faire de ton côté (tableau de bord Supabase)

1. **Authentication → Providers → Email** :
   - *Confirm email* : activé ;
   - *Minimum password length* : **8** ;
   - *Password requirements* : **lettres et chiffres**.
2. **Authentication → Attack Protection** :
   - activer la **protection contre les mots de passe divulgués** si ton offre la propose ;
   - laisser le CAPTCHA désactivé, ou l'activer en cas d'abus.
3. **Compte administrateur** :
   - utiliser un mot de passe long et unique ;
   - de préférence, se connecter avec **un compte Google protégé par la validation en deux étapes**. Le compte admin bénéficie alors de la double authentification.
4. **Rôle admin** : ne le donner qu'aux personnes de confiance (table `user_roles`), et le retirer au départ d'un employé.
5. **Supabase Pro**, recommandé à l'ouverture : sauvegardes quotidiennes et journaux conservés 7 jours.
6. **Secrets** : ne jamais partager la clé `service_role` ni les clés Wave ou Brevo. En cas de doute, les régénérer dans les tableaux de bord concernés.

## Risques résiduels connus

- La politique de sécurité (CSP) autorise les scripts « inline » : TanStack Start en a besoin pour démarrer la page. Le risque reste faible, car aucune donnée saisie par un client n'est insérée comme HTML.
- La session de connexion est gardée dans le navigateur (localStorage), comme toute application Supabase. La CSP et l'absence de faille XSS la protègent.
