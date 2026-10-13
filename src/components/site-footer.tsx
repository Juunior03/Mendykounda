import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Mail, MapPin } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-primary text-primary-foreground">
      <div className="container-market grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div><BrandLogo inverted /><p className="mt-4 max-w-xs text-sm text-primary-foreground/75">La ferme en ligne qui rapproche les produits locaux des familles de la région de Ziguinchor.</p><p className="mt-4 flex items-center gap-2 text-sm text-primary-foreground/75"><MapPin className="h-4 w-4" /> Région de Ziguinchor, Sénégal</p></div>
        <div><p className="mb-4 font-semibold">Besoin d’aide ?</p><ul className="space-y-3 text-sm text-primary-foreground/75"><li><Link to="/contact" className="hover:text-primary-foreground">Contactez-nous</Link></li><li><Link to="/orders" className="hover:text-primary-foreground">Suivre mes commandes</Link></li><li><Link to="/cart" className="hover:text-primary-foreground">Mon panier</Link></li></ul></div>
        <div><p className="mb-4 font-semibold">MendyKounda</p><ul className="space-y-3 text-sm text-primary-foreground/75"><li><Link to="/about" className="hover:text-primary-foreground">Notre ferme</Link></li><li><Link to="/shop" className="hover:text-primary-foreground">Tous les produits</Link></li><li><Link to="/auth" className="hover:text-primary-foreground">Espace client</Link></li></ul></div>
        <div><p className="mb-4 font-semibold">Restons en contact</p><p className="text-sm text-primary-foreground/75">Une demande particulière ? Écrivez-nous directement depuis la messagerie du site.</p><Link to="/contact" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#f6ad55] hover:underline"><Mail className="h-4 w-4" /> Nous écrire</Link><div className="mt-5 flex gap-3"><Facebook className="h-5 w-5" /><Instagram className="h-5 w-5" /></div></div>
      </div>
      <div className="border-t border-primary-foreground/15"><div className="container-market flex flex-col gap-2 py-5 text-xs text-primary-foreground/70 sm:flex-row sm:items-center sm:justify-between"><p>© {new Date().getFullYear()} MendyKounda. Tous droits réservés.</p><p>Paiement en FCFA · Direct producteur</p></div></div>
    </footer>
  );
}
