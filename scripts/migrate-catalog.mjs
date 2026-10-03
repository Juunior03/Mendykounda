/**
 * Copie le catalogue (catégories, produits, images) de l'ancien backend
 * Lovable Cloud vers ton propre projet Supabase.
 *
 * Prérequis : supabase/setup.sql a déjà été exécuté sur le nouveau projet.
 *
 * Usage (depuis la racine du projet, sur ton ordinateur) :
 *   OLD_SUPABASE_URL=https://xxxx.supabase.co \
 *   OLD_SUPABASE_KEY=<clé publique de l'ancien projet> \
 *   NEW_SUPABASE_URL=https://yyyy.supabase.co \
 *   NEW_SUPABASE_SERVICE_ROLE_KEY=<clé service_role du nouveau projet> \
 *   node scripts/migrate-catalog.mjs
 *
 * Optionnel : OLD_ADMIN_EMAIL / OLD_ADMIN_PASSWORD (ton compte admin sur
 * l'ancien site) pour copier aussi les produits désactivés, invisibles sinon.
 *
 * Le script peut être relancé sans risque : tout est fait en "upsert".
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "product-images";

function env(name, required = true) {
  const v = process.env[name]?.trim();
  if (required && !v) {
    console.error(`Variable manquante : ${name}`);
    process.exit(1);
  }
  return v;
}

const OLD_URL = env("OLD_SUPABASE_URL").replace(/\/$/, "");
const NEW_URL = env("NEW_SUPABASE_URL").replace(/\/$/, "");
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const oldDb = createClient(OLD_URL, env("OLD_SUPABASE_KEY"), noSession);
const newDb = createClient(NEW_URL, env("NEW_SUPABASE_SERVICE_ROLE_KEY"), noSession);

const adminEmail = env("OLD_ADMIN_EMAIL", false);
if (adminEmail) {
  const { error } = await oldDb.auth.signInWithPassword({
    email: adminEmail,
    password: env("OLD_ADMIN_PASSWORD"),
  });
  if (error) {
    console.error("Connexion admin à l'ancien projet impossible :", error.message);
    process.exit(1);
  }
  console.log("Connecté à l'ancien projet en admin (produits désactivés inclus).");
}

async function fetchAll(table) {
  const { data, error } = await oldDb.from(table).select("*");
  if (error) throw new Error(`Lecture ${table} : ${error.message}`);
  return data ?? [];
}

const oldPrefix = `${OLD_URL}/storage/v1/object/public/${BUCKET}/`;
const copied = new Map();

/** Recopie une image hébergée sur l'ancien stockage et renvoie sa nouvelle URL. */
async function migrateImage(url) {
  if (!url || !url.startsWith(oldPrefix)) return url; // asset local ou URL externe
  if (copied.has(url)) return copied.get(url);

  const path = decodeURIComponent(url.slice(oldPrefix.length).split("?")[0]);
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ! image introuvable (${res.status}) : ${url}`);
    return url;
  }
  const { error } = await newDb.storage.from(BUCKET).upload(path, await res.arrayBuffer(), {
    contentType: res.headers.get("content-type") ?? "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(`Upload ${path} : ${error.message}`);

  const newUrl = newDb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  copied.set(url, newUrl);
  return newUrl;
}

const categories = await fetchAll("categories");
const products = await fetchAll("products");
console.log(`Trouvé : ${categories.length} catégories, ${products.length} produits.`);

for (const c of categories) c.image_url = await migrateImage(c.image_url);
for (const p of products) p.image_url = await migrateImage(p.image_url);
console.log(`Images copiées : ${copied.size}.`);

// On garde les mêmes id pour que products.category_id reste valide.
const { error: catErr } = await newDb.from("categories").upsert(categories, { onConflict: "id" });
if (catErr) throw new Error(`Écriture categories : ${catErr.message}`);
const { error: prodErr } = await newDb.from("products").upsert(products, { onConflict: "id" });
if (prodErr) throw new Error(`Écriture products : ${prodErr.message}`);

console.log("Catalogue migré avec succès.");
