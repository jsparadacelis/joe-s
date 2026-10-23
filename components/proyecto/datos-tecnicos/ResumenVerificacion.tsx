import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";

export type ResumenVerificacionProps = {
  pendientes: number;
  editados: number;
  deshabilitado: boolean;
  onMarcarTodo: () => void;
};

export function ResumenVerificacion({ pendientes, editados, deshabilitado, onMarcarTodo }: ResumenVerificacionProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div aria-live="polite" className="flex flex-wrap items-center gap-2">
        <StatusChip tone={pendientes ? "warn" : "ok"}>
          {pendientes ? `${pendientes} sin verificar` : "Todo verificado"}
        </StatusChip>
        {editados ? <StatusChip tone="warn">{`${editados} editados`}</StatusChip> : null}
      </div>
      <Button size="sm" disabled={deshabilitado} onClick={onMarcarTodo}>
        Marcar todo como verificado
      </Button>
    </div>
  );
}
