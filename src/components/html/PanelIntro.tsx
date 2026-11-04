import type { SceneStats } from "../../scene/types";

type PanelIntroProps = {
  sceneStats: SceneStats;
  solarIntensity: number;
};

export function PanelIntro({ sceneStats, solarIntensity }: PanelIntroProps) {
  return (
    <section className="border-b border-border pb-6">
      <div className="mono-label text-primary">Personalização</div>
      <h2 className="mt-1 text-lg font-semibold tracking-[-0.01em] text-foreground">
        Edifícios, material e luz
      </h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {sceneStats.buildings} edifícios ativos. Intensidade solar atual:{" "}
        {solarIntensity.toFixed(2)}.
      </p>
    </section>
  );
}
