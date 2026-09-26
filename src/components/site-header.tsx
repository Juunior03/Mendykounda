/**
 * Header — minimalist editorial nav, slim sticky bar.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Headphones, Menu, Search, ShoppingBag, User as UserIcon, X } from "lucide-react";
import { useState } from "react";
import { useCart, cartTotals } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const cart = useCart();
  const { itemCount } = cartTotals(cart);
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const navItems = [
    { to: "/shop", label: "Boutique" },
    { to: "/about", label: "Notre ferme" },
    { to: "/contact", label: "Contact" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card shadow-soft">
      <div className="hidden border-b border-border/70 bg-secondary/70 lg:block">
        <div className="container-market flex h-8 items-center justify-between text-xs text-muted-foreground">
          <span>Produits fermiers frais, livrés au Sénégal</span>
          <div className="flex items-center gap-6"><Link to="/contact" className="hover:text-foreground">Aide & contact</Link><span>Livraison directe producteur</span></div>
        </div>
      </div>
      <div className="container-market grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2 lg:min-h-20 lg:gap-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">{open ? <X /> : <Menu />}</Button>
        <Link to="/" className="min-w-0 truncate text-base font-semibold sm:text-lg lg:hidden">MendyKounda</Link>
        <Link to="/" className="hidden items-center gap-2 font-semibold lg:flex"><span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-lg text-primary-foreground">M</span><span className="text-xl">MendyKounda</span></Link>
        <form className="col-span-3 row-start-2 flex min-w-0 lg:col-span-1 lg:row-start-auto" onSubmit={(event) => { event.preventDefault(); navigate({ to: "/shop", search: query.trim() ? { q: query.trim() } : {} }); }}>
          <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un produit fermier" className="h-11 w-full rounded-l-md border border-r-0 border-input bg-background pl-10 pr-3 text-sm outline-none focus:border-primary" aria-label="Rechercher un produit" /></div>
          <Button type="submit" className="h-11 rounded-l-none px-4 lg:px-6">Rechercher</Button>
        </form>
        <div className="flex shrink-0 items-center gap-1 lg:gap-2">
          {isAdmin && (
            <Link
              to="/admin"
              className="hidden rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground/80 hover:text-foreground xl:inline-block"
            >
              Admin
            </Link>
          )}
          <Link
            to={user ? "/account" : "/auth"}
            className="flex min-h-10 items-center gap-2 rounded-md px-2 text-foreground/80 hover:bg-secondary hover:text-foreground"
            aria-label={user ? "Mon compte" : "Se connecter"}
          >
            <UserIcon className="h-5 w-5" /><span className="hidden text-sm lg:inline">{user ? "Mon compte" : "Se connecter"}</span><ChevronDown className="hidden h-3 w-3 xl:block" />
          </Link>
          <Link
            to="/cart"
            className="relative flex min-h-10 items-center gap-2 rounded-md px-2 text-foreground/80 hover:bg-secondary hover:text-foreground"
            aria-label="Panier"
          >
            <ShoppingBag className="h-5 w-5" /><span className="hidden text-sm lg:inline">Panier</span>
            {itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {itemCount}
              </span>
            )}
          </Link>
        </div>
      </div>
      <nav className="hidden border-t border-border/70 lg:block"><div className="container-market flex h-11 items-center gap-8 overflow-x-auto text-sm"><Link to="/shop" className="flex shrink-0 items-center gap-2 font-semibold text-primary"><Menu className="h-4 w-4" /> Toutes les catégories</Link>{navItems.map((n) => <Link key={n.to} to={n.to} className="shrink-0 text-foreground/75 hover:text-primary">{n.label}</Link>)}<Link to="/contact" className="ml-auto flex shrink-0 items-center gap-2 text-foreground/75 hover:text-primary"><Headphones className="h-4 w-4" /> Besoin d’aide ?</Link></div></nav>

      {open && (
        <div className="border-t border-border bg-card lg:hidden">
          <nav className="container-market flex flex-col gap-1 py-4">
            <Link to="/" onClick={() => setOpen(false)} className="mb-2 flex items-center gap-2 border-b border-border pb-4 text-lg font-semibold"><span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">M</span>MendyKounda</Link>
            {navItems.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="py-2 text-sm"
              >
                {n.label}
              </Link>
            ))}
            {isAdmin && (
              <Link to="/admin" onClick={() => setOpen(false)} className="py-2 text-sm">
                Admin
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
