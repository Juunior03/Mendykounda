import { Link } from "@tanstack/react-router";
import { Facebook, Instagram, Mail, MapPin, Music2, Phone } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { telHref, useFarm } from "@/lib/farm";

export function SiteFooter() {
  const farm = useFarm();
  const socials = [
    { url: farm.facebook_url, label: "Facebook", Icon: Facebook },
    { url: farm.instagram_url, label: "Instagram", Icon: Instagram },
    { url: farm.tiktok_url, label: "TikTok", Icon: Music2 },
  ].filter((s) => s.url);

  return (
    <footer className="print:hidden border-t border-border bg-primary text-primary-foreground">
      <div className="container-market grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <BrandLogo inverted />
          <p className="mt-4 max-w-xs text-sm text-primary-foreground/75">{farm.description}</p>
          <p className="mt-4 flex items-start gap-2 text-sm text-primary-foreground/75">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {farm.address && (
                <>
                  {farm.address}
                  <br />
                </>
              )}
              {farm.location}
            </span>
          </p>
        </div>
        <div>
          <p className="mb-4 font-semibold">Besoin d’aide ?</p>
          <ul className="space-y-3 text-sm text-primary-foreground/75">
            <li>
              <Link to="/contact" className="hover:text-primary-foreground">
                Contactez-nous
              </Link>
            </li>
            <li>
              <Link to="/orders" className="hover:text-primary-foreground">
                Suivre mes commandes
              </Link>
            </li>
            <li>
              <Link to="/cart" className="hover:text-primary-foreground">
                Mon panier
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-4 font-semibold">MendyKounda</p>
          <ul className="space-y-3 text-sm text-primary-foreground/75">
            <li>
              <Link to="/about" className="hover:text-primary-foreground">
                Notre ferme
              </Link>
            </li>
            <li>
              <Link to="/shop" className="hover:text-primary-foreground">
                Tous les produits
              </Link>
            </li>
            <li>
              <Link to="/auth" className="hover:text-primary-foreground">
                Espace client
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-4 font-semibold">Restons en contact</p>
          <p className="text-sm text-primary-foreground/75">
            Une question ? Discutez avec nous depuis la messagerie du site
            {farm.phone ? " ou appelez-nous" : ""}.
          </p>
          {farm.phone && (
            <a
              href={telHref(farm.phone)}
              className="mt-3 flex items-center gap-2 text-sm text-primary-foreground/90 hover:underline"
            >
              <Phone className="h-4 w-4" /> {farm.phone}
            </a>
          )}
          <Link
            to="/contact"
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#f6ad55] hover:underline"
          >
            <Mail className="h-4 w-4" /> Nous contacter
          </Link>
          {socials.length > 0 && (
            <div className="mt-5 flex gap-3">
              {socials.map(({ url, label, Icon }) => (
                <a
                  key={label}
                  href={url!}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="hover:opacity-80"
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-primary-foreground/15">
        <div className="container-market flex flex-col gap-2 py-5 text-xs text-primary-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {farm.name}. Tous droits réservés.
          </p>
          <p>Paiement en FCFA · Direct producteur</p>
        </div>
      </div>
    </footer>
  );
}
