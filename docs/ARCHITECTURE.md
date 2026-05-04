# Architecture

## Flux d'authentification

```
User → /auth ─┬─ email/password ──► supabase.auth.signUp / signInWithPassword
              └─ Google ──────────► lovable.auth.signInWithOAuth("google")
                                       │
                                       ▼
                           trigger on_auth_user_created
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
                    profiles (insert)        user_roles (customer)
```

## Flux commande

```
Cart (localStorage) ─► /checkout (formulaire livraison)
                           │
                           ▼
                  insert orders (RLS: user_id = auth.uid())
                           │
                           ▼
                  insert order_items (RLS: parent order owned)
                           │
                           ▼
                  cart.clear() + redirect /order-confirmation
```

## Sécurité RLS

| Table       | Lecture           | Écriture                         |
|-------------|-------------------|----------------------------------|
| products    | public (actif)    | admin uniquement                 |
| categories  | public            | admin uniquement                 |
| reviews     | public            | propriétaire (CRUD), admin (DEL) |
| orders      | propriétaire+admin| user (INSERT), admin (UPDATE)    |
| order_items | propriétaire+admin| user (INSERT via parent)         |
| profiles    | propriétaire+admin| propriétaire                     |
| user_roles  | propriétaire+admin| admin uniquement                 |
