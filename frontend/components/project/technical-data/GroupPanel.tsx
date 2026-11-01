import { Panel } from "@/components/ui/Panel";
import type { TechnicalDatum, DatumDefinition, DataGroup } from "@/lib/technical-data";
import { DatumRow, type DatumRowProps } from "./DatumRow";

export type GroupPanelProps = {
  group: DataGroup;
  definitions: readonly DatumDefinition[];
  /** Data by id; each row always receives the same reference while its datum does not change. */
  data: ReadonlyMap<string, TechnicalDatum>;
  disabled: boolean;
  /** Ids with a pending request. */
  saving: ReadonlySet<string>;
  /** Server messages by datum id. */
  errors: Readonly<Record<string, string>>;
  onValueChange: DatumRowProps["onValueChange"];
  onVerify: DatumRowProps["onVerify"];
  onRestore: DatumRowProps["onRestore"];
  onEditStart: DatumRowProps["onEditStart"];
};

export function GroupPanel({ group, definitions, data, disabled, saving, errors, onValueChange, onVerify, onRestore, onEditStart }: GroupPanelProps) {
  return (
    <Panel title={group.name} description={group.description} headingLevel={3}>
      <ul className="flex flex-col">
        {definitions.map((definition) => {
          const datum = data.get(definition.id);
          return datum ? (
            <DatumRow
              key={definition.id}
              definition={definition}
              datum={datum}
              disabled={disabled}
              saving={saving.has(definition.id)}
              error={errors[definition.id]}
              onValueChange={onValueChange}
              onVerify={onVerify}
              onRestore={onRestore}
              onEditStart={onEditStart}
            />
          ) : null;
        })}
      </ul>
    </Panel>
  );
}
