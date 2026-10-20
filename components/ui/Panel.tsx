import type { ReactNode } from "react";

export type PanelProps = {
  title?: string;
  description?: string;
  /** Nivel del encabezado; por defecto 2. */
  headingLevel?: 2 | 3;
  children?: ReactNode;
};

export function Panel({ title, description, headingLevel = 2, children }: PanelProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className="flex min-w-0 flex-col gap-3.5 rounded-base border border-hair bg-surface p-[18px]">
      {title ? (
        <div className="flex flex-col gap-1">
          <Heading className="text-l font-semibold">{title}</Heading>
          {description ? <p className="text-s text-muted">{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
