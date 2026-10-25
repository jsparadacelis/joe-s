import { Panel } from "@/components/ui/Panel";
import { SheetBlock } from "@/components/project/sheet/SheetBlock";
import { fieldLabel, type ProjectSheet as ProjectSheetModel } from "@/lib/sheet";

export function ProjectSheet({ sheet }: { sheet: ProjectSheetModel }) {
  const { filled, required, percent } = sheet.completion;
  const missing = sheet.blocks.flatMap((b) => b.fields.filter((f) => f.required && f.value === null));
  return (
    <Panel title="Ficha del proyecto" description="Solo lectura. Los campos obligatorios vacíos están marcados.">
      <div role="status" aria-live="polite" className="flex flex-col gap-1.5 rounded-base bg-surface-2 px-3 py-2.5">
        <p className="text-m">
          <strong className="font-semibold">{percent} %</strong> completa · {filled} de {required} campos obligatorios
        </p>
        {missing.length > 0 ? (
          <div className="text-s text-muted">
            <p>Faltan por rellenar:</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
              {missing.map((f) => (
                <li key={f.field}>{fieldLabel(f.field)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        {sheet.blocks.map((block) => (
          <SheetBlock key={block.block} block={block} />
        ))}
      </div>
    </Panel>
  );
}
