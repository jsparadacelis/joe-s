import type { PortfolioSummary as Summary } from "@/lib/portfolio";

export type PortfolioSummaryProps = {
  summary: Summary;
};

export function PortfolioSummary({ summary }: PortfolioSummaryProps) {
  const stats = [
    { label: "Proyectos activos", value: summary.active },
    { label: "En riesgo", value: summary.atRisk },
    { label: "Hitos en 7 días", value: summary.milestonesIn7Days },
    { label: "Fichas desactualizadas", value: summary.staleSheets },
  ];
  return (
    <section aria-label="Resumen de la cartera">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="rounded-base border border-hair bg-surface px-4 py-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
