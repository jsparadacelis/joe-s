import { Panel } from "@/components/ui/Panel";

export type EmptyStateProps = {
  title: string;
  description: string;
};

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <Panel>
      <div className="flex flex-col items-center gap-1 py-10 text-center">
        <p className="text-l font-semibold">{title}</p>
        <p className="text-s text-muted">{description}</p>
      </div>
    </Panel>
  );
}
