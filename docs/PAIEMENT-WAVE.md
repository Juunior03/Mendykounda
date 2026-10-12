# Paiement Wave — mise en service

Le code est prêt. Il reste à brancher **ton** compte Wave Business. Aucune clé
n'est à mettre dans le code ni dans `.env` : elles vont dans les **secrets
Supabase**, lus uniquement par les Edge Functions.

## Comment ça marche

```
Navigateur ──place_order(…, 'wave')──▶ Base (commande « non payée », stock réservé)
Navigateur ──wave-checkout {create}──▶ Edge Function ──POST /v1/checkout/sessions──▶ Wave
Navigateur ◀── wave_launch_url ──────── (montant relu en base, jamais envoyé par le navigateur)
Client paie dans l'appli Wave (ou QR code sur ordinateur)
Wave ──webhook──▶ wave-webhook ──GET /v1/checkout/sessions/{id}──▶ Wave ──▶ commande « payée »
Wave ──redirige──▶ /order-confirmation?wave=success ──wave-checkout {sync}──▶ même vérification
```

Une commande n'est marquée **payée** qu'après avoir relu la session
**directement auprès de Wave** avec ta clé secrète, et seulement si la
référence, la devise (XOF) et le montant correspondent exactement à la
commande. Un faux webhook ne peut donc pas valider une commande.

## 1. Base de données

SQL Editor → exécute `supabase/migrations/20261014090000_wave_payment.sql`.

## 2. Compte Wave Business et clé d'API

1. Ouvre un compte **Wave Business** (marchand) si ce n'est pas fait.
2. Dans le portail Wave Business, section **Développeurs** : crée une **clé d'API**
   avec l'accès **Checkout API**. Elle commence en général par `wave_sn_prod_…`.
3. Garde-la secrète : ne l'envoie à personne, ne la colle pas dans le code.

## 3. Installer l'outil Supabase sur ton Mac

```bash
brew install supabase/tap/supabase
supabase login
cd ~/chemin/vers/Mendykounda
supabase link --project-ref mqngaphjmrcftnkcojnv
```

## 4. Enregistrer les secrets

```bash
supabase secrets set WAVE_API_KEY="ta-clé-wave" SITE_URL="http://localhost:8080"
```

- `SITE_URL` : l'adresse où Wave renvoie le client après paiement. Mets ton
  vrai domaine (`https://…`) dès que le site est en ligne.
- `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement
  aux fonctions : rien à faire.

## 5. Déployer les fonctions

```bash
supabase functions deploy wave-checkout
supabase functions deploy wave-webhook
```

`wave-webhook` est déployée sans vérification de jeton Supabase (réglage dans
`supabase/config.toml`) puisque c'est Wave qui l'appelle ; elle vérifie elle-même
le secret Wave.

## 6. Déclarer le webhook chez Wave

Dans le portail Wave Business → **Développeurs → Webhooks** :

- **URL** : `https://mqngaphjmrcftnkcojnv.supabase.co/functions/v1/wave-webhook`
- **Évènements** : `checkout.session.completed` et `checkout.session.payment_failed`
- **Sécurité** : « secret de signature » (recommandé) ou « secret partagé » —
  la fonction accepte les deux.

Copie le secret affiché, puis :

```bash
supabase secrets set WAVE_WEBHOOK_SECRET="le-secret-du-webhook"
```

## 7. Annuler automatiquement les paiements abandonnés

Une commande Wave réserve le stock. Si le client ne paie jamais, elle est
annulée (et le stock remis) par `expire_unpaid_wave_orders`. Pour l'exécuter
toutes les 15 minutes :

1. Supabase → **Database → Extensions** → active **pg_cron**.
2. SQL Editor :

```sql
SELECT cron.schedule(
  'expirer-commandes-wave',
  '*/15 * * * *',
  $$ SELECT public.expire_unpaid_wave_orders(interval '2 hours') $$
);
```

Sans pg_cron, le client peut toujours annuler lui-même depuis « Mes commandes »,
ou toi depuis l'admin.

## 8. Afficher Wave au paiement

Dans ton fichier `.env` (et chez ton hébergeur plus tard), ajoute :

```
VITE_WAVE_ENABLED="true"
```

puis relance `npm run dev`. Tant que cette ligne n'est pas à `true`, l'option
Wave reste cachée et seul le paiement à la livraison est proposé.

## 9. Tester

1. Crée un produit de test à petit prix (ex. 100 FCFA).
2. Commande-le en choisissant **Wave**, paie avec ton téléphone.
3. Vérifie : la page de confirmation affiche « Paiement Wave reçu », l'admin
   affiche « Payée · Wave ».
4. En cas de souci : Supabase → **Edge Functions → wave-checkout / wave-webhook → Logs**.

En développement avec `SITE_URL=http://localhost:8080`, si tu paies depuis ton
téléphone, la redirection finale vers `localhost` ne s'ouvrira pas sur le
téléphone : c'est normal. Le webhook marque quand même la commande payée ;
recharge la page sur ton ordinateur.

## Cas particuliers

- **Paiement reçu après annulation automatique** (client très en retard) : la
  commande apparaît « Annulée » et « Payée » dans l'admin. Rembourse depuis
  Wave Business ou réactive la commande (si le stock le permet).
- **Montants** : Wave n'accepte pas de centimes en FCFA. Un total à virgule est
  refusé avec un message clair ; garde des prix entiers.

## À vérifier dans la documentation officielle Wave

La documentation (docs.wave.com) n'a pas pu être consultée lors du
développement. Le code suit l'API publique Checkout (`POST /v1/checkout/sessions`,
`GET /v1/checkout/sessions/{id}`, en-tête `Authorization: Bearer`, montant en
chaîne sans décimales). Points à confirmer lors de l'activation :

- le format exact de l'en-tête `Wave-Signature` (le code accepte
  `t=<horodatage>,v1=<hmac>` et le mode « secret partagé ») — sans impact sur la
  sécurité grâce à la relecture de la session auprès de Wave ;
- l'obligation éventuelle d'une adresse `https://` pour `SITE_URL`.
