import type { ReactNode } from "react";

type PanelSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

// Faixa chapada: separada da próxima por hairline, sem moldura por seção.
export function PanelSection({ title, description, children }: PanelSectionProps) {
  return (
    <section className="border-b border-border pb-6 last:border-b-0 last:pb-0">
      <div className="mb-3 space-y-1">
        <div className="text-[13px] font-semibold text-foreground">{title}</div>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
