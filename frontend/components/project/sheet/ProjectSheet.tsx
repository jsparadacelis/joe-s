"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SheetBlock } from "@/components/project/sheet/SheetBlock";
import { PromotePanel } from "@/components/project/sheet/PromotePanel";
import { fieldLabel, type ProjectSheet as ProjectSheetModel, type PromoteResult, type SheetUpdate } from "@/lib/sheet";
import type { ProposedPlan } from "@/lib/start";
import type { ProjectType, Scale } from "@/lib/plan-settings";

export interface ProjectSheetProps {
  sheet: ProjectSheetModel;
  /** Saves a partial update; replaceable in tests. */
  save?: (update: SheetUpdate) => Promise<ProjectSheetModel>;
  /** Loads the proposed plan of a type and scale; replaceable in tests. */
  loadPlan?: (projectType: ProjectType, scale: Scale) => Promise<ProposedPlan>;
  /** Promotes to Briefing and freezes the sheet; replaceable in tests. */
  promote?: () => Promise<PromoteResult>;
}

export function ProjectSheet({ sheet: initial, save, loadPlan, promote }: ProjectSheetProps) {
  // The API answers every save with the whole sheet: it replaces this state.
  const [sheet, setSheet] = useState(initial);
  // A new sheet handed in by the parent replaces the one held here (adjusting state while rendering).
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setSheet(initial);
  }
  // Once frozen (or promoted here) nobody edits; otherwise «Editar» follows the server's permission.
  const [promoted, setPromoted] = useState(false);
  const frozen = sheet.frozen_version !== null;
  const editable = sheet.permissions.can_edit && !frozen;
  const { filled, required, percent } = sheet.completion;
  const missing = sheet.blocks.flatMap((b) => b.fields.filter((f) => f.required && f.value === null));
  return (
    <Panel title="Ficha del proyecto" description={
        editable
          ? "Edita cada bloque y guarda. Los campos obligatorios vacíos están marcados."
          : "Solo lectura. Los campos obligatorios vacíos están marcados."
      }>
      {frozen ? (
        <p className="rounded-base bg-surface-2 px-3 py-2 text-s font-medium">{`Ficha v${sheet.frozen_version} congelada · solo lectura`}</p>
      ) : null}
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
      {!frozen || promoted ? (
        <PromotePanel
          sheet={sheet}
          promote={promote}
          onPromoted={(result) => {
            setPromoted(true);
            setSheet(result.sheet);
          }}
        />
      ) : null}
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
