import type { ReactNode } from "react";

export type PageHeadProps = {
  title: string;
  description?: string;
  /** Section actions (e.g. buttons). */
  actions?: ReactNode;
};

export function PageHead({ title, description, actions }: PageHeadProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-m text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
