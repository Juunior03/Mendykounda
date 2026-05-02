import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border/60 bg-cream">
      <div className="container-editorial grid gap-12 py-16 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 text-base font-medium tracking-tight">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            MendyKounda
          </div>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Une ferme familiale dévouée à un élevage respectueux. Du pré à votre table,
            sans intermédiaire.
          </p>
        </div>
        <div>
          <p className="editorial-eyebrow mb-4">Boutique</p>
          <ul className="space-y-2 text-sm text-foreground/80">
            <li><Link to="/shop" className="underline-grow">Tous les produits</Link></li>
            <li><Link to="/shop" search={{ category: "volailles" }} className="underline-grow">Volailles</Link></li>
            <li><Link to="/shop" search={{ category: "oeufs" }} className="underline-grow">Œufs</Link></li>
            <li><Link to="/shop" search={{ category: "produits-laitiers" }} className="underline-grow">Laitiers</Link></li>
          </ul>
        </div>
        <div>
          <p className="editorial-eyebrow mb-4">Maison</p>
          <ul className="space-y-2 text-sm text-foreground/80">
            <li><Link to="/about" className="underline-grow">Notre ferme</Link></li>
            <li><Link to="/contact" className="underline-grow">Contact</Link></li>
            <li><Link to="/auth" className="underline-grow">Espace client</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border/60">
        <div className="container-editorial flex flex-col items-center justify-between gap-2 py-6 text-xs text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} MendyKounda. Tous droits réservés.</p>
          <p>Élevage en plein air · Direct producteur</p>
        </div>
      </div>
    </footer>
  );
}
