import { createFileRoute, Link } from "@tanstack/react-router";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/_app/about")({
  component: AboutPage,
  head: () => ({ meta: [{ title: "Notre ferme — MendyKounda" }] }),
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
            Nos volailles, nos vaches et nos brebis vivent au grand air, sur des parcours herbeux.
            Nos œufs sont ramassés chaque matin, notre lait livré le jour même, nos viandes
            maturées avec patience.
          </p>
          <p>
            Pas d'intermédiaire, pas de circuit long. Du pré à votre table, tout simplement.
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
