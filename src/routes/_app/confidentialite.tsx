import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/legal-text";

export const Route = createFileRoute("/_app/confidentialite")({
  component: () => <LegalPageView page="privacy" />,
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — MendyKounda" },
      {
        name: "description",
        content:
          "Quelles informations la ferme MendyKounda recueille, à quoi elles servent et comment exercer vos droits.",
      },
    ],
  }),
});
