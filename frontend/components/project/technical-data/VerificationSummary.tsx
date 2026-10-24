import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";

export type VerificationSummaryProps = {
  pending: number;
  edited: number;
  disabled: boolean;
  onMarkAll: () => void;
};

export function VerificationSummary({ pending, edited, disabled, onMarkAll }: VerificationSummaryProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div aria-live="polite" className="flex flex-wrap items-center gap-2">
        <StatusChip tone={pending ? "warn" : "ok"}>
          {pending ? `${pending} sin verificar` : "Todo verificado"}
        </StatusChip>
        {edited ? <StatusChip tone="warn">{`${edited} editados`}</StatusChip> : null}
      </div>
      <Button size="sm" disabled={disabled} onClick={onMarkAll}>
        Marcar todo como verificado
      </Button>
    </div>
  );
}
