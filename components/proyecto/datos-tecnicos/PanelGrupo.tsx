import { Panel } from "@/components/ui/Panel";
import type { DatoTecnico, DefinicionDato, Grupo } from "@/lib/datos-tecnicos";
import { FilaDato, type FilaDatoProps } from "./FilaDato";

export type PanelGrupoProps = {
  grupo: Grupo;
  definiciones: readonly DefinicionDato[];
  /** Datos por id; cada fila recibe siempre la misma referencia mientras su dato no cambia. */
  datos: ReadonlyMap<string, DatoTecnico>;
  deshabilitado: boolean;
  onCambiar: FilaDatoProps["onCambiar"];
  onVerificar: FilaDatoProps["onVerificar"];
  onRestaurar: FilaDatoProps["onRestaurar"];
};

export function PanelGrupo({ grupo, definiciones, datos, deshabilitado, onCambiar, onVerificar, onRestaurar }: PanelGrupoProps) {
  return (
    <Panel title={grupo.nombre} description={grupo.descripcion} headingLevel={3}>
      <ul className="flex flex-col">
        {definiciones.map((definicion) => {
          const dato = datos.get(definicion.id);
          return dato ? (
            <FilaDato
              key={definicion.id}
              definicion={definicion}
              dato={dato}
              deshabilitado={deshabilitado}
              onCambiar={onCambiar}
              onVerificar={onVerificar}
              onRestaurar={onRestaurar}
            />
          ) : null;
        })}
      </ul>
    </Panel>
  );
}
