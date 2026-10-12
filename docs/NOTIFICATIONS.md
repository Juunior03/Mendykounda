# E-mails et SMS de confirmation de commande

Après chaque commande, le site appelle l'Edge Function `order-notify`, qui envoie :

- **au client** : un e-mail de confirmation (articles, total, adresse, livraison
  estimée, bouton « Suivre ma commande ») et un SMS court ;
- **à la ferme** (facultatif) : un e-mail « Nouvelle commande ».

Exemple de SMS (129 caractères, un seul SMS) :

```
MendyKounda: commande 0F3A9C21 confirmée (13 500 F CFA). Livraison prévue du 13/10 au 15/10. Suivi: https://mendykounda.sn/orders
```

Les envois passent par **Brevo** (un seul compte pour les e-mails et les SMS).
Chaque canal est indépendant : sans configuration, il est simplement ignoré et
la commande se passe normalement. Une commande ne déclenche **qu'un seul**
e-mail et **qu'un seul** SMS, même si la page est rechargée. L'admin affiche
`E-mail ✓ · SMS ✓` sous le nom du client.

Le SMS n'est envoyé qu'aux numéros mobiles sénégalais (`77…`, `+221 7…`,
`00221 7…`). Les numéros fixes ou étrangers reçoivent seulement l'e-mail.

## 1. Base de données

SQL Editor → exécute `supabase/migrations/20261015090000_order_notifications.sql`.

## 2. Compte Brevo

1. Crée un compte sur [brevo.com](https://www.brevo.com) (offre gratuite :
   environ 300 e-mails par jour).
2. **Expéditeur e-mail** : *Paramètres → Expéditeurs, domaines et IP dédiées*.
   - Idéal : authentifie ton nom de domaine (ex. `commandes@mendykounda.sn`),
     les e-mails arrivent bien mieux en boîte de réception.
   - En attendant : valide une adresse que tu possèdes (Brevo t'envoie un code).
3. **Clé d'API** : *Paramètres → SMTP & API → Clés API → Générer*. Elle commence
   par `xkeysib-…`. Garde-la secrète.
4. **SMS** (facultatif) : les SMS sont **prépayés** chez Brevo. Achète un pack de
   crédits et vérifie le tarif vers le Sénégal (de l'ordre de quelques dizaines
   de FCFA par SMS d'après des sources non officielles ; demande le tarif exact
   à Brevo). Le nom d'expéditeur (ex. `MendyKounda`) fait 11 caractères maximum.

## 3. Secrets Supabase

```bash
supabase secrets set \
  BREVO_API_KEY="xkeysib-…" \
  EMAIL_FROM="adresse-validée-dans-brevo@exemple.com" \
  EMAIL_FROM_NAME="MendyKounda" \
  ADMIN_EMAIL="ton-adresse@exemple.com" \
  SITE_URL="http://localhost:8080"
```

Pour activer les SMS (une fois les crédits achetés) :

```bash
supabase secrets set SMS_SENDER="MendyKounda"
```

| Secret | Rôle | Sans lui |
| --- | --- | --- |
| `BREVO_API_KEY` | clé Brevo | aucun envoi |
| `EMAIL_FROM` | adresse d'expédition validée | pas d'e-mail |
| `EMAIL_FROM_NAME` | nom affiché | « MendyKounda » |
| `ADMIN_EMAIL` | alerte « nouvelle commande » | pas d'alerte |
| `SMS_SENDER` | nom d'expéditeur SMS | pas de SMS |
| `SITE_URL` | liens dans les messages | `http://localhost:8080` |

`SITE_URL` est partagé avec le paiement Wave : mets ton vrai domaine dès que le
site est en ligne.

## 4. Déployer la fonction

```bash
supabase functions deploy order-notify
```

## 5. Tester

1. Passe une commande sur le site avec ton propre compte et ton numéro.
2. Tu dois recevoir l'e-mail (vérifie les spams la première fois), le SMS, et
   l'alerte sur `ADMIN_EMAIL`.
3. Dans l'admin → Commandes : `E-mail ✓ · SMS ✓`.
4. En cas de souci : Supabase → *Edge Functions → order-notify → Logs*, et dans
   Brevo : *Transactionnel → Logs* (e-mails) et *SMS → Logs*.

## Remarques

- Les envois partent du navigateur juste après la commande. Si le client ferme
  la page dans la seconde qui suit, l'envoi peut ne pas avoir lieu ;
  la commande, elle, est bien enregistrée.
- Les règles d'envoi de SMS au Sénégal (ARTP) et l'enregistrement éventuel du
  nom d'expéditeur sont à confirmer avec Brevo lors de l'achat des crédits.
