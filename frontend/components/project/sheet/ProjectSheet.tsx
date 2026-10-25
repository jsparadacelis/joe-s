"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SheetBlock } from "@/components/project/sheet/SheetBlock";
import { fieldLabel, type ProjectSheet as ProjectSheetModel, type SheetUpdate } from "@/lib/sheet";
import type { ProposedPlan } from "@/lib/start";
import type { ProjectType, Scale } from "@/lib/plan-settings";

export interface ProjectSheetProps {
  sheet: ProjectSheetModel;
  /** Blocks get an «Editar» button (phase 1 only). */
  editable?: boolean;
  /** Saves a partial update; replaceable in tests. */
  save?: (update: SheetUpdate) => Promise<ProjectSheetModel>;
  /** Loads the proposed plan of a type and scale; replaceable in tests. */
  loadPlan?: (projectType: ProjectType, scale: Scale) => Promise<ProposedPlan>;
}

export function ProjectSheet({ sheet: initial, editable = false, save, loadPlan }: ProjectSheetProps) {
  // The API answers every save with the whole sheet: it replaces this state.
  const [sheet, setSheet] = useState(initial);
  const { filled, required, percent } = sheet.completion;
  const missing = sheet.blocks.flatMap((b) => b.fields.filter((f) => f.required && f.value === null));
  return (
    <Panel title="Ficha del proyecto" description={
        editable
          ? "Edita cada bloque y guarda. Los campos obligatorios vacíos están marcados."
          : "Solo lectura. Los campos obligatorios vacíos están marcados."
      }>
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
          <SheetBlock
            key={block.block}
            block={block}
            code={sheet.code}
            editable={editable}
            save={save}
            onSaved={setSheet}
            loadPlan={loadPlan}
          />
        ))}
      </div>
    </Panel>
  );
}
