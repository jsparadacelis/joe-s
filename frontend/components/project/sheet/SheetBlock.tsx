"use client";

import { useEffect, useRef, useState } from "react";
import { SheetBlockForm, type SheetFormProps } from "@/components/project/sheet/SheetBlockForm";
import { Button } from "@/components/ui/Button";
import {
  blockLabel,
  fieldInputKind,
  fieldLabel,
  planBreakdown,
  sheetValueText,
  weeksText,
  type ProjectSheet,
  type SheetBlockData,
  type SheetField,
} from "@/lib/sheet";

const MISSING_MARK = "rounded-base bg-bad-soft px-2 py-0.5 text-xs font-medium text-bad";
const SCORING_MARK = "rounded-base bg-surface-2 px-2 py-0.5 text-xs text-muted";

function FieldValue({ field }: { field: SheetField }) {
  const text = sheetValueText(field);
  if (text === null) {
    return field.required ? <span className={MISSING_MARK}>Obligatorio · falta</span> : <span className="text-muted">—</span>;
  }
  return (
    <>
      <span className="min-w-0 break-words text-m">{text}</span>
      {field.source === "scoring" ? <span className={SCORING_MARK}>del scoring</span> : null}
      {field.source === "auto" ? <span className={SCORING_MARK}>automático</span> : null}
      {typeof field.value === "object" && field.value !== null ? (
        <ul className="mt-1 flex w-full flex-col gap-0.5 text-s text-muted">
          {planBreakdown(field.value).map((row) => (
            <li key={row.phase} className="flex justify-between gap-3">
              <span>{row.name}</span>
              <span>{weeksText(row.weeks)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export interface SheetBlockProps extends Partial<Pick<SheetFormProps, "save" | "loadPlan">> {
  block: SheetBlockData;
  /** Project code, for the default save. */
  code?: string;
  /** Shows «Editar» (only if the block has fields a person can type). */
  editable?: boolean;
  /** Receives the sheet the API returned after a save. */
  onSaved?: (sheet: ProjectSheet) => void;
}

export function SheetBlock({ block, code = "", editable = false, save, loadPlan, onSaved }: SheetBlockProps) {
  const missing = block.required - block.filled;
  const headingId = `sheet-block-${block.block}`;
  const label = blockLabel(block.block);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const pending = useRef<"edit" | "notice" | null>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const canEdit = editable && block.fields.some((f) => fieldInputKind(f.field) !== null);

  // Focus moves after the render that creates its target.
  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    (target === "edit" ? editRef.current : noticeRef.current)?.focus();
  });

  function finish(next: "edit" | "notice") {
    pending.current = next;
    setEditing(false);
  }

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2 rounded-base border border-hair p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-m font-semibold">
          {label}
        </h3>
        <div className="flex items-center gap-2">
          {block.complete ? (
            <span className="rounded-base bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">Completo</span>
          ) : (
            <span className="rounded-base bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
              {missing === 1 ? "Falta 1" : `Faltan ${missing}`}
            </span>
          )}
          {canEdit && !editing ? (
            <Button
              ref={editRef}
              size="sm"
              onClick={() => {
                setSaved(false);
                setEditing(true);
              }}
            >
              {`Editar ${label}`}
            </Button>
          ) : null}
        </div>
      </div>
      {saved && !editing ? (
        <div
          ref={noticeRef}
          role="status"
          tabIndex={-1}
          className="rounded-base bg-ok-soft px-3 py-2 text-s text-ok focus-visible:outline-2 focus-visible:outline-point"
        >
          Cambios guardados
        </div>
      ) : null}
      {editing ? (
        <SheetBlockForm
          block={block}
          code={code}
          save={save}
          loadPlan={loadPlan}
          onCancel={() => finish("edit")}
          onSaved={(sheet) => {
            setSaved(true);
            finish("notice");
            onSaved?.(sheet);
          }}
        />
      ) : (
        <ul className="flex flex-col border-b border-hair">
          {block.fields.map((field) => (
            <li key={field.field} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-hair py-2">
              <span className="w-52 shrink-0 text-s text-muted">{fieldLabel(field.field)}</span>
              <FieldValue field={field} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
