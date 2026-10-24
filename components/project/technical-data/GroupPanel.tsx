import { Panel } from "@/components/ui/Panel";
import type { TechnicalDatum, DatumDefinition, DataGroup } from "@/lib/technical-data";
import { DatumRow, type DatumRowProps } from "./DatumRow";

export type GroupPanelProps = {
  group: DataGroup;
  definitions: readonly DatumDefinition[];
  /** Data by id; each row always receives the same reference while its datum does not change. */
  data: ReadonlyMap<string, TechnicalDatum>;
  disabled: boolean;
  onValueChange: DatumRowProps["onValueChange"];
  onVerify: DatumRowProps["onVerify"];
  onRestore: DatumRowProps["onRestore"];
};

export function GroupPanel({ group, definitions, data, disabled, onValueChange, onVerify, onRestore }: GroupPanelProps) {
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
              onValueChange={onValueChange}
              onVerify={onVerify}
              onRestore={onRestore}
            />
          ) : null;
        })}
      </ul>
    </Panel>
  );
}
