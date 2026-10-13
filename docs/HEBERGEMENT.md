# Mettre le site en ligne

Ce guide explique comment publier MendyKounda sur Internet, avec ton propre nom
de domaine, et ce qu'il faut régler avant d'ouvrir aux clients.

## Qui fait quoi

| Service | Rôle | Déjà en place ? |
| --- | --- | --- |
| **Cloudflare Workers** | Héberge le site (les pages, les images du site) | À faire (ce guide) |
| **Supabase** | Base de données, comptes clients, photos des produits, fonctions Wave et notifications | Oui |
| **Brevo** | E-mails et SMS de confirmation | Voir [NOTIFICATIONS.md](NOTIFICATIONS.md) |
| **Wave** | Paiement mobile | Voir [PAIEMENT-WAVE.md](PAIEMENT-WAVE.md) |
| **GitHub** | Code du site. Chaque fusion dans `main` met le site à jour automatiquement | Oui |

Le site est déjà configuré pour Cloudflare (fichier `wrangler.jsonc`). Il n'y a
pas de serveur à louer ni à entretenir.

---

## 1. Avant de commencer

- [ ] Toutes les migrations sont exécutées dans Supabase, la dernière étant
      `20261027090000_legal_pages.sql`.
- [ ] Ton compte administrateur fonctionne sur le site en local.
- [ ] **Admin › Ferme** : vraies coordonnées et vrais textes.
- [ ] **Admin › Produits** : vrais produits, photos, prix et stocks.
- [ ] **Admin › Livraison** : vrais frais de transport par commune.
- [ ] **Admin › Pages légales** : NINEA, RCCM, textes relus.
- [ ] Tu as sous la main le fichier `.env` de ton Mac. Tu en auras besoin à
      l'étape 3.

## 2. Créer le compte Cloudflare

1. Va sur [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) et
   crée un compte, gratuit.
2. Confirme ton adresse e-mail.

## 3. Publier le site depuis GitHub

1. Dans Cloudflare : **Workers & Pages** → **Create** → onglet **Workers** →
   **Import a repository**.
2. Connecte ton compte GitHub et autorise l'accès au dépôt
   `Juunior03/Mendykounda`.
3. Choisis le dépôt, puis remplis :

   | Champ | Valeur |
   | --- | --- |
   | Project name | `mendykounda` |
   | Production branch | `main` |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |

4. Ouvre **Advanced settings** (ou **Build variables**) et ajoute ces
   **variables de build**. Copie les valeurs depuis ton `.env` :

   | Nom | Valeur |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://mqngaphjmrcftnkcojnv.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | ta clé *publishable / anon* |
   | `VITE_SUPABASE_PROJECT_ID` | `mqngaphjmrcftnkcojnv` |
   | `VITE_WAVE_ENABLED` | `false` (passe à `true` quand Wave est prêt) |

   Ces valeurs sont publiques : elles sont de toute façon visibles dans le
   navigateur, et la base est protégée par ses règles d'accès. En revanche, ne
   mets **jamais** ici la clé `service_role`, ni les clés Wave ou Brevo. Elles
   restent dans les secrets Supabase.

5. Clique sur **Deploy**. La première construction prend 2 à 4 minutes.
6. À la fin, Cloudflare affiche l'adresse du site, du type
   `https://mendykounda.<ton-compte>.workers.dev`. Ouvre-la et vérifie que la
   boutique s'affiche avec tes produits.

> Les noms des menus Cloudflare changent parfois légèrement. Cherche « Workers »
> et « Import a repository » si un libellé ne correspond pas.

À partir de maintenant, **chaque fusion dans `main` sur GitHub republie le site
tout seul** en quelques minutes.

## 4. Brancher ton nom de domaine

