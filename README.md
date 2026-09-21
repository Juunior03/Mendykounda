# Farm Fresh Hub

Bonjour Lovable !

Je veux que tu recrées et améliores mon projet MendyKounda (https://github.com/Juunior03/mendy_services), une application full-stack pour une ferme agricole.

**Objectif :**

1. Reproduire exactement la même application (React + Vite + Tailwind CSS pour le frontend, Supabase pour le backend).

2. L’améliorer sur tous les plans : design, fonctionnalités, sécurité, performance.

**Spécifications :**

- **Design** : Améliore le design actuel avec une palette de couleurs moderne (#22c55e pour le vert, #f59e0b pour l’orange), des animations fluides, et un style 100% responsive. Utilise Inter comme police.

- **Fonctionnalités à ajouter** :

  - Système de paiement (Stripe).

  - Notifications par email (via Supabase Edge Functions).

  - Filtres avancés pour les produits.

  - Graphiques détaillés dans l’admin (Chart.js).

  - Authentification client (inscription/connexion).

  - Système de commentaires/avis pour les produits.

- **Sécurité** : Renforce les politiques RLS dans Supabase et protège les routes admin.

- **Performance** : Utilise React Query pour le cache et optimise les requêtes Supabase.

- **Tests** : Ajoute des tests unitaires (Jest) et d’intégration.

- **Documentation** : Fournis un README complet avec des captures d’écran et un diagramme d’architecture.

**Contraintes :**

- Garde React 19, Vite, Tailwind CSS et Supabase.

- Ne change pas l’architecture globale (client/admin/shared).

- Le code doit être propre, commenté et modulaire.

**Livrables :**

- Un nouveau dépôt GitHub (ou une branche) avec tout le code.

- Un README.md mis à jour.

- Un fichier supabase-schema.sql optimisé.

- Un dossier /docs avec la documentation.

**Par où commencer ?**

1. Génère d’abord le schéma Supabase amélioré (avec les tables users, payments, reviews).

2. Ensuite, crée la structure du frontend client (dossiers, fichiers de config, composants de base).

3. Puis passe au frontend admin.

4. Enfin, ajoute les fonctionnalités avancées (paiement, notifications, etc.).

Merci de me guider étape par étape et de me demander confirmation avant de passer à l’étape suivante !

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a0e92990-16e0-4813-9317-645959de07a1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
