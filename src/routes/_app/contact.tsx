import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, Mail, MapPin, MessageCircle, MessagesSquare, Phone } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { openChat, telHref, useFarm } from "@/lib/farm";
import { whatsappLink } from "@/lib/orders";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/contact")({
  component: ContactPage,
  head: () => ({
    meta: [
      { title: "Contactez la ferme — MendyKounda" },
      {
        name: "description",
        content:
          "Discutez avec la ferme MendyKounda depuis la messagerie du site, par téléphone ou WhatsApp.",
      },
      { property: "og:title", content: "Contactez la ferme — MendyKounda" },
      {
        property: "og:description",
        content: "L'équipe MendyKounda répond à vos questions et demandes particulières.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ContactPage() {
  const farm = useFarm();
  const { user, isAdmin } = useAuth();
  const wa = farm.whatsapp ? whatsappLink(farm.whatsapp) : null;

  return (
    <div className="container-market py-10 md:py-16">
      <p className="editorial-eyebrow text-center">Contact</p>
      <h1 className="mt-3 text-balance text-center text-3xl font-medium tracking-tight md:text-5xl">
        À votre écoute.
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground md:text-base">
        Une question sur un produit, une commande ou une demande particulière ? Le plus simple :
        écrivez-nous dans la messagerie du site.
      </p>

      <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-3">
        {/* Messagerie (chat) : canal mis en avant */}
        <section className="flex flex-col rounded-lg border-2 border-primary bg-card p-6 shadow-soft md:col-span-3 md:flex-row md:items-center md:gap-6">
          <MessagesSquare className="h-10 w-10 shrink-0 text-primary" />
          <div className="mt-3 flex-1 md:mt-0">
            <h2 className="text-lg font-semibold">Discuter avec la ferme</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Posez vos questions directement depuis le site : nous vous répondons dans la
              messagerie, et vous retrouvez la conversation à tout moment avec la bulle en bas à
              droite de l'écran.
            </p>
          </div>
          <div className="mt-4 shrink-0 md:mt-0">
            {isAdmin ? (
              <Button asChild variant="outline">
                <Link to="/admin" search={{ tab: "messages" }}>
                  Voir les messages reçus
                </Link>
              </Button>
            ) : user ? (
              <Button onClick={openChat}>
                <MessageCircle className="h-4 w-4" /> Ouvrir la messagerie
              </Button>
            ) : (
              <Button asChild>
                <Link to="/auth" search={{ redirect: "/contact" }}>
                  Se connecter pour discuter
                </Link>
              </Button>
            )}
          </div>
        </section>

        {(farm.phone || wa) && (
          <section className="rounded-lg border border-border bg-card p-6">
            <Phone className="h-5 w-5 text-primary" />
            <h2 className="mt-3 font-semibold">Par téléphone</h2>
            {farm.phone && (
              <a href={telHref(farm.phone)} className="mt-2 block text-sm hover:text-primary">
                {farm.phone}
              </a>
            )}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            )}
          </section>
        )}

        {farm.email && (
          <section className="rounded-lg border border-border bg-card p-6">
            <Mail className="h-5 w-5 text-primary" />
            <h2 className="mt-3 font-semibold">Par e-mail</h2>
            <a
              href={`mailto:${farm.email}`}
              className="mt-2 block break-all text-sm hover:text-primary"
            >
              {farm.email}
            </a>
          </section>
        )}

        <section className="rounded-lg border border-border bg-card p-6">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-semibold">{farm.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {farm.address && (
              <>
                {farm.address}
                <br />
              </>
            )}
            {farm.location}
          </p>
        </section>

        {farm.opening_hours && (
          <section className="rounded-lg border border-border bg-card p-6">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="mt-3 font-semibold">Horaires</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {farm.opening_hours}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