### Choisir et acheter le domaine
- **`.sn`** (ex. `mendykounda.sn`) : ancré au Sénégal, rassurant pour les
  clients. Il s'achète auprès d'un bureau d'enregistrement agréé par le NIC
  Sénégal (liste sur [nic.sn](https://www.nic.sn)).
- **`.com`** : peut s'acheter directement chez Cloudflare (**Domain
  Registration**), au prix coûtant. C'est le plus simple, car tout est au même
  endroit.

### Relier le domaine au site
1. Si le domaine est acheté **ailleurs que chez Cloudflare** : dans Cloudflare,
   **Add a domain** → saisis le domaine → plan **Free**. Cloudflare te donne
   deux *nameservers* (ex. `xxx.ns.cloudflare.com`). Remplace les nameservers
   chez ton bureau d'enregistrement par ces deux-là. La prise en compte peut
   prendre de quelques minutes à 24 heures.
2. **Workers & Pages** → `mendykounda` → **Settings** → **Domains & Routes** →
   **Add** → **Custom domain** → saisis `mendykounda.sn` (ou ton domaine).
3. Recommence pour `www.mendykounda.sn`.
4. Le certificat `https` est créé automatiquement. Patiente quelques minutes,
   puis ouvre `https://ton-domaine`.

Dans la suite, remplace `https://ton-domaine` par ta vraie adresse.

## 5. Régler Supabase pour l'adresse définitive

### Connexion et liens des e-mails
**Authentication → URL Configuration** :
- **Site URL** : `https://ton-domaine`
- **Redirect URLs** : ajoute `https://ton-domaine/**` et
  `https://www.ton-domaine/**`. Garde `http://localhost:8080/**` pour
  continuer à travailler en local.

Sans ce réglage, les liens de confirmation d'inscription et de mot de passe
oublié renvoient vers `localhost`.

### Connexion Google
Dans [Google Cloud Console](https://console.cloud.google.com) → **APIs &
Services** → **Credentials** → ton identifiant OAuth :
- **Authorized JavaScript origins** : ajoute `https://ton-domaine`.
- **Authorized redirect URIs** : ne change rien. L'adresse
  `https://mqngaphjmrcftnkcojnv.supabase.co/auth/v1/callback` reste valable.

### E-mails de connexion (important)
Le service d'e-mail intégré à Supabase est fait pour les tests : il envoie très
peu d'e-mails par heure. En production, les clients ne recevraient pas leurs
e-mails de confirmation. Fais-les envoyer par Brevo :

1. Brevo → **SMTP & API** → onglet **SMTP** → note le serveur, le port et
   l'identifiant, puis génère une **clé SMTP**.
2. Supabase → **Authentication → Emails → SMTP Settings** → active **Custom
   SMTP** :
   - Host : `smtp-relay.brevo.com`, Port : `587`
   - Username : l'identifiant SMTP Brevo
   - Password : la clé SMTP Brevo
   - Sender email : une adresse de ton domaine, validée dans Brevo (ex.
     `commandes@ton-domaine`)
   - Sender name : `MendyKounda`
3. **Authentication → Emails → Templates** : traduis en français les e-mails
   « Confirm signup » et « Reset password ».

### Adresse du site pour Wave et les notifications
Dans le terminal, à la racine du projet :

```bash
supabase secrets set SITE_URL="https://ton-domaine"
```

C'est l'adresse utilisée dans les e-mails et SMS de confirmation, et celle où
Wave renvoie le client après paiement. Elle est prise en compte tout de suite,
sans redéploiement.

## 6. Activer Wave (quand ton compte Wave Business est prêt)

1. Suis [PAIEMENT-WAVE.md](PAIEMENT-WAVE.md), y compris l'annulation
   automatique des paiements abandonnés (pg_cron, section 7).
2. Cloudflare → `mendykounda` → **Settings** → **Build** → **Variables** :
   passe `VITE_WAVE_ENABLED` à `true`.
3. **Deployments** → **Retry build** (ou fusionne n'importe quelle PR) pour que
   l'option Wave apparaisse au paiement.

## 7. Vérifier avant d'annoncer l'ouverture

Fais le parcours complet sur `https://ton-domaine`, de préférence depuis un
téléphone :

- [ ] La page d'accueil, la boutique et une fiche produit s'affichent avec les
      photos.
- [ ] Inscription avec une nouvelle adresse e-mail : l'e-mail de confirmation
      arrive, en français, et le lien ramène sur ton domaine.
- [ ] Connexion avec Google.
- [ ] « Mot de passe oublié » : l'e-mail arrive et le lien fonctionne.
- [ ] Commande en paiement à la livraison : l'e-mail et le SMS de confirmation
      arrivent, et la pastille s'affiche dans l'admin.
- [ ] Dans l'admin, la commande passe par toutes les étapes : préparation,
      Prête, En livraison, Livrée (avec encaissement).
- [ ] Commande puis annulation depuis « Mes commandes » : le stock revient.
- [ ] La messagerie fonctionne dans les deux sens.
- [ ] Les pages Conditions de vente et Confidentialité sont accessibles depuis
      le pied de page.
- [ ] Si Wave est activé : un vrai petit paiement, puis la commande est
      « Payée ».

Supprime ensuite les commandes de test dans l'admin, ou annule-les.

## 8. Mettre à jour le site

- **Une modification** : fusionne la PR sur GitHub. Cloudflare reconstruit et
  publie automatiquement. Le suivi se fait dans **Workers & Pages** →
  `mendykounda` → **Deployments**.
- **Revenir en arrière** si une mise à jour pose problème : **Deployments** →
  choisis la version précédente → **Rollback**. C'est instantané.
- **Les migrations de base de données** ne sont pas automatiques. Exécute-les
  dans Supabase (SQL Editor) **avant** de fusionner la PR qui en a besoin,
  comme jusqu'ici.
- **Depuis ton Mac**, si besoin : `npx wrangler login` une fois, puis
  `npm run deploy`.

## 9. Ce que ça coûte

| Service | Offre gratuite | Quand passer à l'offre payante |
| --- | --- | --- |
| Cloudflare Workers | 100 000 visites de pages par jour | Si des pages affichent « Error 1102 » (temps de calcul dépassé) ou si le trafic grossit : **Workers Paid**, 5 $ par mois |
| Supabase | Base de 500 Mo, 1 Go de photos. Le projet est **mis en pause après 7 jours sans activité**. Pas de sauvegarde automatique | **Recommandé dès l'ouverture : Pro, 25 $ par mois**, pour les sauvegardes quotidiennes et l'absence de mise en pause |
| Brevo | 300 e-mails par jour | Les SMS sont payants dès le premier, avec des crédits à acheter |
| Wave | Pas d'abonnement | Commission sur chaque paiement reçu |
| Nom de domaine | — | Environ 10 $ par an pour un `.com`. Pour un `.sn`, voir le tarif de ton bureau d'enregistrement |

## 10. En cas de problème

| Symptôme | Cause probable | Solution |
| --- | --- | --- |
| La construction échoue sur Cloudflare avec « Missing Supabase environment variable » | Variables de build absentes | Étape 3.4, puis **Retry build** |
| La construction échoue avec une erreur de version de Node | Node trop ancien | Le fichier `.node-version` demande Node 22. Ajoute sinon la variable de build `NODE_VERSION` = `22` |
| Après inscription ou connexion, le client arrive sur `localhost` | Site URL Supabase | Étape 5 |
| « redirect_uri_mismatch » avec Google | Origine non autorisée | Étape 5, Connexion Google |
| Les clients ne reçoivent pas l'e-mail de confirmation | SMTP par défaut de Supabase | Étape 5, E-mails de connexion |
| Pages en « Error 1102 » | Limite de calcul de l'offre gratuite | Passer à Workers Paid (5 $ par mois) |
| Le site affiche une erreur après une mise à jour | Mise à jour défectueuse | **Rollback** (étape 8), puis signale-moi le problème |
| Le site est vide ou ne charge plus aucune donnée | Projet Supabase en pause (offre gratuite) | Supabase → **Restore project**, puis passer à Pro |
