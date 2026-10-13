import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/legal-text";

export const Route = createFileRoute("/_app/cgv")({
  component: () => <LegalPageView page="terms" />,
  head: () => ({
    meta: [
      { title: "Conditions générales de vente — MendyKounda" },
      {
        name: "description",
        content:
          "Livraison, paiement, annulation, pesée réelle et réclamations sur la boutique de la ferme MendyKounda.",
      },
    ],
  }),
});
