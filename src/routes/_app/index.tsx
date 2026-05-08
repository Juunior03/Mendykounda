/**
 * Home — editorial hero, featured products, story.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRef } from "react";
import Autoplay from "embla-carousel-autoplay";
import { productsQuery } from "@/lib/queries";
import { ProductCard } from "@/components/product-card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/_app/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(productsQuery({ featuredOnly: true })).catch(() => {});
  },
  component: HomePage,
  head: () => ({
    meta: [
      { title: "MendyKounda — Élevage fermier premium" },
      {
        name: "description",
        content:
          "Volailles, œufs, lait et viandes fermières issus d'un élevage en plein air. Direct producteur.",
      },
    ],
  }),
});

function HomePage() {
  const { data: featured } = useSuspenseQuery(productsQuery({ featuredOnly: true }));
  const autoplay = useRef(
    Autoplay({ delay: 3500, stopOnInteraction: false, stopOnMouseEnter: true }),
  );

  return (
    <>
      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        <img
          src={hero}
          alt="Poules en plein air au lever du soleil"
          width={1920}
          height={1080}
          className="h-[60vh] min-h-[420px] w-full object-cover sm:h-[70vh] md:h-[78vh] md:min-h-[520px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/30 to-background/10" />
        <div className="container-editorial absolute inset-x-0 bottom-0 pb-16 md:pb-24">
          <div className="max-w-2xl fade-in-up">
            <p className="editorial-eyebrow mb-4 text-foreground/80">Ferme MendyKounda · Depuis 1987</p>
            <h1 className="text-balance text-4xl font-medium leading-[1.05] tracking-tight md:text-6xl">
              L'élevage fermier,<br />tel qu'il devrait être.
            </h1>
            <p className="mt-5 max-w-lg text-pretty text-base text-foreground/75 md:text-lg">
              Volailles, œufs, lait cru et viandes — élevés au grand air, livrés directement
              de notre pré à votre table.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <Link
                to="/shop"
                className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Découvrir la boutique
              </Link>
              <Link
                to="/about"
                className="rounded-md border border-border bg-background/70 px-6 py-3 text-sm font-medium backdrop-blur transition-colors hover:bg-background"
              >
                Notre histoire
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section className="container-editorial py-20 md:py-28">
        <div className="grid gap-12 md:grid-cols-3">
          {[
            { eyebrow: "01", title: "Élevage en plein air", text: "Nos animaux disposent de vastes parcours herbeux toute l'année." },
            { eyebrow: "02", title: "Sans intermédiaire", text: "Du producteur à votre table — la juste rémunération du travail bien fait." },
            { eyebrow: "03", title: "Récolte du jour", text: "Œufs ramassés chaque matin, lait du jour, viandes maturées avec soin." },
          ].map((v) => (
            <div key={v.eyebrow} className="fade-in-up">
              <p className="editorial-eyebrow">{v.eyebrow}</p>
              <h3 className="mt-4 text-2xl font-medium tracking-tight">{v.title}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{v.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED */}
      <section className="bg-cream py-20 md:py-28">
        <div className="container-editorial">
          <div className="mb-12 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="editorial-eyebrow">Sélection</p>
              <h2 className="mt-3 text-3xl font-medium tracking-tight md:text-4xl">
                Les essentiels du moment
              </h2>
            </div>
            <Link to="/shop" className="underline-grow text-sm font-medium">
              Voir toute la boutique →
            </Link>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      {/* STORY */}
      <section className="container-editorial py-24 md:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <p className="editorial-eyebrow">Notre engagement</p>
          <h2 className="mt-4 text-balance text-3xl font-medium tracking-tight md:text-5xl">
            Le bon goût, sans compromis.
          </h2>
          <p className="mt-6 text-pretty text-base text-muted-foreground md:text-lg">
            Nous croyons qu'un élevage respectueux donne des produits incomparables.
            Cette conviction guide chacun de nos gestes, depuis trois générations.
          </p>
          <Link
            to="/about"
            className="mt-8 inline-block underline-grow text-sm font-medium"
          >
            Découvrir notre histoire →
          </Link>
        </div>
      </section>
    </>
  );
}
