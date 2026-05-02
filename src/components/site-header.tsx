/**
 * Header — minimalist editorial nav, slim sticky bar.
 */
import { Link } from "@tanstack/react-router";
import { ShoppingBag, User as UserIcon, Menu, X } from "lucide-react";
import { useState } from "react";
import { useCart, cartTotals } from "@/lib/cart";
import { useAuth } from "@/lib/auth";

export function SiteHeader() {
  const cart = useCart();
  const { itemCount } = cartTotals(cart);
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  const navItems = [
    { to: "/shop", label: "Boutique" },
    { to: "/about", label: "Notre ferme" },
    { to: "/contact", label: "Contact" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="container-editorial flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-medium tracking-tight">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" />
          <span className="text-base">MendyKounda</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {navItems.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="underline-grow text-sm text-foreground/80 hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              to="/admin"
              className="hidden rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground/80 hover:text-foreground md:inline-block"
            >
              Admin
            </Link>
          )}
          <Link
            to={user ? "/account" : "/auth"}
            className="rounded-full p-2 text-foreground/80 hover:bg-secondary hover:text-foreground"
            aria-label={user ? "Mon compte" : "Se connecter"}
          >
            <UserIcon className="h-4 w-4" />
          </Link>
          <Link
            to="/cart"
            className="relative rounded-full p-2 text-foreground/80 hover:bg-secondary hover:text-foreground"
            aria-label="Panier"
          >
            <ShoppingBag className="h-4 w-4" />
            {itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {itemCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-full p-2 text-foreground/80 hover:bg-secondary md:hidden"
            aria-label="Menu"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-background md:hidden">
          <nav className="container-editorial flex flex-col gap-1 py-4">
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
