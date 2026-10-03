# Migration du backend : Lovable Cloud → ton propre Supabase

Le code ne dépend plus de Lovable Cloud : connexion Google et sessions passent
directement par Supabase. Il reste à configurer ton projet, dans cet ordre.

## 1. Créer la base de données

1. Supabase → ton projet → **SQL Editor** → **New query**.
2. Colle tout le contenu de [`supabase/setup.sql`](../supabase/setup.sql) et clique **Run**.

Cela crée les tables, les règles de sécurité (RLS), les triggers (profil +
rôle `customer` créés à l'inscription), le bucket `product-images` et active
le temps réel pour la messagerie.

> Alternative en ligne de commande : `npx supabase link --project-ref <ref>`
> puis `npx supabase db push` (applique `supabase/migrations/`). N'utilise
> **qu'une seule** des deux méthodes.

## 2. Brancher le site sur ton projet

1. **Project Settings → API** : récupère l'URL du projet, la clé
   **publishable/anon** et la référence du projet (`<ref>` dans `https://<ref>.supabase.co`).
2. Copie `.env.example` en `.env` et remplis-le.
3. Dans `supabase/config.toml`, remplace `project_id` par ta référence.

`.env` n'est plus suivi par git : sur ton hébergeur (Cloudflare, Vercel…),
déclare les mêmes variables dans ses réglages **avant** le build — les
`VITE_*` sont intégrées au moment de la compilation.

## 3. Configurer l'authentification

**Authentication → URL Configuration**
- *Site URL* : l'adresse de ton site en production (ex. `https://mendykounda.com`).
- *Redirect URLs* : ajoute
  - `https://<ton-domaine>/**`
  - `http://localhost:8080/**` (développement local)

Sans ça, les liens des emails (confirmation, mot de passe oublié) et le retour
de Google ne fonctionneront pas.

**Connexion Google** (Lovable la fournissait, il faut maintenant tes propres identifiants)
1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) →
   *Create credentials* → *OAuth client ID* → type *Web application*.
2. *Authorized redirect URI* : `https://<ref>.supabase.co/auth/v1/callback`.
3. Supabase → **Authentication → Providers → Google** : active-le, colle le
   *Client ID* et le *Client secret*.

**Emails** : le serveur d'envoi intégré de Supabase est limité à quelques
emails par heure. Pour la production, configure un SMTP
(**Authentication → Emails → SMTP Settings**, ex. Resend, Brevo).

## 4. Copier le catalogue (catégories, produits, images)

Sur ton ordinateur, à la racine du projet (`npm install` déjà fait) :

```bash
OLD_SUPABASE_URL="https://gykxjjntvcfqybwnbved.supabase.co" \
OLD_SUPABASE_KEY="<SUPABASE_PUBLISHABLE_KEY de l'ancien .env>" \
OLD_ADMIN_EMAIL="ton-email-admin" OLD_ADMIN_PASSWORD="ton-mot-de-passe" \
NEW_SUPABASE_URL="https://<ref>.supabase.co" \
NEW_SUPABASE_SERVICE_ROLE_KEY="<clé service_role du nouveau projet>" \
node scripts/migrate-catalog.mjs
```

- L'ancienne clé publique est dans l'historique git :
  `git show a9ffb07:.env`.
- `OLD_ADMIN_*` est optionnel : sans, seuls les produits **actifs** sont copiés.
- La clé `service_role` est secrète : ne la colle nulle part ailleurs que dans ce terminal.
- Le script est relançable sans créer de doublons.

Les images hébergées sur l'ancien stockage sont recopiées dans ton bucket et
les URLs réécrites. Les images de démo (`/src/assets/...`) restent dans le code.

## 5. Recréer le compte administrateur

Les comptes clients ne sont pas migrés (Lovable Cloud ne permet pas d'exporter
les mots de passe) : chacun devra se réinscrire.

1. Inscris-toi sur le site (branché sur le nouveau projet).
2. Dans le SQL Editor :

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'ton-email@exemple.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

3. Déconnecte-toi / reconnecte-toi : la page `/admin` est accessible.

## 6. Vérifier

- [ ] La boutique affiche produits et images
- [ ] Inscription par email + lien de confirmation
- [ ] Connexion Google
- [ ] Passer une commande → visible dans *Mon compte* et dans l'admin
- [ ] Ajouter / modifier un produit avec upload d'image dans l'admin
- [ ] Messagerie client ↔ admin en temps réel

## Notes

- `src/integrations/supabase/types.ts` correspond déjà au schéma. Pour le
  régénérer après de futurs changements :
  `npx supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts`.
- La config Vite (`@lovable.dev/vite-tanstack-config`) est un simple paquet npm
  et fonctionne sans compte Lovable ; elle a été conservée pour ne rien casser.
