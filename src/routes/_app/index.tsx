import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRef } from "react";
import Autoplay from "embla-carousel-autoplay";
import { Beef, ChevronRight, Clock3, Egg, Milk, ShieldCheck, Truck } from "lucide-react";
import { categoriesQuery, productsQuery } from "@/lib/queries";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/_app/")({
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(productsQuery({ featuredOnly: true })).catch(() => {}), context.queryClient.ensureQueryData(categoriesQuery()).catch(() => {})]); },
  component: HomePage,
  head: () => ({ meta: [
    { title: "MendyKounda — Produits fermiers au Sénégal" },
    { name: "description", content: "Volailles, œufs, lait et viandes fermières livrés directement du producteur au Sénégal." },
    { property: "og:title", content: "MendyKounda — Produits fermiers au Sénégal" },
    { property: "og:description", content: "Commandez des produits fermiers frais, locaux et soigneusement élevés." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
});

function HomePage() {
  const { data: featured } = useSuspenseQuery(productsQuery({ featuredOnly: true }));
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const autoplay = useRef(Autoplay({ delay: 3500, stopOnInteraction: false, stopOnMouseEnter: true }));
  const categoryIcons = [Beef, Egg, Milk, Beef];
  return (
    <div className="bg-secondary/50 pb-10">
      <section className="container-market grid gap-3 py-3 lg:grid-cols-[220px_minmax(0,1fr)_220px]">
        <aside className="hidden rounded-md bg-card p-2 shadow-soft lg:block">
          <p className="border-b border-border px-3 py-2 text-sm font-semibold">Nos catégories</p>
          <nav className="py-1">{categories.map((category, index) => { const Icon = categoryIcons[index % categoryIcons.length]; return <Link key={category.id} to="/shop" search={{ category: category.slug }} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-secondary hover:text-primary"><Icon className="h-4 w-4" /> <span className="min-w-0 flex-1 truncate">{category.name}</span><ChevronRight className="h-3 w-3" /></Link>; })}</nav>
        </aside>
        <div className="relative isolate min-h-[320px] overflow-hidden rounded-md md:min-h-[400px] lg:min-h-[430px]">
          <img src={hero} alt="Élevage MendyKounda en plein air" width={1920} height={1080} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-foreground/40" />
          <div className="relative flex min-h-[320px] max-w-xl flex-col justify-end p-6 text-primary-foreground md:min-h-[400px] md:p-10 lg:min-h-[430px]">
            <p className="mb-2 text-xs font-semibold uppercase">Directement de notre ferme</p>
            <h1 className="text-3xl font-semibold leading-tight md:text-5xl">Le frais du Sénégal, livré chez vous.</h1>
            <p className="mt-3 max-w-md text-sm text-primary-foreground/85 md:text-base">Des produits fermiers sélectionnés, des prix transparents et une commande simple.</p>
            <Button className="mt-6 w-fit bg-accent text-accent-foreground hover:bg-accent/90" asChild><Link to="/shop">Découvrir la boutique <ChevronRight /></Link></Button>
          </div>
        </div>
        <aside className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Link to="/shop" search={{ sort: "newest" }} className="flex min-h-32 flex-col justify-between rounded-md bg-primary p-4 text-primary-foreground shadow-soft"><Clock3 /><span><strong className="block text-lg">Arrivages frais</strong><small>Découvrez les nouveautés</small></span></Link>
          <Link to="/contact" className="flex min-h-32 flex-col justify-between rounded-md bg-accent p-4 text-accent-foreground shadow-soft"><Truck /><span><strong className="block text-lg">Livraison locale</strong><small>Organisons votre livraison</small></span></Link>
        </aside>
      </section>

      <section className="container-market py-3 lg:hidden">
        <div className="flex gap-3 overflow-x-auto pb-2">{categories.map((category, index) => { const Icon = categoryIcons[index % categoryIcons.length]; return <Link key={category.id} to="/shop" search={{ category: category.slug }} className="flex w-20 shrink-0 flex-col items-center gap-2 text-center text-xs"><span className="grid h-14 w-14 place-items-center rounded-full bg-card shadow-soft"><Icon className="h-6 w-6 text-primary" /></span><span className="line-clamp-2">{category.name}</span></Link>; })}</div>
      </section>

      <section className="container-market py-3">
        <div className="grid grid-cols-2 gap-2 rounded-md bg-card p-3 shadow-soft md:grid-cols-4">{[
          [Truck, "Livraison au Sénégal", "Service de proximité"], [ShieldCheck, "Qualité contrôlée", "Produits soigneusement suivis"], [Clock3, "Produits frais", "Préparés avec soin"], [Egg, "Direct producteur", "Sans intermédiaire"],
        ].map(([Icon, title, text]) => { const ItemIcon = Icon as typeof Truck; return <div key={String(title)} className="flex min-w-0 items-center gap-3 p-2"><ItemIcon className="h-6 w-6 shrink-0 text-primary" /><span className="min-w-0"><strong className="block text-xs sm:text-sm">{String(title)}</strong><small className="hidden text-muted-foreground sm:block">{String(text)}</small></span></div>; })}</div>
      </section>

      <section className="container-market py-3">
        <div className="rounded-md bg-card shadow-soft">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-xs font-semibold uppercase text-primary">Sélection MendyKounda</p><h2 className="text-xl font-semibold md:text-2xl">Les produits du moment</h2></div><Link to="/shop" className="flex shrink-0 items-center text-sm font-semibold text-primary">Tout voir <ChevronRight /></Link></div>
          <div className="p-2 sm:p-4"><Carousel opts={{ align: "start", loop: true }} plugins={[autoplay.current]}><CarouselContent className="-ml-2 sm:-ml-4">{featured.map((product) => <CarouselItem key={product.id} className="basis-1/2 pl-2 sm:basis-1/3 sm:pl-4 lg:basis-1/4 xl:basis-1/5"><ProductCard product={product} /></CarouselItem>)}</CarouselContent><CarouselPrevious className="hidden md:flex" /><CarouselNext className="hidden md:flex" /></Carousel></div>
        </div>
      </section>
    </div>
  );
}
