import { Link } from "@tanstack/react-router";
import { useFarm } from "@/lib/farm";
import {
  LEGAL_PAGES,
  legalDate,
  legalText,
  parseInline,
  parseLegal,
  type LegalPage,
} from "@/lib/legal";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) =>
        p.type === "bold" ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.text}
          </strong>
        ) : p.type === "link" ? (
          p.href.startsWith("/") ? (
            <Link key={i} to={p.href as "/"} className="text-primary underline">
              {p.text}
            </Link>
          ) : (
            <a
              key={i}
              href={p.href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              {p.text}
            </a>
          )
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Affiche un texte légal (titres, paragraphes, listes). */
export function LegalText({ text }: { text: string }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-muted-foreground md:text-base">
      {parseLegal(text).map((b, i) =>
        b.type === "h2" ? (
          <h2 key={i} className="pt-4 text-lg font-semibold text-foreground md:text-xl">
            <Inline text={b.text} />
          </h2>
        ) : b.type === "ul" ? (
          <ul key={i} className="list-disc space-y-1.5 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inline text={b.text} />
          </p>
        ),
      )}
    </div>
  );
}

/** Page complète : titre, date de mise à jour et texte. */
export function LegalPageView({ page }: { page: LegalPage }) {
  const farm = useFarm();
  const { title } = LEGAL_PAGES[page];
  const date = new Date(legalDate(page, farm)).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const other = LEGAL_PAGES[page === "terms" ? "privacy" : "terms"];
  return (
    <div className="container-editorial max-w-3xl py-10 md:py-16">
      <p className="editorial-eyebrow">Informations légales</p>
      <h1 className="mt-3 text-balance text-3xl font-medium tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-2 text-xs text-muted-foreground">Dernière mise à jour : {date}</p>
      <div className="mt-8">
        <LegalText text={legalText(page, farm)} />
      </div>
      <p className="mt-12 border-t border-border pt-6 text-sm">
        Voir aussi :{" "}
        <Link to={other.path} className="text-primary underline">
          {other.title}
        </Link>
      </p>
    </div>
  );
}
