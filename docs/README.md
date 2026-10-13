# MendyKounda — Documentation

Plateforme e-commerce premium pour la ferme MendyKounda (légumes, fruits de saison, volailles vivantes ou au kilo, œufs, porcs sur pied ou en viande, produits laitiers, jus…).

## 🛠 Stack

- **Frontend** : React 19 + TanStack Start (SSR) + Vite 7 + Tailwind CSS v4
- **Backend** : Supabase (projet `mqngaphjmrcftnkcojnv`) — Postgres + RLS + Auth + Storage + Realtime — voir [MIGRATION-SUPABASE.md](MIGRATION-SUPABASE.md)
- **State** : TanStack Query, store panier custom (`useSyncExternalStore`)
- **UI** : shadcn/ui + Lucide icons + Sonner (toasts)
- **Charts** : Recharts (dashboard admin)
- **Auth** : Email/mot de passe + Google OAuth (Supabase Auth)

## 📁 Structure

```
src/
├── routes/
│   ├── __root.tsx              # Shell HTML + providers
│   └── _app/                   # Layout client (header/footer)
│       ├── index.tsx           # Accueil
│       ├── shop.tsx            # Boutique + filtres
│       ├── products.$slug.tsx  # Fiche produit + avis
│       ├── cart.tsx            # Panier
│       ├── checkout.tsx        # Tunnel commande
│       ├── order-confirmation.tsx
│       ├── account.tsx         # Espace client
│       ├── auth.tsx            # Login / Signup / Google
│       ├── admin.tsx           # Dashboard admin (KPIs/produits/commandes)
│       ├── about.tsx
│       └── contact.tsx
├── components/
│   ├── site-header.tsx
│   ├── site-footer.tsx
│   ├── product-card.tsx
│   └── ui/                     # shadcn primitives
├── lib/
│   ├── auth.tsx                # AuthProvider + useAuth
│   ├── cart.ts                 # Store panier persistant
│   ├── queries.ts              # Factories TanStack Query
│   ├── format.ts               # formatPrice (EUR)
│   └── product-images.ts       # Mapping image_url → asset
├── integrations/
│   ├── supabase/               # Client + types (auto-generés)
│   └── lovable/                # OAuth managed (auto-generé)
└── styles.css                  # Design tokens (oklch)
```

## 🗄 Modèle de données

| Table         | Rôle                                                        |
|---------------|-------------------------------------------------------------|
| `profiles`    | Données utilisateur (nom, téléphone, adresse)               |
| `user_roles`  | Rôles (`customer` / `admin`) — table séparée pour la sécu  |
| `categories`  | Catégories de produits                                      |
| `products`    | Produits (prix, stock, unité, image, actif, mis en avant)   |
| `reviews`     | Avis 1–5★ + commentaire                                     |
| `orders`      | Commandes (livraison, statut, paiement)                     |
| `order_items` | Lignes de commande                                          |

### Enums
- `app_role` : `customer`, `admin`
- `order_status` : `pending`, `processing`, `ready`, `shipped`, `delivered`, `cancelled`
- `payment_status` : `unpaid`, `paid`, `refunded`, `failed`

## 🔐 Sécurité

- **RLS activé** sur toutes les tables.
- Les rôles ne sont **jamais** stockés sur `profiles` (anti-escalation).
- Vérification via fonction `SECURITY DEFINER` `has_role(uid, role)`.
- Triggers `on_auth_user_created` → crée `profiles` + assigne `customer`.

## 👤 Promouvoir un administrateur

1. Inscrivez-vous normalement via `/auth`.
2. Récupérez votre `user_id` depuis Lovable Cloud → Users.
3. Exécutez ce SQL (Cloud → Database → SQL editor) :

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<VOTRE_USER_ID>', 'admin')
ON CONFLICT DO NOTHING;
```

4. Déconnectez-vous puis reconnectez-vous : le bouton **Admin** apparaît dans le header.

## 🛒 Tunnel d'achat

1. `/shop` → ajout au panier (localStorage, persistant).
2. `/cart` → édition quantités.
3. `/checkout` → formulaire livraison (préremplit depuis `profiles`) + insert `orders` + `order_items`.
4. `/order-confirmation?id=…` → récap.
5. **Paiement** : à la livraison ou par Wave (voir [PAIEMENT-WAVE.md](PAIEMENT-WAVE.md)).

## 🎨 Design system

- Palette éditoriale, fond `cream`/`warm`, accent `primary` (vert) + `accent` (orange).
- Typo : Inter (UI) + Playfair Display (titres premium).
- Tokens dans `src/styles.css` (oklch). Jamais de couleur en dur dans les composants.

## 🚀 Déploiement

Le site est hébergé sur Cloudflare Workers et se republie à chaque fusion dans `main` : voir [HEBERGEMENT.md](HEBERGEMENT.md). Les migrations Supabase s'exécutent à la main avant la fusion. Les fonctions Supabase se déploient avec `supabase functions deploy` (voir [PAIEMENT-WAVE.md](PAIEMENT-WAVE.md) et [NOTIFICATIONS.md](NOTIFICATIONS.md)).

## ✅ Roadmap restante

- Filtres avancés (multi-catégories, slider prix).
