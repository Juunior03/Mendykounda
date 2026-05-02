/**
 * Maps the demo image slug stored in DB to actual bundled assets.
 * Real product assets are imported as ES modules so Vite hashes them.
 */
import poulet from "@/assets/p-poulet.jpg";
import oeufs from "@/assets/p-oeufs.jpg";
import lait from "@/assets/p-lait.jpg";
import fromage from "@/assets/p-fromage.jpg";
import viande from "@/assets/p-viande.jpg";

const map: Record<string, string> = {
  "/src/assets/p-poulet.jpg": poulet,
  "/src/assets/p-oeufs.jpg": oeufs,
  "/src/assets/p-lait.jpg": lait,
  "/src/assets/p-fromage.jpg": fromage,
  "/src/assets/p-viande.jpg": viande,
};

export const resolveProductImage = (url: string | null | undefined): string | null => {
  if (!url) return null;
  return map[url] ?? url;
};
