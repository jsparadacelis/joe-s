import type { Metadata } from "next";
import { PageHead } from "@/components/layout/PageHead";
import { OpportunityForm } from "@/components/opportunities/OpportunityForm";

export const metadata: Metadata = { title: "Nueva oportunidad" };

export default function Page() {
  return (
    <>
      <PageHead
        title="Nueva oportunidad"
        description="Da de alta una oportunidad en fase 0. Aparecerá en la cartera sin plan hasta que se promueva."
      />
      <OpportunityForm />
    </>
  );
}
