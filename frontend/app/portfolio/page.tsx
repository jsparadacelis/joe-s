import type { Metadata } from "next";
import { PageHead } from "@/components/layout/PageHead";
import { PortfolioView } from "@/components/portfolio/PortfolioView";

export const metadata: Metadata = { title: "Cartera" };

export default function Page() {
  return (
    <>
      <PageHead title="Cartera" description="Visión general de los proyectos activos y su estado." />
      <PortfolioView />
    </>
  );
}
