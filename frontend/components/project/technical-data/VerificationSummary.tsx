import type { Ref } from "react";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";

export type VerificationSummaryProps = {
  pending: number;
  edited: number;
  disabled: boolean;
  /** «Marcar todo» request pending. */
  verifying?: boolean;
  onMarkAll: () => void;
  buttonRef?: Ref<HTMLButtonElement>;
};

export function VerificationSummary({ pending, edited, disabled, verifying = false, onMarkAll, buttonRef }: VerificationSummaryProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div aria-live="polite" className="flex flex-wrap items-center gap-2">
        <StatusChip tone={pending ? "warn" : "ok"}>
          {pending ? `${pending} sin verificar` : "Todo verificado"}
        </StatusChip>
        {edited ? <StatusChip tone="warn">{`${edited} editados`}</StatusChip> : null}
      </div>
      <Button size="sm" ref={buttonRef} disabled={disabled} onClick={onMarkAll}>
        {verifying ? "Verificando…" : "Marcar todo como verificado"}
      </Button>
    </div>
  );
}
