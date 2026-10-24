import type { Metadata } from "next";
import { PageHead } from "@/components/layout/PageHead";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { PortfolioView } from "@/components/portfolio/PortfolioView";

export const metadata: Metadata = { title: "Cartera" };

export default function Page() {
  return (
    <>
      <PageHead
        title="Cartera"
        description="Visión general de los proyectos activos y su estado."
        actions={
          <ButtonLink href="/opportunities/new" variant="primary">
            Nueva oportunidad
          </ButtonLink>
        }
      />
      <PortfolioView />
    </>
  );
}
