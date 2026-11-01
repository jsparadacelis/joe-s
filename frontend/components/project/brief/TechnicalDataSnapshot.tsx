import { sourceLabel, type BriefDatum, type BriefTechnicalData } from "@/lib/brief";
import { DEFINITIONS } from "@/lib/technical-data";

const LABEL_BY_ID = new Map(DEFINITIONS.map((d) => [d.id, d.label]));
const labelOf = (id: string) => LABEL_BY_ID.get(id) ?? id;
const HEADERS = ["Dato", "Valor", "Origen", "Original", "Editado", "Verificado"];
const CELL = "break-words border-b border-hair px-3 py-2 text-left align-top";

const queryDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-ES", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

function verifiedCell(datum: BriefDatum) {
  if (datum.value === "") return "—";
  if (datum.verified) return "Sí";
  return <span className="font-medium text-warn">Sin verificar</span>;
}

/** Read-only list of the technical data frozen with the brief (RGB-32b), with origin, original, edited and verified. */
export function TechnicalDataSnapshot({ technicalData }: { technicalData: BriefTechnicalData }) {
  const { cadastral_reference, queried_at, unverified, data } = technicalData;
  return (
    <section aria-label="Datos técnicos congelados" className="flex flex-col gap-3">
      <h3 className="text-m font-semibold">Datos técnicos congelados</h3>
      {cadastral_reference || queried_at ? (
        <p className="text-s text-muted">
          {cadastral_reference ? `Referencia catastral: ${cadastral_reference}` : null}
          {cadastral_reference && queried_at ? " · " : null}
          {queried_at ? `Consultado el ${queryDate(queried_at)}` : null}
        </p>
      ) : null}
      {data.length === 0 ? (
        <p className="text-s text-muted">No se obtuvo ningún dato técnico.</p>
      ) : (
        <>
          {unverified.length > 0 ? (
            <p className="rounded-base bg-warn-soft px-3 py-2 text-s text-warn">
              {`${unverified.length} ${unverified.length === 1 ? "dato técnico" : "datos técnicos"} sin verificar: ${unverified.map(labelOf).join(", ")}`}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table aria-label="Datos técnicos congelados" className="w-full border-collapse text-s">
              <thead>
                <tr>
                  {HEADERS.map((h) => (
                    <th key={h} scope="col" className={`${CELL} font-medium text-muted`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id}>
                    <td className={`${CELL} font-medium`}>{labelOf(d.id)}</td>
                    <td className={CELL}>{d.value === "" ? <span className="text-muted">Sin valor</span> : d.value}</td>
                    <td className={CELL}>{sourceLabel(d.source)}</td>
                    <td className={CELL}>{d.original ?? "—"}</td>
                    <td className={CELL}>{d.edited ? "Sí" : "No"}</td>
                    <td className={CELL}>{verifiedCell(d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
