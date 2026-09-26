import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/contact")({
  component: ContactPage,
  head: () => ({ meta: [
    { title: "Contactez la ferme — MendyKounda" },
    { name: "description", content: "Contactez MendyKounda pour une commande ou une demande particulière." },
    { property: "og:title", content: "Contactez la ferme — MendyKounda" },
    { property: "og:description", content: "L'équipe MendyKounda répond à vos questions et demandes particulières." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function ContactPage() {
  return (
    <div className="container-editorial py-20">
      <p className="editorial-eyebrow text-center">Contact</p>
      <h1 className="mt-3 text-center text-balance text-4xl font-medium tracking-tight md:text-5xl">
        À votre écoute.
      </h1>
      <div className="mx-auto mt-12 grid max-w-3xl gap-8 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-8">
          <p className="editorial-eyebrow">La ferme</p>
          <h3 className="mt-3 text-xl font-medium">Lieu-dit Kounda</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            12 chemin des Prés<br />79000 Niort
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-8">
          <p className="editorial-eyebrow">Nous joindre</p>
          <h3 className="mt-3 text-xl font-medium">Du lundi au samedi</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            <a href="mailto:contact@mendykounda.com" className="underline-grow">contact@mendykounda.com</a><br />
            06 12 34 56 78
          </p>
        </div>
      </div>
    </div>
  );
}
