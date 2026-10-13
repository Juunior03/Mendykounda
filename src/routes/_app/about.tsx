import { createFileRoute, Link } from "@tanstack/react-router";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/_app/about")({
  component: AboutPage,
  head: () => ({ meta: [
    { title: "Notre ferme — MendyKounda" },
    { name: "description", content: "Découvrez l'histoire, les cultures et l'élevage de la ferme MendyKounda." },
    { property: "og:title", content: "Notre ferme — MendyKounda" },
    { property: "og:description", content: "Une ferme familiale engagée pour des produits locaux de qualité au Sénégal." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function AboutPage() {
  return (
    <>
      <section className="relative h-[60vh] min-h-[400px] overflow-hidden">
        <img src={hero} alt="Notre élevage" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
        <div className="container-editorial absolute inset-x-0 bottom-0 pb-12">
          <p className="editorial-eyebrow">Depuis 1987</p>
          <h1 className="mt-3 text-balance text-4xl font-medium tracking-tight md:text-6xl">
            Trois générations,<br />une même passion.
          </h1>
        </div>
      </section>
      <section className="container-editorial py-20">
        <div className="mx-auto max-w-2xl space-y-6 text-pretty text-base text-muted-foreground md:text-lg">
          <p>
            La ferme MendyKounda est née d'une conviction simple : un animal élevé avec respect
            donne un produit incomparable. Trois générations plus tard, cette intuition guide
            toujours chacun de nos gestes.
          </p>
          <p>
            Nous cultivons des légumes et des fruits au fil des saisons, et nos volailles et nos
            porcs sont élevés au grand air. Les volailles se vendent vivantes ou en poulet de chair
            au kilo, déplumé, vidé et emballé. Les cochons, de lait ou adultes, se vendent sur pied
            ou en viande selon les jours d'abattage. Nos œufs sont ramassés chaque matin, et nous
            préparons aussi du lait et des jus.
          </p>
          <p>
            Pas d'intermédiaire, pas de circuit long. Du champ et de l'élevage à votre table, tout simplement.
          </p>
        </div>
        <div className="mt-12 text-center">
          <Link to="/shop" className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground">
            Visiter la boutique
          </Link>
        </div>
      </section>
    </>
  );
}
