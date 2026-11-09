import { StatusChip, type StatusTone } from "@/components/ui/StatusChip";
import type { Alert, AlertSeverity } from "@/lib/alerts-api";
import { DEFINITIONS } from "@/lib/technical-data";

export type AlertsPanelProps = { alerts: Alert[] };

const LABELS = new Map(DEFINITIONS.map((d) => [d.id, d.label]));

// Severity is always written out: colour alone is not enough.
const SEVERITY: Record<AlertSeverity, { label: string; tone: StatusTone }> = {
  warning: { label: "Aviso", tone: "warn" },
  info: { label: "Información", tone: "neutral" },
};

/** Cross-data alerts: they only inform, nothing here changes a datum. */
export function AlertsPanel({ alerts }: AlertsPanelProps) {
  if (alerts.length === 0) return null;
  return (
    <section aria-label="Alertas de los datos" className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {alerts.map((alert) => {
          const { label, tone } = SEVERITY[alert.severity];
          const fields = alert.fields.map((id) => LABELS.get(id) ?? id);
          return (
            <li key={alert.code} className="flex flex-col gap-1 rounded-base border border-hair bg-surface p-3 text-s">
              <span>
                <StatusChip tone={tone}>{label}</StatusChip>
              </span>
              <p className="text-ink">{alert.message}</p>
              <p className="text-muted">{alert.suggestion}</p>
              {fields.length > 0 ? <p className="text-xs text-muted">Datos afectados: {fields.join(", ")}</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
