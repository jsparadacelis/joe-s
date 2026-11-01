"use client";

import { useState } from "react";
import { BriefForm } from "@/components/project/brief/BriefForm";
import { BriefPromotePanel } from "@/components/project/brief/BriefPromotePanel";
import { TechnicalDataSnapshot } from "@/components/project/brief/TechnicalDataSnapshot";
import { Panel } from "@/components/ui/Panel";
import type { Brief, BriefUpdate, PromoteBriefResult } from "@/lib/brief";

export interface BriefScreenProps {
  brief: Brief;
  /** Saves the changed fields; replaceable in tests. */
  save?: (update: BriefUpdate) => Promise<Brief>;
  /** Promotes to Anteproyecto and freezes the brief; replaceable in tests. */
  promote?: () => Promise<PromoteBriefResult>;
}

/** Brief of phase 2 (RGB-32b): editable draft and promotion, or the frozen version 1 in read-only. */
export function BriefScreen({ brief: initial, save, promote }: BriefScreenProps) {
  // The API answers every save with the whole brief: it replaces this state.
  const [brief, setBrief] = useState(initial);
  // A new brief handed in by the parent replaces the one held here (adjusting state while rendering).
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setBrief(initial);
  }
  const [promoted, setPromoted] = useState(false);
  const frozen = brief.frozen_version !== null;
  return (
    <Panel
      title="Brief"
      description={
        brief.permissions.can_edit
          ? "Redacta el brief y guarda. Los campos obligatorios están marcados."
          : "Solo lectura."
      }
    >
      {frozen ? (
        <p className="rounded-base bg-surface-2 px-3 py-2 text-s font-medium">{`Brief v${brief.frozen_version} congelado · solo lectura`}</p>
      ) : null}
      {!frozen || promoted ? (
        <BriefPromotePanel
          brief={brief}
          promote={promote}
          onPromoted={(result) => {
            setPromoted(true);
            setBrief(result.brief);
          }}
        />
      ) : null}
      <BriefForm brief={brief} save={save} onSaved={setBrief} />
      {frozen ? <TechnicalDataSnapshot technicalData={brief.technical_data} /> : null}
    </Panel>
  );
}
