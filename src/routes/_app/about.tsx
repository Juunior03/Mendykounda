import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import hero from "@/assets/hero.jpg";
import { DEFAULT_FARM, farmSettingsQuery, paragraphs } from "@/lib/farm";
import { resolveProductImage } from "@/lib/product-images";

export const Route = createFileRoute("/_app/about")({
  component: AboutPage,
  head: () => ({
    meta: [
      { title: "Notre ferme — MendyKounda" },
      {
        name: "description",
        content: "Découvrez l'histoire, les cultures et l'élevage de la ferme MendyKounda.",
      },
      { property: "og:title", content: "Notre ferme — MendyKounda" },
      {
        property: "og:description",
        content: "Une ferme familiale engagée pour des produits locaux de qualité au Sénégal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AboutPage() {
  const { data: farm, isLoading } = useQuery(farmSettingsQuery());
  const f = farm ?? DEFAULT_FARM;
  const image = resolveProductImage(f.about_image_url) ?? hero;

  return (
    <>
      <section className="relative h-[50vh] min-h-[360px] overflow-hidden md:h-[60vh]">
        <img src={image} alt={f.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/85 to-transparent" />
        <div className="container-editorial absolute inset-x-0 bottom-0 pb-10 md:pb-12">
          {f.about_eyebrow && <p className="editorial-eyebrow">{f.about_eyebrow}</p>}
          <h1 className="mt-3 max-w-3xl text-balance text-3xl font-medium tracking-tight md:text-6xl">
            {isLoading ? "\u00a0" : f.about_title}
          </h1>
        </div>
      </section>
      <section className="container-editorial py-14 md:py-20">
        <div className="mx-auto max-w-2xl space-y-6 text-pretty text-base text-muted-foreground md:text-lg">
          {isLoading ? (
            <div className="space-y-3" aria-hidden>
              <div className="h-4 rounded bg-secondary" />
              <div className="h-4 w-5/6 rounded bg-secondary" />
              <div className="h-4 w-2/3 rounded bg-secondary" />
            </div>
          ) : (
            paragraphs(f.about_body).map((p) => (
              <p key={p} className="whitespace-pre-line">
                {p}
              </p>
            ))
          )}
        </div>
        <div className="mt-12 text-center">
          <Link
            to="/shop"
            className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
          >
            Visiter la boutique
          </Link>
        </div>
      </section>
    </>
  );
}
